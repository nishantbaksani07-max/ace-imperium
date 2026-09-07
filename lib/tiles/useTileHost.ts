'use client'

import { useCallback, useEffect, useRef } from 'react'
import { tileStore } from './tileStore'

/**
 * useTileHost is the host side of the Vitality bridge, fixed for MANY tiles.
 *
 * The bug it fixes: the BUILD71 host closed a single storage key over one
 * message listener, so ANY tile's save overwrote whatever the host last
 * pointed at. Render two tiles and they clobber each other.
 *
 * The fix: keep a live Window to tileId map keyed by each iframe's
 * contentWindow. That WindowProxy is a stable reference and it equals
 * event.source for messages that frame posts, so every save/load is routed to
 * the tile whose window actually sent it. N tiles on one page each resolve to
 * their own key. No clobber.
 *
 * register(win, tileId) is called from each iframe instance (see TilePreview),
 * which captures its own tileId, so a late onLoad can never bind a window to
 * the wrong tile. unregister(win) drops a window when its iframe unmounts.
 *
 * The map is reset whenever userId changes, so a stale window mapping from a
 * previous user can never route one user's data into another's namespace.
 */
export function useTileHost(
  userId: string,
  onActivity?: (info: { tileId: string; type: 'save' | 'load' | 'report'; count: number }) => void,
  /**
   * Injected handler for a tile's Vitality.report() stream (one numeric life-stream
   * into Vee). Passed in (not imported) so this hook stays decoupled from the
   * server action; the create page wires reportStream here. The host only routes
   * and forwards; the server action validates + RLS-writes.
   */
  onReport?: (stream: unknown, tileId: string) => void | Promise<{ ok: boolean; error?: string } | void>,
) {
  const reg = useRef<WeakMap<Window, string>>(new WeakMap())

  // Windows allowed to invoke the gated 'ai' verb. Populated ONLY by the
  // caller passing { trusted: true } to register() on the first-party
  // featured-install path (the Studio tile), never derived from anything
  // the tile's own messages or HTML claim, since those are fully spoofable
  // (every tile flows through the same importTile socket). This is
  // defense-in-depth only: /api/studio/package re-verifies the session
  // server-side, which is the true security boundary.
  const trusted = useRef<WeakSet<Window>>(new WeakSet())

  // reset the map synchronously when the user changes (before any new register)
  const lastUser = useRef(userId)
  if (lastUser.current !== userId) {
    reg.current = new WeakMap()
    trusted.current = new WeakSet()
    lastUser.current = userId
  }

  const activity = useRef(onActivity)
  activity.current = onActivity

  const report = useRef(onReport)
  report.current = onReport

  const register = useCallback((win: Window | null, tileId: string, opts?: { trusted?: boolean }) => {
    if (win) {
      reg.current.set(win, tileId)
      if (opts?.trusted) trusted.current.add(win)
    }
  }, [])

  const unregister = useCallback((win: Window | null) => {
    if (win) {
      reg.current.delete(win)
      trusted.current.delete(win)
    }
  }, [])

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const msg = e.data
      if (!msg || msg.source !== 'vitality-tile') return
      const src = e.source as Window | null
      if (!src) return
      const tileId = reg.current.get(src)
      if (!tileId) return // unknown or unregistered sender, not one of ours

      if (msg.type === 'save') {
        const ok = tileStore.saveData(userId, tileId, msg.data)
        if (!ok) {
          // the write was dropped (over the per-tile cap or the storage quota).
          // Tell the tile instead of silently letting it believe it saved.
          src.postMessage({ source: 'vitality-host', type: 'save:error', id: msg.id, reason: 'too_large_or_full' }, '*')
          return
        }
        const count = Array.isArray(msg.data) ? msg.data.length : 0
        activity.current?.({ tileId, type: 'save', count })
        return
      }

      if (msg.type === 'load') {
        const data = tileStore.loadData(userId, tileId)
        // reply to the exact sender, never a broadcast. targetOrigin stays '*'
        // because a sealed srcDoc tile has an opaque (null) origin; the sender
        // is already verified via the registered e.source, and the payload is
        // the tile's own data going back to it.
        src.postMessage({ source: 'vitality-host', type: 'load:result', id: msg.id, data }, '*')
        const count = Array.isArray(data) ? data.length : 0
        activity.current?.({ tileId, type: 'load', count })
        return
      }

      if (msg.type === 'report') {
        // One numeric life-stream into Vee. The host only forwards the raw stream
        // plus the SENDER's tileId (from our own registry, never the iframe's
        // claim) so the stream's per-tile identity is trustworthy; the injected
        // handler (the server action) validates it and RLS-writes it under the
        // session user. The tile itself never blocks on Vee, but the HOST waits
        // for the write result before claiming success: the report activity only
        // fires when the datapoint actually landed, and a failed write posts
        // report:error back to the tile (mirroring save:error) so a dropped
        // report is never silently counted and displayed as a success.
        const res = report.current?.(msg.stream, tileId)
        Promise.resolve(res)
          .then((r) => {
            if (r && typeof r === 'object' && r.ok === false) {
              src.postMessage({ source: 'vitality-host', type: 'report:error', id: msg.id, reason: r.error || 'failed' }, '*')
              return
            }
            activity.current?.({ tileId, type: 'report', count: 1 })
          })
          .catch(() => {
            // transport-level failure of the voided server action: same honesty
            src.postMessage({ source: 'vitality-host', type: 'report:error', id: msg.id, reason: 'failed' }, '*')
          })
        return
      }

      if (msg.type === 'ai') {
        // Gated verb: the Studio tile asks the host to package a transcript /
        // notes / idea via Claude. Only a window registered with { trusted:
        // true } (the first-party Studio featured-install path) may invoke
        // this. Any other sender, including a community/sealed tile that
        // spoofs the same message shape, is refused with no fetch at all.
        if (!trusted.current.has(src)) {
          src.postMessage({ source: 'vitality-host', type: 'ai:error', id: msg.id, reason: 'forbidden' }, '*')
          return
        }
        // Whitelist only input/kind onto the request body, never spread msg,
        // so a spoofed extra field can never ride along to the server. The
        // route itself holds the real Anthropic key and re-checks the
        // session; this fetch just carries the session cookie.
        fetch('/api/studio/package', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input: msg.input, kind: msg.kind }),
        })
          .then(r => r.json().then(data => ({ ok: r.ok, data })))
          .then(({ ok, data }) => src.postMessage(
            ok
              ? { source: 'vitality-host', type: 'ai:result', id: msg.id, data }
              : { source: 'vitality-host', type: 'ai:error', id: msg.id, reason: data?.error || 'failed' },
            '*'))
          .catch(() => src.postMessage({ source: 'vitality-host', type: 'ai:error', id: msg.id, reason: 'failed' }, '*'))
        return
      }

      if (msg.type === 'studio:lookup') {
        // Gated verb: the Studio tile hands the host a pasted YouTube URL and
        // the host resolves it server-side (title, duration, captions when
        // public). Same trust gate as 'ai': refused with no fetch for any
        // window not registered { trusted: true }.
        if (!trusted.current.has(src)) {
          src.postMessage({ source: 'vitality-host', type: 'studio:lookup:error', id: msg.id, reason: 'forbidden' }, '*')
          return
        }
        // Whitelist only the url string; never spread msg.
        fetch('/api/studio/lookup', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: msg.url }),
        })
          .then(r => r.json().then(data => ({ ok: r.ok, data })))
          .then(({ ok, data }) => src.postMessage(
            ok
              ? { source: 'vitality-host', type: 'studio:lookup:result', id: msg.id, data }
              : { source: 'vitality-host', type: 'studio:lookup:error', id: msg.id, reason: data?.error || 'failed' },
            '*'))
          .catch(() => src.postMessage({ source: 'vitality-host', type: 'studio:lookup:error', id: msg.id, reason: 'failed' }, '*'))
        return
      }

      if (msg.type === 'studio:channel') {
        // Gated verb: keyless channel scan. The tile hands over a handle or
        // channel URL and the host resolves the channel's public RSS feed
        // server-side (recent titles + views), which powers voice-match and
        // the don't-repeat list with zero OAuth. Same trust gate as 'ai'.
        if (!trusted.current.has(src)) {
          src.postMessage({ source: 'vitality-host', type: 'studio:channel:error', id: msg.id, reason: 'forbidden' }, '*')
          return
        }
        // Whitelist only the channel string; never spread msg.
        fetch('/api/studio/channel', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ channel: msg.channel }),
        })
          .then(r => r.json().then(data => ({ ok: r.ok, data })))
          .then(({ ok, data }) => src.postMessage(
            ok
              ? { source: 'vitality-host', type: 'studio:channel:result', id: msg.id, data }
              : { source: 'vitality-host', type: 'studio:channel:error', id: msg.id, reason: data?.error || 'failed' },
            '*'))
          .catch(() => src.postMessage({ source: 'vitality-host', type: 'studio:channel:error', id: msg.id, reason: 'failed' }, '*'))
        return
      }

      if (msg.type === 'studio:claude') {
        // Gated verb: open claude.ai in a new tab for the zero-key AI path
        // (the tile copies its master prompt to the clipboard; the user
        // pastes it into their own Claude, then pastes the reply back). The
        // URL is fixed - nothing from the message rides into it - and the
        // sandboxed tile cannot open windows itself, so the host does it,
        // riding the user activation from the tap inside the iframe. Unlike
        // studio:connect this target is a third-party origin, so 'noopener'
        // stays ON and we accept its fuzzier return signal: null here does
        // NOT mean blocked, and the tile's copy never claims it was.
        if (!trusted.current.has(src)) {
          src.postMessage({ source: 'vitality-host', type: 'studio:claude:error', id: msg.id, reason: 'forbidden' }, '*')
          return
        }
        window.open('https://claude.ai/new', '_blank', 'noopener')
        src.postMessage({ source: 'vitality-host', type: 'studio:claude:result', id: msg.id, opened: true }, '*')
        return
      }

      if (msg.type === 'studio:status') {
        // Gated verb: is the user's YouTube connector linked, and what are the
        // latest channel metrics? Reads the user's own /api/connectors list
        // (session cookie), filters to youtube, and returns a minimal shape.
        // Metrics are private data, so this stays behind the trust gate.
        if (!trusted.current.has(src)) {
          src.postMessage({ source: 'vitality-host', type: 'studio:status:error', id: msg.id, reason: 'forbidden' }, '*')
          return
        }
        fetch('/api/connectors', { credentials: 'same-origin' })
          .then(r => r.json().then(data => ({ ok: r.ok, data })))
          .then(({ ok, data }) => {
            if (!ok) throw new Error('bad')
            const list = Array.isArray(data?.connectors) ? data.connectors : []
            const yt = list.find((c: { id?: string }) => c && c.id === 'youtube')
            src.postMessage({
              source: 'vitality-host',
              type: 'studio:status:result',
              id: msg.id,
              data: {
                configured: !!yt?.configured,
                connected: !!yt?.connected,
                accountLabel: typeof yt?.accountLabel === 'string' ? yt.accountLabel : null,
                metrics: yt?.metrics && typeof yt.metrics === 'object' ? yt.metrics : {},
              },
            }, '*')
          })
          .catch(() => src.postMessage({ source: 'vitality-host', type: 'studio:status:error', id: msg.id, reason: 'failed' }, '*'))
        return
      }

      if (msg.type === 'studio:connect') {
        // Gated verb: kick off the YouTube OAuth flow in a new tab so the
        // dashboard (and the open tile) stay alive; the tile re-asks
        // studio:status when it regains visibility. window.open here rides
        // the user activation that propagated from the tap inside the iframe;
        // if a popup blocker still eats it, we tell the tile so it can show
        // honest fallback copy instead of pretending.
        if (!trusted.current.has(src)) {
          src.postMessage({ source: 'vitality-host', type: 'studio:connect:error', id: msg.id, reason: 'forbidden' }, '*')
          return
        }
        // No 'noopener' feature: per the HTML spec window.open() returns null
        // when noopener is set even on success, which would make the tile show
        // popup-blocked copy on every real connect. The target is our own
        // same-origin route that 302s to Google, so there is no opener risk to
        // mitigate; a truthy return is the honest "it opened" signal.
        const win = window.open('/api/connectors/youtube/connect', '_blank')
        src.postMessage({ source: 'vitality-host', type: 'studio:connect:result', id: msg.id, opened: !!win }, '*')
        return
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [userId])

  return { register, unregister }
}

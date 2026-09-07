'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import WelcomeBackdrop from '@/components/WelcomeBackdrop'
import { DEFAULT_CHROME } from '@/lib/tiles/dashboardChrome'
import { buildForgePrompt, FORGE_CONNECT_CMD, FORGE_IDEA_MAX } from '@/lib/tiles/forgePrompt'
import { tileStore } from '@/lib/tiles/tileStore'
import { homeLayout } from '@/lib/tiles/homeLayout'
import { pushTile } from '@/lib/tiles/tileSync'
import type { TileEnvelope } from '@/lib/tiles/types'
import styles from './forge.module.css'

/**
 * ForgeStudio - describe it, copy the brief, drop the file, the gate judges.
 *
 * The pivot (2026-07-11): the claude.ai/new?q= handoff and the connect card
 * are DELETED (URL truncation, composer draft-stacking, claude.ai's caution
 * banner, and a "connected" pill we could never make honest). Forge now runs
 * two lanes, both of which fail loud and in words:
 *
 *   UNIVERSAL - Copy the build brief (works in ANY AI, no tools assumed),
 *   paste it wherever, get ONE .html file back, drop it on the drop zone.
 *   The server gate (/api/forge/gate, the same floor vitality_add_tile
 *   enforces) answers accepted or rejected. Rejected shows a fix note
 *   written FOR the AI with one copy button: paste it back, drop the
 *   corrected file. Round-trip until green.
 *
 *   CLAUDE CODE - the quiet mono block at the bottom: one-time
 *   `claude mcp add --scope user ...`, then tiles land on the board without
 *   any file handling. After copying we arm the landing watch (poll the
 *   newest tile time, visibility-gated, 5 min cap) and flip the "it landed"
 *   banner when a new tile row appears.
 *
 * On accept the tile installs through the ONE socket every pillar uses
 * (tileStore.importTile) and mirrors up via pushTile, so it persists and
 * crosses devices exactly like an MCP or Library tile.
 */

/* Inline SVG paths (no emojis anywhere). Spark + chevron match the builder. */
const P = {
  spark: 'M12 3c.6 3.9 2.4 6.9 9 9c-6.6 2.1-8.4 5.1-9 9c-.6-3.9-2.4-6.9-9-9c6.6-2.1 8.4-5.1 9-9Z',
  chev: 'M9 6l6 6-6 6',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  check: 'M5 13l4 4L19 7',
  drop: 'M12 4v10m0 0l-4-4m4 4l4-4M5 19h14',
  alert: 'M12 8v5m0 3.5v.5M12 3l9.5 16.5h-19z',
}

/** The ghost line cycles through while the textarea is empty. */
const IDEAS = [
  'a workout logger with plates math',
  'a habit journal with notes',
  'a markets tile for my watchlist',
  'a reading tracker with book notes',
  'a savings goal with a countdown',
]

const GHOST_MS = 3600
const LANDING_POLL_MS = 10_000
const LANDING_MAX_MS = 5 * 60_000
const MAX_FILE_BYTES = 1_000_000

type StatusBody = { connected?: boolean; latestTileAt?: string | null }

type GateResponse =
  | { ok: true; envelope: TileEnvelope }
  | { ok: false; errors: string[]; fixBrief: string }

/** Epoch ms for an ISO timestamp, or null when absent/unparsable. */
function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

/** 'bb-accuracy.html' -> 'bb accuracy' (the gate cleans further). */
function nameFromFile(fileName: string): string {
  return fileName
    .replace(/\.html?$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .slice(0, 40)
}

type DropPhase =
  | { t: 'idle' }
  | { t: 'judging' }
  | { t: 'accepted'; id: string; name: string; veeRead: boolean; placed: boolean }
  | { t: 'rejected'; errors: string[]; fixBrief: string }

export default function ForgeStudio({ userId }: { userId: string }) {
  const [value, setValue] = useState('')
  const [ghostIdx, setGhostIdx] = useState(0)
  const [briefCopied, setBriefCopied] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [fixCopied, setFixCopied] = useState(false)
  const [codeOpen, setCodeOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [drop, setDrop] = useState<DropPhase>({ t: 'idle' })
  const fileRef = useRef<HTMLInputElement | null>(null)

  // Landing watch (Claude Code lane): armed after the code block is copied.
  const [watching, setWatching] = useState(false)
  const [landed, setLanded] = useState(false)
  const baselineRef = useRef<number | null | undefined>(undefined)

  const idea = value.trim()
  const ready = idea.length > 0

  // Cycle the ghost line; the keyed span replays the ghostSwap entrance.
  useEffect(() => {
    const t = window.setInterval(() => setGhostIdx((i) => (i + 1) % IDEAS.length), GHOST_MS)
    return () => window.clearInterval(t)
  }, [])

  // Watch for an MCP-lane landing. Poll every 10s while visible, stop on
  // success, timeout (5 min), or unmount.
  useEffect(() => {
    if (!watching || landed) return
    let stopped = false

    async function check() {
      if (stopped || document.visibilityState !== 'visible') return
      if (baselineRef.current === undefined) return
      try {
        const res = await fetch('/api/mcp/status')
        if (!res.ok) return
        const body = (await res.json()) as StatusBody
        if (stopped) return
        const latest = toMs(body.latestTileAt)
        const base = baselineRef.current
        if (latest !== null && (base === null || latest > base)) {
          setLanded(true)
          setWatching(false)
        }
      } catch {
        // transient network blip; the next tick retries
      }
    }

    const id = window.setInterval(check, LANDING_POLL_MS)
    const timeout = window.setTimeout(() => setWatching(false), LANDING_MAX_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stopped = true
      window.clearInterval(id)
      window.clearTimeout(timeout)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [watching, landed])

  /** Snapshot the newest tile time FIRST (server clock), then anything
   *  strictly newer means it landed. */
  function startLandingWatch() {
    setLanded(false)
    baselineRef.current = undefined
    const clickedAt = Date.now()
    void fetch('/api/mcp/status')
      .then((res) => (res.ok ? (res.json() as Promise<StatusBody>) : null))
      .then((body) => {
        baselineRef.current = body ? toMs(body.latestTileAt) : clickedAt
      })
      .catch(() => {
        baselineRef.current = clickedAt
      })
    setWatching(true)
  }

  function copyBrief() {
    if (!ready) return
    const { brief } = buildForgePrompt(idea)
    void navigator.clipboard.writeText(brief).then(() => {
      setBriefCopied(true)
      window.setTimeout(() => setBriefCopied(false), 2400)
    })
  }

  function copyCode() {
    if (!ready) return
    const { code } = buildForgePrompt(idea)
    void navigator.clipboard.writeText(code).then(() => {
      setCodeCopied(true)
      window.setTimeout(() => setCodeCopied(false), 1800)
      startLandingWatch()
    })
  }

  function copyFix() {
    if (drop.t !== 'rejected') return
    void navigator.clipboard.writeText(drop.fixBrief).then(() => {
      setFixCopied(true)
      window.setTimeout(() => setFixCopied(false), 2400)
    })
  }

  /** The drop zone's whole job: read the file, ask the gate, act on the verdict. */
  async function judgeFile(file: File) {
    if (drop.t === 'judging') return
    if (file.size > MAX_FILE_BYTES) {
      setDrop({
        t: 'rejected',
        errors: ['- too-large: the file is over 1000kb'],
        fixBrief:
          'You built a Vitality dashboard tile and the file is over the 1000kb ceiling. Inline assets leaner (no embedded video or large images) and return ONE smaller sealed .html file.',
      })
      return
    }
    setFixCopied(false)
    setDrop({ t: 'judging' })
    try {
      const html = await file.text()
      const res = await fetch('/api/forge/gate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ html, name: nameFromFile(file.name) }),
      })
      if (!res.ok) throw new Error(`gate ${res.status}`)
      const verdict = (await res.json()) as GateResponse
      if (!verdict.ok) {
        setDrop({ t: 'rejected', errors: verdict.errors, fixBrief: verdict.fixBrief })
        return
      }
      const tile = tileStore.importTile(userId, verdict.envelope)
      if (!tile) {
        setDrop({
          t: 'rejected',
          errors: ['- install-failed: the tile passed the gate but could not be saved'],
          fixBrief:
            'The tile passed the Vitality gate but failed to install (likely a storage limit on this device). Try again; if it repeats, return a leaner single .html file.',
        })
        return
      }
      void pushTile(userId, tile, 'paste') // mirror up: persists + crosses devices
      // LIBRARY-FIRST: the tile is saved but NOT on the board yet. Placing is
      // the user's tap (the consent moment), right on the accepted card.
      setDrop({ t: 'accepted', id: tile.id, name: tile.name, veeRead: Boolean(tile.kind), placed: false })
    } catch {
      setDrop({
        t: 'rejected',
        errors: ['- network: the gate could not be reached'],
        fixBrief: '',
      })
    }
  }

  function onDropFiles(files: FileList | null) {
    const f = files?.[0]
    if (f) void judgeFile(f)
  }

  return (
    <div className={styles.world}>
      <WelcomeBackdrop background={DEFAULT_CHROME.background} />
      <div className={styles.grain} aria-hidden />

      {/* Always-there way home */}
      <Link href="/app" className={styles.homePill} aria-label="Back to your Vitality dashboard">
        <svg viewBox="0 0 24 24">
          <path d={P.chev} />
        </svg>
        DASHBOARD
      </Link>

      <main className={styles.main}>
        <section className={styles.stage}>
          <div className={styles.eyebrow}>
            <svg viewBox="0 0 24 24">
              <path d={P.spark} />
            </svg>
            VITALITY · FORGE
          </div>

          <h1 className={styles.title}>
            Dream it. <em>Claude</em> builds it.
          </h1>
          <p className={styles.lede}>Describe it. Copy the brief. Drop the file your AI hands back.</p>

          {/* HONEST typing: these words go into the brief, not our engine. */}
          <div className={[styles.ideaCard, idea ? styles.hasText : ''].filter(Boolean).join(' ')}>
            <svg className={styles.ideaSpark} viewBox="0 0 24 24" aria-hidden>
              <path d={P.spark} />
            </svg>
            <textarea
              className={styles.ideaInput}
              value={value}
              maxLength={FORGE_IDEA_MAX}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) copyBrief()
              }}
              rows={3}
              aria-label="Describe the tile you want built"
            />
            <span className={styles.ghost} aria-hidden>
              <span key={ghostIdx}>{IDEAS[ghostIdx]}</span>
            </span>
          </div>

          <button type="button" className={styles.forgeBtn} onClick={copyBrief} disabled={!ready}>
            {briefCopied ? 'Copied. Paste it into any AI' : 'Copy the build brief'}
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d={briefCopied ? P.check : P.copy} />
            </svg>
          </button>

          {/* Honest cost heads-up: a rich hand-built tile spends more of the
              user's own AI tokens than a quick preset. Warn, then let them
              continue (the brief button above still works). */}
          <p className={styles.costNote}>
            A rich, hand-built tile can run your AI 5k+ tokens - the more elaborate the idea, the more it
            costs. Want it free and instant instead?{' '}
            <Link href="/app/create">Start from a Quick Tile</Link>.
          </p>

          {/* The drop zone: where the file comes home and the gate judges it. */}
          {drop.t === 'accepted' ? (
            <div className={`${styles.dropCard} ${styles.dropOk}`} role="status">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d={P.check} />
              </svg>
              <div className={styles.dropOkText}>
                <strong>
                  {drop.placed ? `${drop.name} is on your board.` : `${drop.name} passed. It is in your Library.`}
                </strong>
                <span>
                  {drop.veeRead
                    ? 'Vee can read this tile: it carries the Vee mark.'
                    : 'A quiet tile: it keeps its notes to itself.'}
                </span>
              </div>
              <span className={styles.dropOkActions}>
                {drop.placed ? (
                  <Link href="/app" className={styles.seeBtn}>
                    See it
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <path d={P.chev} />
                    </svg>
                  </Link>
                ) : (
                  <button
                    type="button"
                    className={styles.seeBtn}
                    onClick={() => {
                      homeLayout.add(userId, drop.id)
                      setDrop({ ...drop, placed: true })
                    }}
                  >
                    Place on my board
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <path d={P.chev} />
                    </svg>
                  </button>
                )}
                <button type="button" className={styles.againBtn} onClick={() => setDrop({ t: 'idle' })}>
                  {drop.placed ? 'Add another' : 'Keep it in the Library'}
                </button>
              </span>
            </div>
          ) : drop.t === 'rejected' ? (
            <div className={`${styles.dropCard} ${styles.dropBad}`} role="status">
              <span className={styles.badHead}>
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d={P.alert} />
                </svg>
                Not quite. {drop.errors.length} thing{drop.errors.length === 1 ? '' : 's'} to fix.
              </span>
              <ul className={styles.errList}>
                {drop.errors.slice(0, 6).map((e) => (
                  <li key={e}>{e.replace(/^- /, '')}</li>
                ))}
              </ul>
              {drop.fixBrief ? (
                <>
                  <button type="button" className={styles.fixBtn} onClick={copyFix}>
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <path d={fixCopied ? P.check : P.copy} />
                    </svg>
                    {fixCopied ? 'Copied' : 'Copy the fix note'}
                  </button>
                  <span className={styles.badHint}>
                    Paste it back into your AI, then drop the corrected file here.
                  </span>
                </>
              ) : (
                <span className={styles.badHint}>Check your connection and drop the file again.</span>
              )}
              <button type="button" className={styles.againBtn} onClick={() => setDrop({ t: 'idle' })}>
                Try another file
              </button>
            </div>
          ) : (
            <div
              className={[
                styles.dropZone,
                dragOver ? styles.dropHot : '',
                drop.t === 'judging' ? styles.dropJudging : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                onDropFiles(e.dataTransfer?.files ?? null)
              }}
              onClick={() => {
                if (drop.t !== 'judging') fileRef.current?.click()
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && drop.t !== 'judging') fileRef.current?.click()
              }}
              aria-label="Drop the finished tile file here, or tap to choose it"
            >
              <input
                ref={fileRef}
                type="file"
                accept=".html,.htm,text/html"
                className={styles.fileInput}
                onChange={(e) => {
                  onDropFiles(e.target.files)
                  e.target.value = ''
                }}
                tabIndex={-1}
                aria-hidden
              />
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d={P.drop} />
              </svg>
              {drop.t === 'judging' ? (
                <span className={styles.dropText}>Reading your tile.</span>
              ) : (
                <span className={styles.dropText}>
                  <strong>Drop the finished tile here</strong>
                  <em>one .html file</em>
                </span>
              )}
            </div>
          )}

          {/* Landing watch (Claude Code lane): quiet while looking, mint when it lands. */}
          {landed ? (
            <Link href="/app" className={styles.landedBanner} role="status">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d={P.check} />
              </svg>
              it arrived. open your Library to place it
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d={P.chev} />
              </svg>
            </Link>
          ) : watching ? (
            <span className={styles.watchLine} role="status">
              <i className={styles.statusDot} aria-hidden />
              Watching your board for the new tile.
            </span>
          ) : null}

          {/* The Claude Code power lane lives behind one quiet line - the page
              stays minimal, power users find it in one tap. */}
          {!codeOpen ? (
            <button type="button" className={styles.codeToggle} onClick={() => setCodeOpen(true)}>
              Using Claude Code? Skip the file entirely
            </button>
          ) : (
            <div className={styles.codeCard}>
              <code className={styles.cmd}>{FORGE_CONNECT_CMD}</code>
              <button type="button" className={styles.copyAll} onClick={copyCode} disabled={!ready}>
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d={P.copy} />
                </svg>
                {codeCopied ? 'COPIED' : 'COPY COMMAND + YOUR BRIEF'}
              </button>
              <span className={styles.codeHint}>
                Paste once in any terminal, then just ask for tiles. Undo anytime with claude mcp
                remove vitality.
              </span>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

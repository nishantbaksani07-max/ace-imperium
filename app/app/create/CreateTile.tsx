'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { Tile, TileEnvelope } from '@/lib/tiles/types'
import { tileStore } from '@/lib/tiles/tileStore'
import { homeLayout } from '@/lib/tiles/homeLayout'
import { pushTile } from '@/lib/tiles/tileSync'
import { parseTileCode } from '@/lib/tiles/share'
import { useTileHost } from '@/lib/tiles/useTileHost'
import { adoptDraftStreams, reportStream } from './reportActions'
import styles from './create.module.css'

/**
 * Build a tile (the in-app twin of the approved demo, public/build-lab.html).
 *
 * The tile host (client). Renders a sealed tile in a sandboxed iframe and
 * speaks the Vitality bridge over postMessage:
 *
 *   tile  to host : { source:'vitality-tile', type:'save', data }
 *   tile  to host : { source:'vitality-tile', type:'load', id }
 *   tile  to host : { source:'vitality-tile', type:'report', stream }
 *   host  to tile : { source:'vitality-host', type:'load:result', id, data }
 *
 * save/load are the tile's OWN data. report is the one numeric life-stream into
 * Vee (the noticed brain): the host forwards it to the reportStream server
 * action, which validates it and RLS-writes it under the session user. This is
 * the quiet magic, a tile auto-connects to Vee just by reporting.
 *
 * The sandbox (allow-scripts, NO allow-same-origin) gives the tile an opaque
 * origin: it can run and postMessage, but it cannot read this app, the user's
 * data, the keys, or another tile.
 *
 * The registry (lib/tiles) lets a user Keep many named tiles. Kept tiles live
 * in the Library folder now, so this page is the cozy three-step build path:
 * paste, see it live and sealed, keep it. The host routing (useTileHost) maps
 * each iframe's window to its tile id, so a save is written to the tile that
 * actually sent it. Persistence is localStorage per user for v1; the tileStore
 * seam swaps to Supabase later without touching a tile.
 */

const DRAFT_ID = 'draft' // the un-Kept preview's working id

const DEFAULT_TILE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;color:#fff;background:transparent;accent-color:#6EE7B7;padding:2px}
.row{display:flex;gap:8px;margin-bottom:14px}
input{flex:1;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.10);border-radius:9px;padding:11px 13px;color:#fff;font-size:14px;font-family:inherit;caret-color:#6EE7B7;outline:none;transition:border-color .18s}
input::placeholder{color:rgba(255,255,255,.35)}
input:focus{border-color:rgba(110,231,183,.5)}
.add{border:0;border-radius:9px;background:#6EE7B7;color:#042a1c;font-weight:600;font-size:14px;padding:0 16px;cursor:pointer;font-family:inherit;transition:background .18s,transform .18s}
.add:hover{background:#5dd6a6}.add:active{transform:scale(.96)}
ul{list-style:none;display:flex;flex-direction:column;gap:2px}
li{display:flex;align-items:center;gap:11px;padding:9px 6px;border-radius:8px;transition:background .18s}
li:hover{background:rgba(255,255,255,.03)}
.box{width:19px;height:19px;flex:none;border-radius:6px;border:1.5px solid rgba(255,255,255,.25);cursor:pointer;display:grid;place-items:center;transition:all .2s cubic-bezier(.16,1,.3,1)}
.box.on{background:#6EE7B7;border-color:#6EE7B7}
.box svg{opacity:0;transform:scale(.5);transition:all .2s cubic-bezier(.16,1,.3,1)}
.box.on svg{opacity:1;transform:none}
.txt{flex:1;font-size:14.5px;transition:color .18s,opacity .18s}
.done .txt{text-decoration:line-through;color:rgba(255,255,255,.35)}
.del{opacity:0;border:0;background:none;color:rgba(255,255,255,.4);cursor:pointer;font-size:16px;padding:2px 6px;transition:opacity .18s,color .18s}
li:hover .del{opacity:1}.del:hover{color:#fff}
.empty{color:rgba(255,255,255,.35);font-size:13.5px;padding:14px 6px}
<\/style></head><body>
<div class="row"><input id="t" placeholder="Add a task..." maxlength="80"/><button class="add" id="a">Add</button></div>
<ul id="list"></ul>
<script>
var CHECK='<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2 5 8.6 9.5 3.4" stroke="#042a1c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var Vitality={_w:{},_sv:false,save:function(d){Vitality._sv=true;parent.postMessage({source:'vitality-tile',type:'save',data:d},'*')},load:function(){return new Promise(function(res){var id=Math.random().toString(36).slice(2);var ask=function(){parent.postMessage({source:'vitality-tile',type:'load',id:id},'*')};var n=0;var t=setInterval(function(){n++;if(n===1){ask();return}clearInterval(t);if(Vitality._w[id]){Vitality._w[id]=function(d){if(d!=null&&!Vitality._sv)location.reload()};res(null)}},3000);Vitality._w[id]=function(d){clearInterval(t);res(d)};ask()})},report:function(s){parent.postMessage({source:'vitality-tile',type:'report',stream:s},'*')}};
function vNote(t){var n=document.getElementById('v-note');if(!n){n=document.createElement('div');n.id='v-note';n.style.cssText='margin-top:10px;font-size:12px;color:#F59E0B;text-align:center';document.body.appendChild(n)}n.textContent=t}
window.addEventListener('message',function(e){var m=e.data;if(!m||m.source!=='vitality-host')return;if(m.type==='load:result'&&Vitality._w[m.id]){Vitality._w[m.id](m.data);delete Vitality._w[m.id];return}if(m.type==='save:error'){vNote('That save did not stick. Try again in a moment.')}else if(m.type==='report:error'){vNote('That log did not land, so it does not count yet. Try again in a moment.')}});
var todos=[];var list=document.getElementById('list');var input=document.getElementById('t');
function render(){if(!todos.length){list.innerHTML='<div class="empty">Nothing yet. Add your first task.</div>';return}list.innerHTML='';todos.forEach(function(t,i){var li=document.createElement('li');if(t.done)li.className='done';li.innerHTML='<div class="box'+(t.done?' on':'')+'">'+CHECK+'</div><span class="txt"></span><button class="del">&times;</button>';li.querySelector('.txt').textContent=t.text;li.querySelector('.box').onclick=function(){todos[i].done=!todos[i].done;commit()};li.querySelector('.del').onclick=function(){todos.splice(i,1);commit()};list.appendChild(li)})}
function commit(){render();Vitality.save(todos)}
function add(){var v=input.value.trim();if(!v)return;todos.push({text:v,done:false});input.value='';commit();input.focus()}
document.getElementById('a').onclick=add;input.addEventListener('keydown',function(e){if(e.key==='Enter')add()});
Vitality.load().then(function(d){todos=Array.isArray(d)&&d.length?d:[{text:'Drink a glass of water',done:true},{text:'10 minute walk',done:false},{text:'Plan tomorrow',done:false}];render()});
<\/script></body></html>`

/**
 * The build prompt a user pastes into Claude Code (VS Code) or claude.ai to
 * get a tile that plugs straight into Vitality. It teaches the FULL bridge,
 * including Vitality.report(), so a tile built outside auto-connects to Vee:
 * its stream lands in Supabase (tile_streams / tile_reports) and the score,
 * the drift watch, and the cross-life connections pick it up with zero setup.
 * Kept as one copyable constant so the contract can never drift from the UI.
 *
 * The bridge is HONEST by construction: load() re-asks the host once at 3s and
 * falls back to null at ~6s (a dropped host reply can never leave the tile
 * permanently blank). The waiter stays alive after the fallback: if the real
 * reply lands late carrying saved data and the tile has not saved yet, it
 * reloads to boot from the real history instead of letting the next save
 * overwrite it with the empty state. And the host's save:error / report:error
 * replies surface as a small amber note inside the tile instead of letting it
 * celebrate a write that never landed.
 * Exported for the contract-pinning test (createBridge.test.ts).
 */
export const BUILD_PROMPT = `Build me a Vitality tile: ONE self-contained HTML file (inline CSS + JS, no external requests, no libraries, no localStorage). It runs sealed in a sandboxed iframe on my dashboard.

Look: transparent background (the dashboard is pure black), white text, mint #6EE7B7 accents, system/Inter font, SVG icons only, no emoji.

Talk to Vitality ONLY through this bridge. Paste it verbatim at the top of the script:

var Vitality={_w:{},_sv:false,save:function(d){Vitality._sv=true;parent.postMessage({source:'vitality-tile',type:'save',data:d},'*')},load:function(){return new Promise(function(res){var id=Math.random().toString(36).slice(2);var ask=function(){parent.postMessage({source:'vitality-tile',type:'load',id:id},'*')};var n=0;var t=setInterval(function(){n++;if(n===1){ask();return}clearInterval(t);if(Vitality._w[id]){Vitality._w[id]=function(d){if(d!=null&&!Vitality._sv)location.reload()};res(null)}},3000);Vitality._w[id]=function(d){clearInterval(t);res(d)};ask()})},report:function(s){parent.postMessage({source:'vitality-tile',type:'report',stream:s},'*')}};
function vNote(t){var n=document.getElementById('v-note');if(!n){n=document.createElement('div');n.id='v-note';n.style.cssText='margin-top:10px;font-size:12px;color:#F59E0B;text-align:center';document.body.appendChild(n)}n.textContent=t}
window.addEventListener('message',function(e){var m=e.data;if(!m||m.source!=='vitality-host')return;if(m.type==='load:result'&&Vitality._w[m.id]){Vitality._w[m.id](m.data);delete Vitality._w[m.id];return}if(m.type==='save:error'){vNote('That save did not stick. Try again in a moment.')}else if(m.type==='report:error'){vNote('That log did not land, so it does not count yet. Try again in a moment.')}});
function todayKey(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}

The rules:
1. Vitality.save(data) persists this tile's own data (any small JSON). Vitality.load() returns it as a Promise on startup; it resolves null when nothing is saved yet or the dashboard did not answer in time (the bridge retries once, and if the real answer lands late with saved data before you save, it reloads the tile so stored history is never overwritten by an empty boot), so always fall back to your empty state. Save after every change.
2. Vitality.report(stream) feeds Vee, the dashboard's brain. Report the tile's ONE main number every time the user logs it, right next to the save:
   Vitality.report({ key:'beer', label:'Beer', value:2, date:todayKey(), kind:'intake', goalDirection:'down' })
   - key: a short id for the stream, like beer, reading, meditate
   - label: the display name
   - value: the number for this log
   - date: local YYYY-MM-DD (use todayKey(), never toISOString)
   - kind: one of intake, count, duration, rating, measure, money, done
   - goalDirection: up, down, or neutral (what good looks like for this number)
3. One stream per tile. Reporting is what connects the tile to my daily score and lets Vee notice patterns across my life.

When you are done, give me ONLY the complete HTML file, nothing else.`

/**
 * One sealed tile in its iframe. It captures its OWN tileId, so the host always
 * routes this frame's save/load to the right tile even if onLoad fires late.
 * The parent gives it a key so switching or re-running a tile remounts cleanly
 * (fresh window, no overlapping scripts), and it unregisters on unmount.
 */
function TilePreview({
  tileId,
  srcDoc,
  register,
  unregister,
}: {
  tileId: string
  srcDoc: string
  register: (win: Window | null, tileId: string) => void
  unregister: (win: Window | null) => void
}) {
  const winRef = useRef<Window | null>(null)
  return (
    <iframe
      ref={(el) => {
        if (el) {
          winRef.current = el.contentWindow
          register(el.contentWindow, tileId)
        } else if (winRef.current) {
          unregister(winRef.current)
          winRef.current = null
        }
      }}
      onLoad={(e) => {
        winRef.current = e.currentTarget.contentWindow
        register(e.currentTarget.contentWindow, tileId)
      }}
      className={styles.frame}
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      title="Live sealed tile preview"
    />
  )
}

type RunMsg = { kind: 'warn' | 'ok'; text: string } | null

/**
 * Parse the editor content as a TileEnvelope. The single "Add a tile" door
 * accepts BOTH raw tile HTML (the build path) and the JSON envelope a builder
 * or the MCP produced (the upload path). This is the exact name + html shape
 * the Library's old upload box validated, so an envelope keeps installing
 * through tileStore.importTile unchanged. Returns the envelope when the content
 * is shaped like one, else null (so the caller treats it as raw HTML).
 */
function asEnvelope(raw: string): TileEnvelope | null {
  const text = raw.trim()
  if (!text) return null
  // A friend's shared tile arrives as a `vitality:tile:` code; unpack it first.
  const code = parseTileCode(text)
  if (code) return code
  let parsed: unknown = null
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  const shaped =
    parsed &&
    typeof parsed === 'object' &&
    typeof (parsed as TileEnvelope).name === 'string' &&
    (parsed as TileEnvelope).name.trim().length > 0 &&
    typeof (parsed as TileEnvelope).html === 'string' &&
    (parsed as TileEnvelope).html.trim().length > 0
  return shaped ? (parsed as TileEnvelope) : null
}

/**
 * CreateTile works two ways from one component:
 *  - page mode (the /app/create route): no onClose, so the close X and "Back to
 *    Library" navigate to /app, exactly as before.
 *  - drawer mode (mounted over the Library): onClose is provided, so those same
 *    controls call it to dismiss the drawer with no navigation; onKept lets the
 *    Library refresh its tile list after a Keep.
 */
export default function CreateTile({
  userId,
  onClose,
  onKept,
}: {
  userId: string
  onClose?: () => void
  onKept?: () => void
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editParam = searchParams.get('tile')

  const [html, setHtml] = useState('') // empty by default: the user pastes their tile here
  const [running, setRunning] = useState('')
  const [activeId, setActiveId] = useState<string>(DRAFT_ID)
  const [runNonce, setRunNonce] = useState(0) // bump to force a clean iframe remount
  const [live, setLive] = useState(false) // the preview is rendering a non-empty tile
  const [expanded, setExpanded] = useState(false) // the live preview is opened full (like tapping a tile)
  const [runMsg, setRunMsg] = useState<RunMsg>(null)
  const [name, setName] = useState('')
  const [savedOn, setSavedOn] = useState(false)
  const [saving, setSaving] = useState(false)
  const [statusLabel, setStatusLabel] = useState('Saved to your account when you keep it.')
  const [keptName, setKeptName] = useState<string | null>(null) // drives the post-keep pop

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Stream keys the draft preview reported THIS session; a Keep re-parents
  // only these onto the new tile (see adoptDraftStreams).
  const draftKeys = useRef<Set<string>>(new Set())

  const { register, unregister } = useTileHost(
    userId,
    ({ type, count }) => {
      // The sealed tile is talking to the host: light the status line warmly.
      if (type === 'report') {
        setSavedOn(true)
        setSaving(false)
        setStatusLabel('Reported to Vee. The noticed brain is watching this stream.')
      } else if (type === 'save') {
        setSavedOn(true)
        setSaving(false)
        setStatusLabel(`Saved to your account. ${count} ${count === 1 ? 'item' : 'items'}.`)
      } else if (count) {
        setStatusLabel(`Loaded from your account. ${count} ${count === 1 ? 'item' : 'items'}.`)
      }
    },
    // the quiet magic: a tile's reported stream is validated + RLS-written, then
    // read by the noticed engine as just another domain. The host supplies the
    // sender's tileId (a not-yet-Kept preview reports under its draft id, so
    // nothing is ever dropped). The promise is returned so the host only fires
    // the "Reported to Vee" activity when the write actually landed; a failure
    // flips the status line honest instead of celebrating a dropped datapoint.
    (stream, tileId) => {
      // Remember which stream keys THIS session's draft preview reported, so a
      // Keep adopts exactly those draft rows and never another tab's.
      if (tileId === DRAFT_ID) {
        const k = (stream as { key?: unknown } | null)?.key
        if (typeof k === 'string' && k.trim()) draftKeys.current.add(k.trim())
      }
      return reportStream(tileId, stream)
        .then((res) => {
          if (!res.ok) {
            setSaving(false)
            setSavedOn(false)
            setStatusLabel(
              res.error === 'unauthorized'
                ? 'That report did not land: you are signed out. Sign back in and log it again.'
                : 'That report did not land, so Vee has not seen it. Log it again in a moment.',
            )
          }
          return res
        })
        // A transport-level rejection (network drop mid-flight) must flip the
        // status line honest too, not leave an earlier "Reported to Vee" lying.
        .catch(() => {
          setSaving(false)
          setSavedOn(false)
          setStatusLabel('That report did not land, so Vee has not seen it. Log it again in a moment.')
          return { ok: false as const, error: 'network' }
        })
    },
  )

  // migrate the BUILD71 single key into the registry so a returning account's
  // first tile is never orphaned, then optionally load a tile passed by the
  // Library's edit link (/app/create?tile=<id>).
  useEffect(() => {
    tileStore.migrateLegacy(userId, DEFAULT_TILE)
    if (editParam) {
      const tile = tileStore.getTile(userId, editParam)
      if (tile) loadTile(tile)
    }
    // run once per user / per requested tile
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, editParam])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  // Esc collapses the full preview first, then (in drawer mode) closes the
  // drawer, mirroring backing out of an opened tile and then the build sheet.
  useEffect(() => {
    if (!expanded && !onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (expanded) setExpanded(false)
      else onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded, onClose])

  function resetStatus() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaving(false)
    setSavedOn(false)
    setStatusLabel('Saved to your account when you keep it.')
  }

  function runTile() {
    const trimmed = html.trim()
    if (!trimmed) {
      setLive(false)
      setRunMsg({ kind: 'warn', text: 'Paste a tile first, or load the starter to see it run.' })
      return
    }
    // If the paste is a TileEnvelope, run its inner html so the upload path sees
    // a live preview too. Raw HTML runs as-is. Keep() reads `html` and decides
    // again, so the source of truth never drifts.
    const env = asEnvelope(html)
    setRunMsg({ kind: 'ok', text: 'Running your tile.' })
    resetStatus()
    setLive(true)
    setRunning(env ? env.html : html)
    setRunNonce((n) => n + 1)
  }

  function copyPrompt() {
    // The one-tap path to building outside: copy the full build prompt (bridge +
    // report contract) for Claude Code in VS Code, or claude.ai. Clipboard can be
    // denied in odd embeds; fail warm, never throw.
    navigator.clipboard
      .writeText(BUILD_PROMPT)
      .then(() =>
        setRunMsg({
          kind: 'ok',
          text: 'Build prompt copied. Paste it into Claude Code in VS Code, or claude.ai, and it will build you a tile that reports to Vee.',
        }),
      )
      .catch(() =>
        setRunMsg({ kind: 'warn', text: 'Could not reach the clipboard. Long-press or Ctrl+C the starter instead.' }),
      )
  }

  function loadStarter() {
    setHtml(DEFAULT_TILE)
    setActiveId(DRAFT_ID)
    setName('My to-do tile')
    resetStatus()
    setLive(true)
    setRunning(DEFAULT_TILE)
    setRunNonce((n) => n + 1)
    setRunMsg({ kind: 'ok', text: 'Starter tile loaded and running.' })
  }

  async function keep() {
    // The pasted content might be a TileEnvelope (what a builder / the MCP
    // produced) instead of raw HTML. Compute it once so the install AND the live
    // preview both use the same unwrapped html and never drift.
    const env = asEnvelope(html)
    // Guard the write BEFORE we persist and tell the user "Saved". An oversized
    // tile silently fails to land in localStorage (writeIndex swallows the quota
    // error), so cap it up front and surface a warning instead of a false "Saved".
    const MAX_TILE_HTML = 512 * 1024 // ~512KB of markup, matches the per-tile data cap
    const htmlToStore = env ? env.html : html
    if (htmlToStore.length > MAX_TILE_HTML) {
      setRunMsg({
        kind: 'warn',
        text: 'This tile is too large to save (over 512KB of code). Trim it down, then keep again.',
      })
      return
    }
    // THE GATE, before anything persists. Pasted html and pasted envelopes are
    // untrusted (a hand-crafted envelope could smuggle an off-brand or unsealed
    // tile past the old shape check - the white-tile bug). The server runs the
    // same floor vitality_add_tile enforces; on refusal the fix note (written
    // for the user's AI) goes to the clipboard so the round-trip is one paste.
    // Fail CLOSED on network trouble: an unjudged tile never installs.
    setRunMsg({ kind: 'ok', text: 'Checking your tile at the gate.' })
    try {
      const res = await fetch('/api/forge/gate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ html: htmlToStore, name: name.trim() || env?.name || '' }),
      })
      if (!res.ok) throw new Error(`gate ${res.status}`)
      const verdict = (await res.json()) as { ok: boolean; errors?: string[]; fixBrief?: string }
      if (!verdict.ok) {
        let copied = false
        if (verdict.fixBrief) {
          try {
            await navigator.clipboard.writeText(verdict.fixBrief)
            copied = true
          } catch {
            /* clipboard denied: the message below still names the errors */
          }
        }
        const first = (verdict.errors ?? [])
          .slice(0, 2)
          .map((e) => e.replace(/^- /, ''))
          .join(' · ')
        const more = (verdict.errors?.length ?? 0) > 2 ? ` (+${verdict.errors!.length - 2} more)` : ''
        setRunMsg({
          kind: 'warn',
          text: `The gate refused this tile: ${first}${more}. ${
            copied
              ? 'A fix note for your AI is on your clipboard - paste it back, then keep again.'
              : 'Fix these, then keep again.'
          }`,
        })
        return
      }
    } catch {
      setRunMsg({
        kind: 'warn',
        text: 'Could not reach the tile gate to check this file. Try keeping it again in a moment.',
      })
      return
    }
    let tile: Tile | undefined | null
    if (activeId !== DRAFT_ID && tileStore.getTile(userId, activeId)) {
      // editing a tile already in the registry: update its html (and rename)
      tile = tileStore.updateHtml(userId, activeId, html)
      if (tile && name.trim()) tile = tileStore.renameTile(userId, activeId, name)
    } else if (env) {
      // an envelope: install it through the SAME importTile pipe the upload box
      // used, so it keeps its category / skin.
      tile = tileStore.importTile(userId, name.trim() ? { ...env, name } : env)
      if (!tile) {
        setRunMsg({
          kind: 'warn',
          text:
            'We could not read that tile envelope. Check it is the whole thing your builder gave you, then keep again.',
        })
        return
      }
      // the envelope ships its own state; clear the draft so a pre-keep run does
      // not bleed into the next tile previewed this session.
      tileStore.saveData(userId, DRAFT_ID, [])
    } else {
      // a fresh draft becomes a new saved tile; carry its in-progress data
      // across, then reset the draft so the next one starts empty
      tile = tileStore.createTile(userId, { name, html })
      tileStore.saveData(userId, tile.id, tileStore.loadData(userId, DRAFT_ID))
      tileStore.saveData(userId, DRAFT_ID, [])
    }
    if (!tile) return
    // A pre-Keep preview reported under the provisional 'draft' id; now the tile
    // has its real id, move those streams (and their datapoints) onto it so no
    // orphan (user,'draft',key) rows strand behind. Scoped to the keys THIS
    // session's preview reported, so a second Create tab's draft never rides
    // along. Best-effort, never blocks.
    if (activeId === DRAFT_ID && tile.id !== DRAFT_ID && draftKeys.current.size > 0) {
      void adoptDraftStreams(tile.id, Array.from(draftKeys.current))
      draftKeys.current.clear()
    }
    // Mirror the kept tile up to the server so "Saved to your account" is true:
    // it persists and crosses devices (the core hosted promise). Best-effort -
    // the local store stays the source if the network write fails.
    void pushTile(userId, tile, 'paste')
    // Land it ON the board too (append, idempotent), a kept tile renders on
    // the dashboard immediately instead of waiting in the Library drawer.
    homeLayout.add(userId, tile.id)
    const savedName = tile.name
    setActiveId(tile.id)
    setRunning(env ? env.html : html)
    setRunNonce((n) => n + 1)

    // cozy saving status, then the kept confirmation
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaving(true)
    setSavedOn(false)
    setStatusLabel('Saving to your account.')
    saveTimer.current = setTimeout(() => {
      setSaving(false)
      setSavedOn(true)
      setStatusLabel('Saved to your account.')
      setKeptName(savedName)
      // In drawer mode this lets the Library re-read its tile list so the just
      // kept tile shows in "In your library" the moment the user heads back.
      onKept?.()
    }, 700)
  }

  function loadTile(tile: Tile) {
    setHtml(tile.html)
    setRunning(tile.html)
    setActiveId(tile.id)
    setRunNonce((n) => n + 1)
    setName(tile.name)
    setLive(true)
    setRunMsg(null)
    resetStatus()
  }

  // Kept in the API surface for parity with the registry; the Library owns the
  // rename / delete UI for kept tiles now, but the host still exposes them.
  function renameTile(id: string, newName: string) {
    tileStore.renameTile(userId, id, newName)
  }
  function deleteTile(id: string) {
    tileStore.deleteTile(userId, id)
    if (id === activeId) {
      setActiveId(DRAFT_ID)
      setHtml(DEFAULT_TILE)
      setRunning(DEFAULT_TILE)
      setRunNonce((n) => n + 1)
    }
  }
  // referenced so the registry actions stay type-checked against this page
  void renameTile
  void deleteTile

  const editingSaved = activeId !== DRAFT_ID

  function goToApp() {
    // drawer mode: dismiss the drawer back to the Library underneath. page mode:
    // navigate to /app, the original behavior.
    if (onClose) onClose()
    else router.push('/app')
  }

  function keepBuilding() {
    setKeptName(null)
    // start a fresh draft so the next tile is its own thing (keep() always
    // leaves the just-saved tile active, so "keep building" resets to the starter)
    setHtml(DEFAULT_TILE)
    setActiveId(DRAFT_ID)
    setName('My to-do tile')
    setRunning(DEFAULT_TILE)
    setRunNonce((n) => n + 1)
    resetStatus()
  }

  return (
    <div className={`${styles.root} ${onClose ? styles.drawer : ''}`}>
      <div className={styles.aurora} aria-hidden />
      <div className={styles.grain} aria-hidden />

      {/* faint dashboard behind (sibling of the Library overlay) */}
      <div className={styles.behind} aria-hidden>
        <div className={styles.behindRow}>
          <div className={`${styles.behindB} ${styles.tall}`} />
          <div className={styles.behindB} />
          <div className={styles.behindB} />
        </div>
        <div className={`${styles.behindRow} ${styles.two}`}>
          <div className={styles.behindB} />
          <div className={styles.behindB} />
        </div>
        <div className={styles.behindRow}>
          <div className={styles.behindB} />
          <div className={styles.behindB} />
          <div className={styles.behindB} />
        </div>
      </div>

      <div className={styles.scrim}>
        <div className={styles.win} role="dialog" aria-label="Build a tile">
          {/* compact app titlebar */}
          <div className={styles.titlebar}>
            <div className={styles.brand}>
              <h1 className={styles.title}>
                <span className={styles.spark} aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12Z" />
                  </svg>
                </span>
                Build a tile
              </h1>
              <span className={styles.titledot} aria-hidden />
              <span className={styles.titlehint}>
                Paste what <b>Claude</b> built, run it, keep it.
              </span>
            </div>
            {onClose ? (
              <button type="button" onClick={onClose} className={styles.x} aria-label="Back to Library">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            ) : (
              <Link href="/app" className={styles.x} aria-label="Back to Library">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </Link>
            )}
          </div>

          {/* two panes, side by side */}
          <div className={styles.panes}>
            {/* LEFT: HTML editor */}
            <section className={`${styles.pane} ${styles.left}`}>
              <div className={styles.panehead}>
                <div className={styles.kk}>
                  <span className={styles.kkNo}>01</span>
                  Your tile
                </div>
                <span className={styles.spacer} />
                <div className={styles.miniact}>
                  <button
                    className={`${styles.btn} ${styles.ghost} ${styles.sm}`}
                    type="button"
                    onClick={copyPrompt}
                    title="Copy the build prompt for Claude Code in VS Code"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="11" height="11" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span className={styles.lbl}>Prompt</span>
                  </button>
                  <button className={`${styles.btn} ${styles.ghost} ${styles.sm}`} type="button" onClick={loadStarter}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                      <path d="M3 4v4h4" />
                    </svg>
                    <span className={styles.lbl}>Starter</span>
                  </button>
                  <button className={`${styles.btn} ${styles.mintline} ${styles.sm}`} type="button" onClick={runTile}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 5.5v13l11-6.5z" />
                    </svg>
                    <span className={styles.lbl}>Run it</span>
                  </button>
                </div>
              </div>
              <div className={styles.editwrap}>
                <textarea
                  className={styles.code}
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                  spellCheck={false}
                  aria-label="Tile HTML"
                  placeholder="Paste your tile here. Drop in the HTML Claude built you, or the whole envelope your builder gave you, then press Run it and keep it."
                />
                {runMsg && (
                  <p
                    className={`${styles.runmsg} ${runMsg.kind === 'warn' ? styles.warn : styles.ok}`}
                    role="alert"
                  >
                    {runMsg.text}
                  </p>
                )}
              </div>
            </section>

            {/* RIGHT: live sealed preview */}
            <section className={`${styles.pane} ${styles.right} ${live ? styles.live : ''}`}>
              <div className={styles.panehead}>
                <div className={styles.kk}>
                  <span className={styles.kkNo}>02</span>
                  <span>{live ? 'Live tile' : 'No tile yet'}</span>
                </div>
                <span className={styles.spacer} />
                <span className={styles.livedot} aria-hidden />
                <span className={styles.sealtag}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
                    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
                  </svg>
                  Sealed
                </span>
                {live && (
                  <button
                    className={styles.expandbtn}
                    type="button"
                    onClick={() => setExpanded(true)}
                    aria-label="Open the tile full"
                    title="Open full, the way it opens on your dashboard"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3H3v5" />
                      <path d="M21 8V3h-5" />
                      <path d="M16 21h5v-5" />
                      <path d="M3 16v5h5" />
                    </svg>
                    <span className={styles.lbl}>Open full</span>
                  </button>
                )}
              </div>
              <div className={`${styles.stagewrap} ${expanded ? styles.expanded : ''}`}>
                {expanded && (
                  <div className={styles.exptop}>
                    <span className={styles.expname}>
                      Full view, how it opens on your dashboard
                    </span>
                    <button
                      className={styles.collapse}
                      type="button"
                      onClick={() => setExpanded(false)}
                      aria-label="Close the full view"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="6" y1="6" x2="18" y2="18" />
                        <line x1="18" y1="6" x2="6" y2="18" />
                      </svg>
                      Close
                    </button>
                  </div>
                )}
                <div className={styles.stage}>
                  {live ? (
                    <TilePreview
                      key={`${activeId}:${runNonce}`}
                      tileId={activeId}
                      srcDoc={running}
                      register={register}
                      unregister={unregister}
                    />
                  ) : (
                    <div className={styles.placeholder}>
                      Paste a tile and press Run it to see it come alive.
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* bottom action bar: sealed note + status + name + Keep */}
          <div className={styles.actionbar}>
            <span className={styles.sealchip}>
              <span className={styles.si} aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
                  <path d="M9.5 12l1.8 1.8L15 10" />
                </svg>
              </span>
              <span className={styles.stxt}>
                <b>Runs in a sealed box.</b> It cannot read your data or keys.
              </span>
            </span>

            <span className={styles.barspacer} />

            <div
              className={`${styles.status} ${saving ? styles.saving : ''} ${savedOn ? styles.saved : ''}`}
              role="status"
            >
              <span className={styles.sd} aria-hidden />
              <span className={styles.sx}>{statusLabel}</span>
            </div>

            <div className={styles.namebox}>
              <span className={styles.ni} aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="7" height="7" rx="1.8" />
                  <rect x="13" y="4" width="7" height="7" rx="1.8" />
                  <rect x="4" y="13" width="7" height="7" rx="1.8" />
                  <rect x="13" y="13" width="7" height="7" rx="1.8" />
                </svg>
              </span>
              <input
                id="tileName"
                type="text"
                placeholder="Name your tile"
                value={name}
                onChange={(e) => setName(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                maxLength={48}
                aria-label="Name your tile"
              />
            </div>

            <div className={styles.keepwrap}>
              <button className={`${styles.btn} ${styles.primary} ${styles.keepBtn}`} type="button" onClick={keep}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
                  <path d="M8 4v5h7V4" />
                  <path d="M8 14h8" />
                  <path d="M8 17.5h5" />
                </svg>
                {editingSaved ? 'Update' : 'Keep'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* post-keep confirmation */}
      {keptName && (
        <div
          className={styles.pop}
          role="dialog"
          aria-label="Tile kept"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setKeptName(null)
          }}
        >
          <div className={styles.pcard}>
            <div className={styles.tick} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 13 4 4L19 7" />
              </svg>
            </div>
            <h4>Kept. It is in your library.</h4>
            <p>
              <b>{keptName}</b> is saved to your account, waiting in your library. Add it to your dashboard whenever you like.
            </p>
            <div className={styles.prow}>
              <button className={`${styles.btn} ${styles.ghost}`} type="button" onClick={keepBuilding}>
                Keep building
              </button>
              <button className={`${styles.btn} ${styles.primary}`} type="button" onClick={goToApp}>
                Open Library
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

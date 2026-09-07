'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import WelcomeBackdrop from '@/components/WelcomeBackdrop'
import { DEFAULT_CHROME } from '@/lib/tiles/dashboardChrome'
import { tileStore } from '@/lib/tiles/tileStore'
import { homeLayout } from '@/lib/tiles/homeLayout'
import { pushTile } from '@/lib/tiles/tileSync'
import { getLocalDateKey } from '@/lib/dates'
import { ACCENTS, type TileAccent } from '@/lib/tiles/tileRecolor'
import type { RefineState } from '@/lib/tiles/refineParse'
import { scanCapability } from '@/lib/tiles/capabilityScan'
import { AREA_LABEL, AREA_ORDER, findPresets, PRESETS, type LifeArea, type QuickPreset } from '@/lib/tiles/quickLibrary'
import { PRESET_VIZ, blankViz } from '@/lib/tiles/presetViz'
import type { ReportKind, TileEnvelope } from '@/lib/tiles/types'
import styles from './tileBuilder.module.css'
import '@/components/libraryViz.css'

/** One-time Claude Code hookup for the honesty-gate handoff. */
const MCP_ADD_CMD = 'claude mcp add --transport http vitality http://localhost:3000/api/mcp/mcp'

/**
 * TileBuilder - the build-your-own EDITOR (BUILD79: no free text anywhere),
 * staged as three acts on the signature Vitality world.
 *
 * Act 1 THE SHELF: six shape cards (the whole menu, visible) + the Big Brother
 *                  card ("something bigger? that one deserves Claude").
 * Act 2 THE BIRTH: the picked shape's deterministic default build goes to the
 *                  server (/api/create-tile -> infer + renderTile) behind a held
 *                  "VEE IS SHAPING IT" beat; the REAL sealed tile then settles
 *                  onto the bench inside its frame while the world pulses.
 * Act 3 THE CRAFT: a two-column workbench. Left: the tile piece (the sealed
 *                  iframe + instrument dock: goal / name / accent) and the ON
 *                  YOUR DASHBOARD poster. Right: the knobs (units, dial, aim) -
 *                  every control is a bounded tap, so nothing can miss.
 *
 * State model: `stateRef` holds the last COMMITTED (successfully built) BuildState;
 * every knob/step derives its next state from it and flows through the ONE
 * `runBuild`, which clears any pending debounce first. So a slow debounced goal-step
 * can never race a later accent/knob, a failed rebuild reverts the optimistic knob,
 * and a rebuild never wipes a name the user is mid-typing. The preview host is a
 * showroom (answers load with sample days, accepts save into memory, IGNORES report),
 * so nothing here reaches Vee or the registry - the added tile starts empty + honest.
 */

interface BuiltMeta {
  key: string
  label: string
  kind: ReportKind
  goalDirection?: 'up' | 'down'
  unit: string
  target?: number
  scaleMax?: number
  accent: TileAccent
}

interface BuiltTile {
  html: string
  meta: BuiltMeta
  sampleValues: number[]
}

type BuildState = { prompt: string } & RefineState
type Phase = 'opening' | 'beat' | 'craft'

const ACCENT_LIST = Object.keys(ACCENTS) as TileAccent[]

/** Ink-on-accent for the Vee send button (chrome only; the tile recolors itself). */
const ACCENT_INK: Record<TileAccent, string> = {
  mint: '#042a1c',
  iris: '#10163a',
  azure: '#081a38',
  violet: '#1c1036',
  rose: '#33101f',
  seafoam: '#04302a',
}

/* Inline SVG paths (no emojis anywhere). */
const P = {
  spark: 'M12 3c.6 3.9 2.4 6.9 9 9c-6.6 2.1-8.4 5.1-9 9c-.6-3.9-2.4-6.9-9-9c6.6-2.1 8.4-5.1 9-9Z',
  drop: 'M12 2.7c3.2 4 6.3 7.6 6.3 11.3a6.3 6.3 0 1 1-12.6 0C5.7 10.3 8.8 6.7 12 2.7Z',
  flame:
    'M12.5 2c.8 3.2-.9 5-2.2 6.6C9 10.2 8 11.8 8 13.8a4.8 4.8 0 0 0 9.6 0c0-1.6-.6-3-1.6-4.3-.4 1.1-1.1 1.8-2 2.2.5-3-.1-6.7-1.5-9.7z',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm.9 4.3v.6c1.2.2 2.2.9 2.5 2l-1.6.5c-.2-.6-.8-1-1.8-1-.9 0-1.5.4-1.5 1 0 .5.4.8 1.9 1.1 1.9.4 3.2 1 3.2 2.6 0 1.3-1 2.2-2.7 2.5v.6h-1.8v-.6c-1.4-.2-2.5-1-2.8-2.2l1.6-.5c.2.7 1 1.2 2.1 1.2 1 0 1.7-.4 1.7-1.1 0-.6-.5-.9-2.1-1.2-1.8-.4-3-1-3-2.5 0-1.2 1-2.1 2.5-2.4v-.6h1.8Z',
  moon: 'M20.6 14.2A8.6 8.6 0 0 1 9.8 3.4a8.6 8.6 0 1 0 10.8 10.8Z',
  foot: 'M9 3.5c1.6 0 2.6 1.4 2.4 3.3l-.5 4.2c-.1 1.2-1 2-2.2 2s-2.2-.9-2.3-2.1L6 6.8C5.8 4.9 7.3 3.5 9 3.5Zm.9 11.2c.9 0 1.6.7 1.6 1.6v.9a2.5 2.5 0 0 1-5 0v-.7c0-1 .8-1.8 1.7-1.8h1.7ZM15.5 8c1.7 0 3.2 1.4 3 3.3l-.4 3.2c-.1 1.2-1.1 2.1-2.3 2.1s-2.1-.8-2.2-2l-.5-3.3C12.9 9.4 13.9 8 15.5 8Zm.8 10.3c1 0 1.7.8 1.7 1.7v.5a2.5 2.5 0 0 1-5 0v-.6c0-.9.7-1.6 1.6-1.6h1.7Z',
  expand: 'M9 21H3v-6M15 3h6v6M21 3l-7 7M3 21l7-7',
  up: 'M12 19V5M5.5 11.5 12 5l6.5 6.5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6L6 18',
  restart: 'M4 10a8 8 0 1 1 2.3 6.3M4 10V4.5M4 10h5.5',
  chev: 'M9 6l6 6-6 6',
  minus: 'M5 12h14',
  plus: 'M5 12h14M12 5v14',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm.9 4.5v4.2l3.2 1.9-.9 1.5-4.1-2.5V7.5h1.8Z',
  star: 'M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2-5.6-3.2-5.6 3.2 1.3-6.2L3 9.5l6.3-.7L12 3Z',
  trend: 'M4 13h3.4v7H4v-7Zm6.3-4h3.4v11h-3.4V9Zm6.3-5H20v16h-3.4V4Z',
}

/**
 * THE SHAPES - the whole editor, visible. There is NO free-text anywhere:
 * this is a build-your-own EDITOR (pick a piece, name it, set the goal, pick
 * units and color), not a magic search bar. Each shape carries a deterministic
 * default build (prompt chosen so `infer` resolves it exactly), and every
 * tweak in the craft is an explicit override flowing through runBuild - the
 * bounded knobs ARE the product, so nothing the user does can miss.
 */
interface ShapeDef {
  id: string
  shape: string
  hint: string
  icon: string
  /** The deterministic default build for this shape. */
  prompt: string
  name: string
  unit?: string
  target?: number
  /** Unit choices shown in the craft (empty = no unit knob for this shape). */
  units: string[]
  /** Whether the aim (more/less is good) knob applies. */
  aim: boolean
}

const SHAPES: ShapeDef[] = [
  { id: 'tally', shape: 'Tally', hint: 'count a thing', icon: P.drop, prompt: 'my daily count', name: 'Tally', unit: 'times', target: 5, units: ['times', 'reps', 'pages', 'glasses', 'cups', 'steps'], aim: true },
  { id: 'timer', shape: 'Timer', hint: 'minutes or hours', icon: P.clock, prompt: 'minutes of focus', name: 'Focus', target: 30, units: ['min', 'h'], aim: false },
  { id: 'rating', shape: 'Rating', hint: 'a 1-10 dial', icon: P.star, prompt: 'rate my day out of 10', name: 'My Day', units: [], aim: false },
  { id: 'measure', shape: 'Measure', hint: 'a number that moves', icon: P.trend, prompt: 'my bodyweight', name: 'Weight', units: ['kg', 'lb', 'cm', 'in', '%', 'bpm'], aim: false },
  { id: 'money', shape: 'Money', hint: 'in or out', icon: P.coin, prompt: 'what I spend each day', name: 'Spend', units: [], aim: true },
  { id: 'habit', shape: 'Habit', hint: 'a yes-no streak', icon: P.flame, prompt: 'my daily streak', name: 'Streak', units: [], aim: false },
]

/** Friendly craft copy for a unit choice. */
const UNIT_WORD: Record<string, string> = { min: 'minutes', h: 'hours' }

/** The knob set for a built tile derives from its KIND (works for presets and
 *  blank shapes alike): counting kinds share the tally knobs, and so on. */
const KIND_TO_SHAPE_ID: Record<ReportKind, string> = {
  count: 'tally',
  intake: 'tally',
  duration: 'timer',
  rating: 'rating',
  measure: 'measure',
  money: 'money',
  done: 'habit',
}
const SHAPE_BY_ID: Record<string, ShapeDef> = Object.fromEntries(SHAPES.map((s) => [s.id, s]))

/** One glyph per life area keeps the library calm (28 bespoke icons would shout). */
const AREA_ICON: Record<LifeArea, string> = {
  body: P.foot,
  mind: P.moon,
  money: P.coin,
  fuel: P.drop,
  habits: P.flame,
}

/** Ghost phrases for the finder bar - real library entries only. */
const FIND_GHOSTS = ['water', 'mood', 'gym streak', 'sleep', 'daily spend', 'meditation', 'steps']

/** The five featured chips under the bar - the ORIGINAL minimal opening,
 *  now honest: each is a library piece (tap = build that preset). */
const FEATURED: Array<{ id: string; label: string; icon: string }> = [
  { id: 'water', label: 'Water', icon: P.drop },
  { id: 'gymstreak', label: 'Gym streak', icon: P.flame },
  { id: 'spend', label: 'Daily spend', icon: P.coin },
  { id: 'sleep', label: 'Sleep', icon: P.moon },
  { id: 'steps', label: 'Steps', icon: P.foot },
]

/** Where each "you already own it" module lives (the finder's best miss). */
const MODULE_ROUTES: Record<string, { name: string; route: string }> = {
  train: { name: 'Train', route: '/app/fitness/log' },
  fuel: { name: 'Fuel', route: '/app/fuel' },
  water: { name: 'Water', route: '/app/fuel/water' },
  weight: { name: 'Weight', route: '/app/fitness/progress' },
  mentor: { name: 'Vee', route: '/app/mentor' },
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** A sensible +/- step for a goal of this size (and kind). */
function stepFor(target: number, kind: ReportKind): number {
  if (kind === 'duration' && target <= 24) return 0.5 // hours-scale timer
  if (target >= 1000) return 500
  if (target >= 100) return 10
  if (target >= 20) return 5
  return 1
}

function fmtGoal(target: number): string {
  if (target >= 1000) return target.toLocaleString('en-US')
  if (!Number.isInteger(target)) return target.toFixed(1)
  return String(target)
}

function fmtVal(n: number, unit: string): string {
  return unit === '$' ? '$' + fmtGoal(n) : fmtGoal(n)
}

interface Confirm {
  show: boolean
  busy: boolean
  msg: string
  warn?: boolean
}

/**
 * A SPECIMEN card - one library piece, shown like it matters (BUILD81):
 * its own micro-visual on the stage, its name with the area mark, its one
 * serif line of voice, and the honest mono spec of what it builds. The chassis
 * is shared so the shelves stay calm; the personality lives inside the stage.
 * `first` marks the finder's current best match (mint ring + live motion +
 * the PRESS ENTER chip). The plain `lspec` class is the global motion scope.
 */
function Specimen(props: {
  stage: ReactNode
  name: string
  areaIcon?: string
  desc: string
  foot: string
  first?: boolean
  blank?: boolean
  disabled: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      className={`${styles.spec} lspec ${props.first ? `${styles.specFirst} lspec-first` : ''} ${props.blank ? styles.specBlank : ''}`}
      onClick={props.onPick}
      disabled={props.disabled}
    >
      <span className={styles.specStage}>
        {props.stage}
        {props.first && <span className={styles.specEnter}>PRESS ENTER</span>}
      </span>
      <span className={styles.specName}>
        {props.areaIcon && (
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d={props.areaIcon} />
          </svg>
        )}
        {props.name}
      </span>
      <span className={styles.specDesc}>{props.desc}</span>
      <span className={styles.specFoot}>{props.foot}</span>
    </button>
  )
}

/** One preset as a specimen (the common case). */
function PresetSpecimen(props: { p: QuickPreset; first?: boolean; disabled: boolean; onPick: () => void }) {
  return (
    <Specimen
      stage={PRESET_VIZ[props.p.id] ?? null}
      name={props.p.label}
      areaIcon={AREA_ICON[props.p.area]}
      desc={props.p.desc}
      foot={props.p.foot}
      first={props.first}
      disabled={props.disabled}
      onPick={props.onPick}
    />
  )
}

export default function TileBuilder({ userId, initialIdea = '' }: { userId: string; initialIdea?: string }) {
  const [phase, setPhase] = useState<Phase>('opening')
  const [leaving, setLeaving] = useState(false)
  const [built, setBuilt] = useState<BuiltTile | null>(null)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const [prevHtml, setPrevHtml] = useState<string | null>(null)
  const [added, setAdded] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [confirm, setConfirm] = useState<Confirm>({ show: false, busy: false, msg: '' })
  const [flashOn, setFlashOn] = useState(false)
  const [glowGo, setGlowGo] = useState(false)
  const [fsOpen, setFsOpen] = useState(false)
  // The Big Brother storefront: opened by the "something bigger" card - the
  // honest pitch that real apps are built with Claude + the Vitality MCP.
  const [handoff, setHandoff] = useState(false)
  const [cmdCopied, setCmdCopied] = useState(false)
  // The finder bar: FINDS pieces in the library, never generates.
  // ?idea=<text> (the Vee goals "Create a tile for this" door) prefills it,
  // so the shelves open already ranked for the goal the user came from.
  const [query, setQuery] = useState(initialIdea)
  const [ghostIdx, setGhostIdx] = useState(0)
  // The full library, laid out on the table (shelves become a wrapped wall).
  const [libOpen, setLibOpen] = useState(false)
  // The session pack: names of tiles added this visit (the puzzle strip).
  const [pack, setPack] = useState<string[]>([])

  // Single source of truth: the last SUCCESSFULLY built state, and the tile it produced.
  const stateRef = useRef<BuildState | null>(null)
  const lastGoodRef = useRef<BuiltTile | null>(null)
  // The exact html already added, so a second click / rebuild-to-identical can't dupe it.
  const addedHtmlRef = useRef<string | null>(null)
  const nameFocusedRef = useRef(false)
  const phaseRef = useRef<Phase>('opening')
  const rmRef = useRef(false)
  // The ephemeral preview data (`_days`) the showroom host serves.
  const previewDays = useRef<Array<{ date: string; value: number }>>([])
  const fbTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const buildTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Monotonic build sequence: rapid accent/refine clicks fire overlapping fetches;
  // only the LATEST may touch state, so an out-of-order response can never win.
  const seqRef = useRef(0)
  const cine = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  const burstRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    rmRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  /** A cinematic timer that is always cleaned up on unmount. */
  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      cine.current.delete(t)
      fn()
    }, ms)
    cine.current.add(t)
    return t
  }, [])

  // --- ephemeral preview host: a showroom, never storage ---
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const m = e.data
      if (!m || m.source !== 'vitality-tile') return
      const src = e.source as Window | null
      if (!src) return
      if (m.type === 'load') {
        src.postMessage(
          { source: 'vitality-host', type: 'load:result', id: m.id, data: previewDays.current },
          '*',
        )
      } else if (m.type === 'save') {
        if (Array.isArray(m.data)) previewDays.current = m.data
      }
      // 'report' is intentionally ignored - the preview never writes to Vee.
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Clear every pending timer on unmount (no setState / fetch after unmount).
  useEffect(
    () => () => {
      if (fbTimer.current) clearTimeout(fbTimer.current)
      if (buildTimer.current) clearTimeout(buildTimer.current)
      if (prevTimer.current) clearTimeout(prevTimer.current)
      cine.current.forEach(clearTimeout)
      cine.current.clear()
    },
    [],
  )

  // Ghost cycler: the finder's italic placeholder drifts while it sits empty.
  useEffect(() => {
    if (phase !== 'opening' || rmRef.current) return
    const t = setInterval(() => setGhostIdx((i) => i + 1), 3400)
    return () => clearInterval(t)
  }, [phase])

  // Full-screen open: Escape closes, page scroll locks (real openCard behavior).
  useEffect(() => {
    if (!fsOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFsOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.documentElement.style.overflow = prev
    }
  }, [fsOpen])

  const spawnBurst = useCallback((n: number) => {
    const root = burstRef.current
    if (!root || rmRef.current) return
    for (let j = 0; j < n; j++) {
      const b = document.createElement('i')
      const bs = (1.8 + Math.random() * 1.7).toFixed(2)
      b.style.left = (30 + Math.random() * 40).toFixed(2) + '%'
      b.style.bottom = (18 + Math.random() * 34).toFixed(2) + '%'
      b.style.width = bs + 'px'
      b.style.height = bs + 'px'
      b.style.setProperty('--wx', (Math.random() * 160 - 80).toFixed(1) + 'px')
      b.style.setProperty('--bd', (1.3 + Math.random() * 1.1).toFixed(2) + 's')
      b.addEventListener('animationend', () => b.remove())
      root.appendChild(b)
    }
  }, [])

  const pulsePiece = useCallback(() => {
    setFlashOn(true)
    later(() => setFlashOn(false), 480)
  }, [later])

  const flashFeedback = useCallback((msg: string, warn?: boolean) => {
    setConfirm({ show: true, busy: false, msg, warn })
    if (fbTimer.current) clearTimeout(fbTimer.current)
    fbTimer.current = setTimeout(() => setConfirm((c) => ({ ...c, show: false })), 4200)
  }, [])

  /** Build failures land where the user is: opening error line, or a Vee warn. */
  const failFeedback = useCallback(
    (msg: string) => {
      if (phaseRef.current === 'craft') flashFeedback(msg, true)
      else setError(msg)
    },
    [flashFeedback],
  )

  const seedPreview = useCallback((sv: number[]) => {
    const today = new Date()
    previewDays.current = sv.map((value, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - (sv.length - 1 - i))
      return { date: getLocalDateKey(d), value }
    })
  }, [])

  const runBuild = useCallback(
    async (next: BuildState, note?: { msg: string; warn?: boolean }): Promise<boolean> => {
      // any queued debounced build is superseded by this one
      if (buildTimer.current) {
        clearTimeout(buildTimer.current)
        buildTimer.current = null
      }
      const seq = ++seqRef.current
      setBuilding(true)
      setError(null)
      try {
        const res = await fetch('/api/create-tile', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(next),
        })
        const data = await res.json().catch(() => null)
        // A newer build superseded this one while it was in flight: drop it silently
        // so an out-of-order response can never clobber the tile or the veil.
        if (seq !== seqRef.current) return false
        // Guard the contract: a malformed ok:true (missing html/sampleValues) must
        // fail soft, never crash the render downstream.
        if (res.ok && data?.ok && (typeof data.html !== 'string' || !Array.isArray(data.sampleValues))) {
          data.ok = false
        }
        if (!res.ok || !data?.ok) {
          failFeedback('Could not build that one. Try describing it a little differently.')
          // undo any optimistic knob bump so the knob matches the tile on screen
          if (lastGoodRef.current) setBuilt(lastGoodRef.current)
          return false
        }
        const b: BuiltTile = { html: data.html, meta: data.meta, sampleValues: data.sampleValues }
        // graceful crossfade: keep the old tile underneath while the new frame fades in
        if (phaseRef.current === 'craft' && lastGoodRef.current && lastGoodRef.current.html !== b.html) {
          setPrevHtml(lastGoodRef.current.html)
          if (prevTimer.current) clearTimeout(prevTimer.current)
          prevTimer.current = setTimeout(() => setPrevHtml(null), 600)
        }
        stateRef.current = next
        lastGoodRef.current = b
        seedPreview(b.sampleValues)
        setBuilt(b)
        // never clobber a name the user is actively editing
        if (!nameFocusedRef.current) setNameDraft(b.meta.label)
        // stays "Added" only if this exact html was already added; otherwise it is a
        // new/changed tile and re-adding it is a fresh, non-duplicate install
        setAdded(addedHtmlRef.current === b.html)
        setNonce((n) => n + 1)
        if (phaseRef.current === 'craft') pulsePiece()
        if (note) flashFeedback(note.msg, note.warn)
        return true
      } catch {
        failFeedback('Network hiccup. Give it another go.')
        if (lastGoodRef.current) setBuilt(lastGoodRef.current)
        return false
      } finally {
        // only the latest build clears the veil; a stale one must not lift it while
        // the newest fetch is still running.
        if (seq === seqRef.current) setBuilding(false)
      }
    },
    [seedPreview, flashFeedback, failFeedback, pulsePiece],
  )

  /* ---------------- Act 1 -> 2 -> 3: pick a piece, the beat holds, the birth lands */

  /** ONE entry for presets and blank shapes alike: a PROVEN build, never free text. */
  async function pickPiece(def: { prompt: string; name?: string; unit?: string; target?: number; goalDirection?: 'up' | 'down' }) {
    if (phaseRef.current !== 'opening' || building || leaving) return
    setError(null)
    setLeaving(true)
    later(() => {
      setLeaving(false)
      setPhase('beat')
    }, 380)
    const minBeat = new Promise<void>((r) => later(r, 1450))
    // The piece's default build: a prompt `infer` resolves deterministically,
    // plus explicit overrides so it is born complete and honest.
    const ok = await runBuild({
      prompt: def.prompt,
      accent: 'mint',
      name: def.name,
      unit: def.unit,
      target: def.target,
      goalDirection: def.goalDirection,
    })
    await minBeat
    if (ok) {
      setConfirm({ show: false, busy: false, msg: '' })
      setQuery('')
      setPhase('craft')
      setGlowGo(true)
      later(() => setGlowGo(false), 1700)
      spawnBurst(16)
      window.scrollTo(0, 0)
    } else {
      setPhase('opening')
    }
  }

  function startOver() {
    if (building || leaving) return
    if (buildTimer.current) {
      clearTimeout(buildTimer.current)
      buildTimer.current = null
    }
    setFsOpen(false)
    setLeaving(true)
    later(() => {
      setLeaving(false)
      setPhase('opening')
      setBuilt(null)
      stateRef.current = null
      lastGoodRef.current = null
      setPrevHtml(null)
      setNameDraft('')
      setConfirm({ show: false, busy: false, msg: '' })
      setAdded(false)
      setError(null)
      setQuery('')
      window.scrollTo(0, 0)
    }, 380)
  }

  /* ---------------- Act 3: the craft (all mutations flow through runBuild) */

  /** The committed state, with any pending optimistic goal bump folded in. */
  function baseState(): BuildState | null {
    const base = stateRef.current
    if (!base) return null
    return { ...base, target: built?.meta.target ?? base.target }
  }

  function stepGoal(dir: 1 | -1) {
    const base = stateRef.current
    if (!base || !built || built.meta.target == null) return
    const t = built.meta.target
    const s = stepFor(t, built.meta.kind)
    const nt = Math.max(s, round1(t + dir * s))
    if (nt === t) return
    // optimistic local bump so rapid taps feel instant; coalesce the rebuild
    setBuilt({ ...built, meta: { ...built.meta, target: nt } })
    const nextState = { ...base, target: nt }
    if (buildTimer.current) clearTimeout(buildTimer.current)
    buildTimer.current = setTimeout(() => void runBuild(nextState), 240)
  }

  function pickAccent(a: TileAccent) {
    const base = baseState()
    if (!base || a === stateRef.current?.accent) return
    void runBuild({ ...base, accent: a })
  }

  function commitName() {
    const base = baseState()
    if (!base || !built) return
    const n = nameDraft.trim()
    if (!n || n === built.meta.label) return
    void runBuild({ ...base, name: n })
  }

  /** The unit knob: an explicit override; the engine CONVERTS a goal where the
   *  families allow (its unit brain), otherwise relabels honestly. */
  function pickUnit(u: string) {
    const base = baseState()
    if (!base || !built || u === (built.meta.unit || base.unit)) return
    setConfirm({ show: true, busy: true, msg: '' })
    void runBuild({ ...base, unit: u }, { msg: `measured in ${UNIT_WORD[u] ?? u}` })
  }

  /** The aim knob: is MORE or LESS the good direction for this piece? */
  function pickAim(dir: 'up' | 'down') {
    const base = baseState()
    if (!base || !built || dir === built.meta.goalDirection) return
    setConfirm({ show: true, busy: true, msg: '' })
    void runBuild({ ...base, goalDirection: dir }, { msg: dir === 'down' ? 'aiming lower is the win' : 'aiming higher is the win' })
  }

  /** The scale knob (rating only): /5 or /10, swapped INSIDE the piece's own
   *  prompt so a preset keeps its subject ("rate my mood out of 5"). */
  function pickScale(max: 5 | 10) {
    const base = baseState()
    if (!base || !built || built.meta.scaleMax === max) return
    if (!/out of (ten|10|five|5)/i.test(base.prompt)) return
    setConfirm({ show: true, busy: true, msg: '' })
    void runBuild(
      { ...base, prompt: base.prompt.replace(/out of (ten|10|five|5)/i, `out of ${max}`) },
      { msg: `a 1 to ${max} dial` },
    )
  }

  function add() {
    if (!built) return
    if (addedHtmlRef.current === built.html) return // this exact tile is already on the dashboard
    const env: TileEnvelope = {
      name: built.meta.label,
      html: built.html,
      key: built.meta.key,
      label: built.meta.label,
      kind: built.meta.kind,
      goalDirection: built.meta.goalDirection,
      color: ACCENTS[built.meta.accent].hex,
    }
    const tile = tileStore.importTile(userId, env)
    if (!tile) {
      flashFeedback('Could not add that tile. Give it another go.', true)
      return
    }
    void pushTile(userId, tile, 'paste')
    // Land it ON the board, not buried in the Library drawer: the promise is
    // "one sentence and it renders on your dashboard", so place it now (append,
    // idempotent). The grid reads this order on next mount.
    homeLayout.add(userId, tile.id)
    addedHtmlRef.current = built.html
    setAdded(true)
    // the session pack: the puzzle strip of everything added this visit
    setPack((p) => [...p, built.meta.label])
    pulsePiece()
    spawnBurst(10)
  }

  /* ---------------- derived view bits */

  const accent: TileAccent = built?.meta.accent ?? 'mint'
  const accVars = {
    ['--acc' as string]: ACCENTS[accent].hex,
    ['--accInk' as string]: ACCENT_INK[accent],
  }

  const meta = built?.meta ?? null
  // The knob set derives from the built tile's KIND (presets + blanks alike).
  const shape: ShapeDef | null = meta ? SHAPE_BY_ID[KIND_TO_SHAPE_ID[meta.kind]] ?? null : null
  // The finder: empty query = the full shelves; typed = ranked matches.
  const matches = findPresets(query)
  const searching = query.trim().length > 0
  // No library match: is the ask platform/AI/app-shaped? Then Vee names why.
  const missVerdict = searching && matches.length === 0 ? scanCapability(query) : null
  const findGhost = FIND_GHOSTS[ghostIdx % FIND_GHOSTS.length]
  const showGoalKnob = meta?.target != null
  const todayVal = built ? built.sampleValues[built.sampleValues.length - 1] ?? 0 : 0
  const posterP = meta?.target ? Math.min(1, todayVal / meta.target) : 0.66
  const POSTER_C = 251.33 // mini ring circumference, r 40
  const posterFoot = meta
    ? meta.target != null
      ? `of ${fmtVal(meta.target, meta.unit)}${meta.unit && meta.unit !== '$' ? ' ' + meta.unit : ''}`
      : meta.unit || meta.kind
    : ''
  return (
    <div className={styles.world} style={accVars}>
      <WelcomeBackdrop background={DEFAULT_CHROME.background} />
      <div className={styles.grain} aria-hidden />
      <div className={`${styles.birthGlow} ${glowGo ? styles.birthGlowGo : ''}`} aria-hidden>
        <div className={styles.orb} />
      </div>
      <div className={styles.burstLayer} ref={burstRef} aria-hidden />

      {/* Always-there way home */}
      <Link href="/app" className={styles.homePill} aria-label="Back to your Vitality dashboard">
        <svg viewBox="0 0 24 24">
          <path d={P.chev} />
        </svg>
        DASHBOARD
      </Link>

      {/* THE BEAT: Vee takes the sentence */}
      <div className={`${styles.beat} ${phase === 'beat' ? styles.beatShow : ''}`} aria-hidden={phase !== 'beat'}>
        <div className={styles.beatInner}>
          <svg className={styles.beatSpark} viewBox="0 0 24 24">
            <path d={P.spark} />
          </svg>
          <span className={styles.beatDots}>
            <i />
            <i />
            <i />
          </span>
          <span className={styles.beatText}>VEE IS SHAPING IT</span>
        </div>
      </div>

      <main className={styles.main}>
        {/* ============ THE BIG BROTHER STOREFRONT ============
            Opened by the "something bigger" card: the honest pitch that real
            apps - live numbers, AI, whole layouts - are built with Claude +
            the Vitality MCP, and land on this same dashboard. */}
        {phase === 'opening' && handoff && (
          <section className={`${styles.act} ${styles.actOpen} ${leaving ? styles.leave : ''}`}>
            <div className={styles.handoffWrap}>
              <div className={styles.oEyebrow}>
                <svg viewBox="0 0 24 24">
                  <path d={P.spark} />
                </svg>
                VEE · STRAIGHT WITH YOU
              </div>
              <h1 className={`${styles.oTitle} ${styles.hTitle}`}>
                Bigger ideas deserve <em>Claude</em>.
              </h1>
              <p className={styles.hVee}>
                <span className={styles.hVeeTag}>VEE</span>
                a whole app, live numbers, a mind of its own - more than six simple shapes. In
                Claude Code, with the Vitality MCP, you build the real thing: pro grade,
                on-brand, still yours.
              </p>

              <div className={styles.hSteps}>
                <div className={styles.hStep}>
                  <span className={styles.hStepNum}>1</span>
                  Open Claude Code on your computer
                </div>
                <div className={styles.hStep}>
                  <span className={styles.hStepNum}>2</span>
                  <span className={styles.hStepBody}>
                    Connect Vitality once
                    <code className={styles.hCmd}>{MCP_ADD_CMD}</code>
                  </span>
                </div>
                <div className={styles.hStep}>
                  <span className={styles.hStepNum}>3</span>
                  Describe your idea - the tile lands on this dashboard
                </div>
              </div>

              <div className={styles.hActions}>
                <button
                  type="button"
                  className={styles.hCopy}
                  onClick={() => {
                    void navigator.clipboard.writeText(MCP_ADD_CMD).then(() => {
                      setCmdCopied(true)
                      later(() => setCmdCopied(false), 1800)
                    })
                  }}
                >
                  {cmdCopied ? 'Copied' : 'Copy the connect command'}
                </button>
                <button type="button" className={styles.hBack} onClick={() => setHandoff(false)}>
                  BACK TO THE SHAPES
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ============ ACT I · THE SHELF ============ */}
        {phase === 'opening' && !handoff && (
          <section className={`${styles.act} ${styles.actOpen} ${leaving ? styles.leave : ''}`}>
            <div className={styles.oEyebrow}>
              <svg viewBox="0 0 24 24">
                <path d={P.spark} />
              </svg>
              VITALITY · QUICK TILE
            </div>
            <h1 className={styles.oTitle}>
              What do you want
              <br />
              to <em>track</em>?
            </h1>
            <p className={styles.oLede}>Type to find your piece. Every one in the library is ready to live.</p>

            {/* THE FINDER: it finds pieces, it never generates. */}
            <div className={`${styles.openBar} ${query ? styles.hasText : ''}`}>
              <svg className={styles.oSpark} viewBox="0 0 24 24">
                <path d={P.spark} />
              </svg>
              <span className={styles.openGhost} aria-hidden>
                {!query && <span key={ghostIdx}>{findGhost}</span>}
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && matches.length > 0) void pickPiece(matches[0])
                }}
                type="text"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="go"
                aria-label="Find a piece in the library"
              />
              <button
                className={styles.goBtn}
                onClick={() => {
                  if (matches.length > 0) void pickPiece(matches[0])
                }}
                disabled={building || (searching && matches.length === 0)}
                aria-label="Build the first match"
              >
                <svg viewBox="0 0 24 24">
                  <path d={P.up} />
                </svg>
              </button>
            </div>
            <p className={styles.oQuiet}>
              {searching && matches.length > 0
                ? `${matches.length} PIECE${matches.length === 1 ? '' : 'S'} IN THE LIBRARY · ENTER BUILDS THE FIRST`
                : 'A LIBRARY OF READY PIECES · EVERY ONE PROVEN'}
            </p>

            {/* THE RECOMMENDER: typing surfaces ranked pieces as a quiet list
                (spotlight-style), never a wall. Enter builds the first. */}
            {searching && matches.length > 0 && (
              <div className={styles.sugList}>
                {matches.slice(0, 7).map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`${styles.sugRow} ${i === 0 ? styles.sugFirst : ''}`}
                    onClick={() => void pickPiece(p)}
                    disabled={building || leaving}
                  >
                    <svg className={styles.sugIcon} viewBox="0 0 24 24" aria-hidden>
                      <path d={AREA_ICON[p.area]} />
                    </svg>
                    <span className={styles.sugName}>{p.label}</span>
                    <span className={styles.sugDesc}>{p.desc}</span>
                    <span className={styles.sugFoot}>{p.foot}</span>
                    {i === 0 && <span className={styles.sugEnter}>ENTER</span>}
                  </button>
                ))}
              </div>
            )}

            {/* Nothing that small in the library: the honest exit, never a fake. */}
            {searching && matches.length === 0 && (
              <div className={styles.noMatch}>
                <p className={styles.noMatchVee}>
                  <span className={styles.hVeeTag}>VEE</span>
                  {missVerdict && missVerdict.verdict !== 'buildable'
                    ? `"${query.trim()}" - ${missVerdict.why ?? 'that one is bigger than the library'}.`
                    : `nothing that small in the library yet - but Claude builds exactly that, pro grade, straight onto this dashboard.`}
                </p>
                <div className={styles.noMatchActions}>
                  {missVerdict?.verdict === 'module' && missVerdict.module && MODULE_ROUTES[missVerdict.module] ? (
                    <Link href={MODULE_ROUTES[missVerdict.module].route} className={styles.hCopy}>
                      Open {MODULE_ROUTES[missVerdict.module].name}
                    </Link>
                  ) : (
                    <button type="button" className={styles.hCopy} onClick={() => setHandoff(true)}>
                      Build it with Claude
                    </button>
                  )}
                  <button type="button" className={styles.hBack} onClick={() => setQuery('')}>
                    BACK TO THE LIBRARY
                  </button>
                </div>
              </div>
            )}

            {/* THE ORIGINAL CALM: five featured chips, one quiet door. Nothing
                else. The chips step aside while the library is open - the wall
                already holds every piece, so nothing repeats itself. */}
            {!searching && (
              <>
                {!libOpen && (
                  <div className={styles.seeds}>
                    {FEATURED.map((f) => {
                      const p = PRESETS.find((x) => x.id === f.id)
                      if (!p) return null
                      return (
                        <button key={f.id} className={styles.seed} onClick={() => void pickPiece(p)} disabled={building || leaving}>
                          <svg viewBox="0 0 24 24">
                            <path d={f.icon} />
                          </svg>
                          {f.label}
                        </button>
                      )
                    })}
                  </div>
                )}

                <button type="button" className={styles.libToggle} onClick={() => setLibOpen((v) => !v)}>
                  <svg viewBox="0 0 24 24" style={libOpen ? { transform: 'rotate(180deg)' } : undefined} aria-hidden>
                    <path d={P.chev} transform="rotate(90 12 12)" />
                  </svg>
                  {libOpen ? 'CLOSE THE LIBRARY' : 'EXPLORE THE LIBRARY'}
                </button>
              </>
            )}

            {/* THE LIBRARY, behind its door: every specimen, grouped by life. */}
            {!searching && libOpen && (
              <div className={`${styles.shelves} ${styles.shelvesWide}`}>
                {AREA_ORDER.map((area) => (
                  <div key={area} className={styles.shelfRow}>
                    <span className={styles.shelfLabel}>{AREA_LABEL[area].toUpperCase()}</span>
                    <div className={styles.specWrap}>
                      {PRESETS.filter((p) => p.area === area).map((p) => (
                        <PresetSpecimen key={p.id} p={p} disabled={building || leaving} onPick={() => void pickPiece(p)} />
                      ))}
                    </div>
                  </div>
                ))}
                <div className={styles.shelfRow}>
                  <span className={styles.shelfLabel}>START BLANK</span>
                  <div className={styles.specWrap}>
                    {SHAPES.map((s) => (
                      <Specimen
                        key={s.id}
                        stage={blankViz(s.icon)}
                        name={s.shape}
                        desc={`${s.hint}. you bring the subject.`}
                        foot="BLANK · YOU NAME IT"
                        blank
                        disabled={building || leaving}
                        onPick={() => void pickPiece(s)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Big Brother's shelf card: everything beyond the library. */}
            {!searching && (
              <button type="button" className={styles.claudeCard} onClick={() => setHandoff(true)}>
                <svg viewBox="0 0 24 24">
                  <path d={P.spark} />
                </svg>
                <span className={styles.claudeCardText}>
                  <b>Something bigger?</b> An app, live numbers, AI - that one deserves Claude.
                </span>
                <svg className={styles.claudeCardGo} viewBox="0 0 24 24">
                  <path d={P.chev} />
                </svg>
              </button>
            )}

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.advanced}>
              <Link href="/app/create?mode=advanced" className={styles.advancedLink}>
                Paste your own HTML instead
              </Link>
            </div>
          </section>
        )}

        {/* ============ ACT III · THE CRAFT (born on mount) ============ */}
        {phase === 'craft' && built && meta && (
          <section className={`${styles.act} ${styles.actCraft} ${leaving ? styles.leave : ''}`}>
            <header className={styles.top}>
              <button className={styles.back} onClick={startOver} aria-label="Start over">
                <svg viewBox="0 0 24 24">
                  <path d={P.restart} />
                </svg>
              </button>
              <div className={styles.brandBlk}>
                <span className={styles.eyebrow}>TILE BUILDER</span>
                <span className={styles.headSerif}>
                  Built by Vee. <em>Finished by you.</em>
                </span>
              </div>
              <span className={styles.draft}>{meta.label.toUpperCase()} · DRAFT</span>
            </header>

            <div className={styles.leftCol}>
              {/* the piece: the REAL sealed tile + the instrument dock, one object */}
              <div className={styles.pieceWrap}>
                <div className={styles.pieceGlow} aria-hidden />
                <section className={`${styles.piece} ${flashOn ? styles.pieceFlash : ''}`}>
                  <div className={styles.frameStack} data-building={building ? 'true' : undefined}>
                    {prevHtml && (
                      <iframe
                        key="prev"
                        className={`${styles.frame} ${styles.framePrev}`}
                        srcDoc={prevHtml}
                        sandbox="allow-scripts"
                        title="Previous tile"
                        aria-hidden
                        tabIndex={-1}
                      />
                    )}
                    <iframe
                      key={nonce}
                      className={`${styles.frame} ${styles.frameLive}`}
                      srcDoc={built.html}
                      sandbox="allow-scripts"
                      title="Live preview of your tile"
                    />
                    <button className={styles.frameVeil} onClick={() => setFsOpen(true)} aria-label="Open this tile full screen">
                      <span className={styles.tileHint} aria-hidden>
                        <svg viewBox="0 0 24 24">
                          <path d={P.expand} />
                        </svg>
                        TAP TO OPEN
                      </span>
                    </button>
                  </div>

                  <div className={`${styles.dock} ${showGoalKnob ? '' : styles.dockNoGoal}`}>
                    {showGoalKnob && (
                      <div className={`${styles.cell} ${styles.cellGoal}`}>
                        <span className={styles.cellLabel}>{meta.goalDirection === 'down' ? 'DAILY CAP' : 'DAILY GOAL'}</span>
                        <div className={styles.stepper}>
                          <button className={styles.stepBtn} onClick={() => stepGoal(-1)} aria-label="Lower goal">
                            <svg viewBox="0 0 24 24">
                              <path d={P.minus} />
                            </svg>
                          </button>
                          <span key={fmtGoal(meta.target!)} className={styles.goalNum}>
                            {fmtVal(meta.target!, meta.unit)}
                          </span>
                          <button className={styles.stepBtn} onClick={() => stepGoal(1)} aria-label="Raise goal">
                            <svg viewBox="0 0 24 24">
                              <path d={P.plus} />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                    <div className={`${styles.cell} ${styles.cellName}`}>
                      <label className={styles.cellLabel} htmlFor="tb-name">
                        NAME
                      </label>
                      <input
                        id="tb-name"
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onFocus={() => {
                          nameFocusedRef.current = true
                        }}
                        onBlur={() => {
                          nameFocusedRef.current = false
                          commitName()
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        }}
                        type="text"
                        maxLength={24}
                        autoComplete="off"
                        spellCheck={false}
                        aria-label="Tile name"
                      />
                    </div>
                    <div className={`${styles.cell} ${styles.cellAccent}`}>
                      <span className={styles.cellLabel}>ACCENT</span>
                      <div className={styles.swatches}>
                        {ACCENT_LIST.map((a) => (
                          <button
                            key={a}
                            className={`${styles.swatch} ${accent === a ? styles.swatchSel : ''}`}
                            style={{ ['--sw' as string]: ACCENTS[a].hex }}
                            onClick={() => pickAccent(a)}
                            aria-label={`${a} accent`}
                            aria-pressed={accent === a}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* how it lives on the board */}
              <section className={styles.board}>
                <div className={styles.boardHead}>
                  <span className={styles.boardLabel}>ON YOUR DASHBOARD</span>
                  <span className={styles.boardDot} />
                  <span className={styles.boardHint}>
                    <svg viewBox="0 0 24 24">
                      <path d={P.expand} />
                    </svg>
                    TAP TO OPEN
                  </span>
                </div>
                <div className={styles.boardGrid}>
                  <div className={styles.ghostTile} aria-hidden />
                  <button className={styles.poster} onClick={() => setFsOpen(true)} aria-label="Open your tile full screen">
                    <span className={styles.posterExpand}>
                      <svg viewBox="0 0 24 24">
                        <path d={P.expand} />
                      </svg>
                    </span>
                    <span className={styles.posterTop}>
                      <svg viewBox="0 0 24 24">
                        <path d={P.spark} />
                      </svg>
                      <span className={styles.posterName}>{meta.label}</span>
                    </span>
                    <span className={styles.posterBody}>
                      <span className={styles.posterRing}>
                        <svg viewBox="0 0 100 100">
                          <circle className={styles.prTrack} cx="50" cy="50" r="40" />
                          <circle
                            className={styles.prArc}
                            cx="50"
                            cy="50"
                            r="40"
                            strokeDasharray={POSTER_C}
                            strokeDashoffset={(POSTER_C * (1 - posterP)).toFixed(1)}
                            transform="rotate(-90 50 50)"
                          />
                        </svg>
                        <span className={styles.posterNum}>{fmtVal(todayVal, meta.unit)}</span>
                      </span>
                    </span>
                    <span className={styles.posterFoot}>{posterFoot}</span>
                  </button>
                  <div className={styles.ghostTile} aria-hidden />
                </div>
              </section>
            </div>

            <div className={styles.rightCol}>
              {/* The knobs: every way this piece can change, visible and tappable */}
              <section className={styles.refine}>
                <div className={styles.refineHead}>
                  <span className={styles.refineLabel}>
                    <svg viewBox="0 0 24 24">
                      <path d={P.spark} />
                    </svg>
                    MAKE IT YOURS · <b>{shape ? shape.shape.toUpperCase() : 'THE PIECE'}</b>
                  </span>
                  <span className={styles.refineVocab}>NAME + GOAL + COLOR LIVE ON THE PIECE</span>
                </div>

                {shape && shape.units.length > 0 && meta && (
                  <div className={styles.knob}>
                    <span className={styles.knobLabel}>MEASURED IN</span>
                    <div className={styles.knobChips}>
                      {shape.units.map((u) => (
                        <button
                          key={u}
                          className={`${styles.knobChip} ${meta.unit === u ? styles.knobChipOn : ''}`}
                          onClick={() => pickUnit(u)}
                          disabled={building}
                        >
                          {UNIT_WORD[u] ?? u}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {shape?.id === 'rating' && meta && (
                  <div className={styles.knob}>
                    <span className={styles.knobLabel}>THE DIAL</span>
                    <div className={styles.knobChips}>
                      {([5, 10] as const).map((m) => (
                        <button
                          key={m}
                          className={`${styles.knobChip} ${meta.scaleMax === m ? styles.knobChipOn : ''}`}
                          onClick={() => pickScale(m)}
                          disabled={building}
                        >
                          out of {m}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {shape?.aim && meta && (
                  <div className={styles.knob}>
                    <span className={styles.knobLabel}>THE AIM</span>
                    <div className={styles.knobChips}>
                      <button
                        className={`${styles.knobChip} ${meta.goalDirection !== 'down' ? styles.knobChipOn : ''}`}
                        onClick={() => pickAim('up')}
                        disabled={building}
                      >
                        more is good
                      </button>
                      <button
                        className={`${styles.knobChip} ${meta.goalDirection === 'down' ? styles.knobChipOn : ''}`}
                        onClick={() => pickAim('down')}
                        disabled={building}
                      >
                        less is good
                      </button>
                    </div>
                  </div>
                )}

                <div
                  className={`${styles.confirm} ${confirm.show ? styles.confirmShow : ''} ${
                    confirm.busy ? styles.confirmBusy : ''
                  } ${confirm.warn ? styles.confirmWarn : ''}`}
                  role="status"
                >
                  <span className={styles.thinking}>
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className={styles.doneWrap}>
                    <span key={confirm.msg} className={styles.checkRing}>
                      <svg viewBox="0 0 24 24">
                        <path d="M4 12.5l5 5L20 6.5" />
                      </svg>
                    </span>
                    <span className={styles.msg}>
                      <span className={styles.msgTag}>VEE</span>
                      {confirm.msg}
                    </span>
                  </span>
                </div>

              </section>

              {/* commit */}
              <section className={styles.ctaWrap}>
                <button className={`${styles.cta} ${added ? styles.ctaAdded : ''}`} onClick={add} disabled={added}>
                  <span className={styles.ctaLabel}>Add to dashboard</span>
                  <span className={styles.ctaDone}>
                    <svg viewBox="0 0 24 24">
                      <path d={P.check} />
                    </svg>
                    Added to your dashboard
                  </span>
                </button>
                {added ? (
                  <p className={styles.quiet}>
                    ON YOUR DASHBOARD ·{' '}
                    <Link href="/app" className={styles.again}>
                      SEE IT LIVE
                    </Link>{' '}
                    ·{' '}
                    <button className={styles.again} onClick={startOver}>
                      ADD ANOTHER PIECE
                    </button>
                  </p>
                ) : (
                  <p className={styles.quiet}>FREE · BUILT INSTANTLY · NO CLAUDE NEEDED</p>
                )}
                {/* the puzzle strip: everything added this visit, one little system */}
                {pack.length > 0 && (
                  <p className={styles.packLine}>
                    <svg viewBox="0 0 24 24">
                      <path d={P.spark} />
                    </svg>
                    YOUR PACK · {pack.join(' · ')}
                  </p>
                )}
              </section>
            </div>
          </section>
        )}
      </main>

      {/* ============ FULL SCREEN · the opened tile (real openCard behavior) ============ */}
      {fsOpen && built && (
        <div className={styles.fs} role="dialog" aria-modal="true" aria-label={`${built.meta.label} full screen`}>
          <div className={styles.fsBackdrop} onClick={() => setFsOpen(false)} />
          <div className={styles.fsCard}>
            <button className={styles.fsClose} onClick={() => setFsOpen(false)} aria-label="Close">
              <svg viewBox="0 0 24 24">
                <path d={P.close} />
              </svg>
            </button>
            <iframe
              className={styles.fsFrame}
              srcDoc={built.html}
              sandbox="allow-scripts"
              title={`${built.meta.label} full screen`}
            />
          </div>
        </div>
      )}
    </div>
  )
}

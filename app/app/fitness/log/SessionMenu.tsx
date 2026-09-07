'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type React from 'react'
import { useEffect, useRef, useState, useTransition } from 'react'
import dashboardStyles from '../../dashboard.module.css'
import fitnessStyles from '../fitness.module.css'
import styles from './sessionMenu.module.css'
import { SPLIT, type DayType, type Category, type SplitDay } from './splitData'
import { setUnits as setUnitsAction, startDeload, endDeload, startNewWeek, revertNewWeek } from './actions'
import { kgToDisplay, unitLabel, type Units } from '@/lib/units'
import { SettingsGear } from '@/components/SettingsGear'
import SettingsSheet from './SettingsSheet'
import DeloadConfirm from './DeloadConfirm'
import NewWeekConfirm from './NewWeekConfirm'
import SplitGlyph, { getSplitGlyphKind } from '@/components/SplitGlyph'
import { createClient } from '@/lib/supabase/client'
import { deleteWorkout, type DayStatus } from '@/lib/workouts/queries'

interface SessionMenuProps {
  /** Customized rotation from training_settings. Falls back to default Vitality 8-day. */
  split?: SplitDay[]
  /** Initial unit preference from user_profile. The toggle in the top-right
   *  updates this and persists via the setUnits server action. */
  units?: Units
  /** Whether the user has completed the 11-question tailored intake.
   *  Drives the Completed badge on the SettingsSheet "Tailor my split" row. */
  intakeCompleted?: boolean
  /** Current user id — needed for the completed-tile delete (RLS-scoped). */
  userId?: string
  /** Today's local date key (YYYY-MM-DD). Used to tell a past unfinished
   *  session apart from one still in progress today. */
  todayKey?: string
  /** day_name → most recent workout status, for completed / not-finished tiles. */
  dayStatuses?: Record<string, DayStatus>
  /** "Start a new week" marker (ISO timestamp) or null. The previous value is
   *  what Undo restores to; the page has already filtered out pre-marker
   *  completions, so this is only used to seed the undo target. */
  cycleStartedAt?: string | null
  /** Deload-week state, derived in page.tsx from training_settings.deload_started_on.
   *  When active, the "Take a deload week" pill flips to a tappable "deload week"
   *  badge (moon, periwinkle) that ends the deload on tap. */
  deloadActive?: boolean
  deloadRemaining?: number
  deloadTotal?: number
}

/**
 * Entry point of SplitLog v2 — the "Today's Session" view.
 *
 * Card grid of every day in the user's rotation. Today's day is highlighted
 * with a "next up" treatment (mint glow border + caption). Tap a card to
 * enter that day's logger at /app/fitness/log/[day].
 *
 * Today-day is still hardcoded to Day 1 for the mock. When we wire the
 * "current rotation position" persistence, compute from
 * training_settings.start_date + completed_sessions count modulo
 * rotation length.
 */

const TODAY_DAY_NUM = 1 // Still mocked — needs current-position tracking

const dayTypePillClass: Record<DayType, string> = {
  HEAVY:    styles.pillHeavy,
  VOLUME:   styles.pillVolume,
  RECOVERY: styles.pillRest,
}

const categoryArtClass: Record<Category, string> = {
  push: styles.artPush,
  pull: styles.artPull,
  legs: styles.artLegs,
  rest: styles.artRest,
  upper: styles.artUpper,
  lower: styles.artLower,
}

// ── Inline glyphs for the completed-tile footer (mono-weight strokes to
//    match the editorial chrome). Kept here so the tile reads self-contained.
const ICON_SEAL = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5 L10 17.5 L19 7" />
  </svg>
)
const ICON_VIEW = (
  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 7 C3 3.5 11 3.5 13 7 C11 10.5 3 10.5 1 7Z" /><circle cx="7" cy="7" r="1.7" />
  </svg>
)
const ICON_COPY = (
  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4.5" y="4.5" width="7.5" height="7.5" rx="1.6" />
    <path d="M9.5 4.5 V3 A1.4 1.4 0 0 0 8.1 1.6 H3 A1.4 1.4 0 0 0 1.6 3 V8.1 A1.4 1.4 0 0 0 3 9.5 H4.5" />
  </svg>
)
const ICON_TRASH = (
  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 4 H11.5 M5 4 V2.8 A1 1 0 0 1 6 1.8 H8 A1 1 0 0 1 9 2.8 V4 M3.6 4 L4.1 11.2 A1 1 0 0 0 5.1 12 H8.9 A1 1 0 0 0 9.9 11.2 L10.4 4" />
  </svg>
)
const ICON_MORE = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
  </svg>
)

/** Logged-vs-total set count for an in-progress session, mirroring the logger's
 *  own progress bar (a set counts as logged once it's done OR missed). */
function sessionProgress(status: DayStatus): { logged: number; total: number } {
  let logged = 0
  let total = 0
  for (const ex of status.exercises) {
    for (const s of ex.sets) {
      total += 1
      if (s.done || s.failed) logged += 1
    }
  }
  return { logged, total }
}

export default function SessionMenu({ split, units: initialUnits = 'metric', intakeCompleted = false, userId, todayKey, dayStatuses = {}, cycleStartedAt = null, deloadActive = false, deloadRemaining = 0, deloadTotal = 0 }: SessionMenuProps = {}) {
  const days = split && split.length > 0 ? split : SPLIT
  const [dateStr, setDateStr] = useState('')
  const [units, setUnits] = useState<Units>(initialUnits)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [, startTransition] = useTransition()
  const particlesRef = useRef<HTMLDivElement | null>(null)
  const router = useRouter()

  // Local mutable copy of the day → status map so deleting a completed
  // workout drops its tile back to the planned state without a reload.
  const [statuses, setStatuses] = useState<Record<string, DayStatus>>(dayStatuses)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number | null>(null)
  const [deletingDay, setDeletingDay] = useState<string | null>(null)
  // Deleting a logged workout is permanent + can't be undone, so a completed-day
  // delete is ARMED here first and always asks before it fires — never on a
  // single (possibly accidental) tap.
  const [deleteTarget, setDeleteTarget] = useState<{ day: string; status: DayStatus } | null>(null)
  const [deloadOpen, setDeloadOpen] = useState(false)
  const [newWeekOpen, setNewWeekOpen] = useState(false)
  // After a "start a new week" reset: the previous marker (to undo back to) plus
  // a snapshot of the tiles, so Undo restores the exact board. Lives only in
  // client state — leaving the page (unmount) drops it, matching "revertable
  // until you leave".
  const [revertInfo, setRevertInfo] = useState<{ prev: string | null; snapshot: Record<string, DayStatus> } | null>(null)
  const revertTimer = useRef<number | null>(null)
  // Which completed tile's "..." overflow menu is open (by day name), if any.
  const [openMenuDay, setOpenMenuDay] = useState<string | null>(null)

  // Training day names (rest days excluded) — the pass a deload eases.
  const trainingDayNames = Array.from(new Set(days.filter(d => d.exercises.length > 0).map(d => d.name)))

  // Start a deload from the schedule: best-effort persist, then stay right here
  // on the "Today's session" board (it re-renders with the deload badge active).
  // We deliberately DON'T navigate to a day — jumping to the first training day
  // felt random; the user picks the day they're training as usual.
  async function confirmDeloadFromMenu() {
    setDeloadOpen(false)
    await startDeload()
    router.refresh()
  }
  // End the deload from the board: clear the marker, then refresh so the badge
  // flips back to "Take a deload week".
  async function endDeloadFromMenu() {
    await endDeload()
    router.refresh()
  }

  // Start a new week — wipe the board to a clean slate, keep every logged set.
  // Optimistically drops the completed tiles now (in-progress / unfinished stay —
  // they're openable, never the trapped state), snapshots first so Undo can
  // bring the exact board back, then persists + refreshes.
  async function confirmNewWeek() {
    setNewWeekOpen(false)
    const snapshot = statuses
    setStatuses(prev => {
      const next: Record<string, DayStatus> = {}
      for (const [name, s] of Object.entries(prev)) if (!s.submittedAt) next[name] = s
      return next
    })
    setRevertInfo({ prev: cycleStartedAt, snapshot })
    if (revertTimer.current != null) window.clearTimeout(revertTimer.current)
    revertTimer.current = window.setTimeout(() => setRevertInfo(null), 60 * 60 * 1000)
    showToast('New week — clean slate. Your history is safe.')
    await startNewWeek()
    router.refresh()
  }

  async function undoNewWeek() {
    if (!revertInfo) return
    const { prev, snapshot } = revertInfo
    setStatuses(snapshot)
    setRevertInfo(null)
    if (revertTimer.current != null) window.clearTimeout(revertTimer.current)
    showToast('Reverted — back to where you were.')
    await revertNewWeek(prev)
    router.refresh()
  }

  // Clean up the 1-hour revert timer on unmount.
  useEffect(() => () => { if (revertTimer.current != null) window.clearTimeout(revertTimer.current) }, [])

  // Close an open "..." overflow menu on any outside click.
  useEffect(() => {
    if (!openMenuDay) return
    function close() { setOpenMenuDay(null) }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [openMenuDay])

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 1800)
  }
  useEffect(() => () => { if (toastTimer.current != null) window.clearTimeout(toastTimer.current) }, [])

  function copyWorkout(dayName: string, status: DayStatus) {
    const lbl = unitLabel(units)
    const lines = status.exercises
      .map((ex) => {
        const top = ex.sets
          .filter((s) => s.done && !s.failed && (s.weight ?? 0) > 0 && (s.reps ?? 0) > 0)
          .reduce<{ w: number; r: number } | null>((best, s) => {
            const w = s.weight ?? 0
            return !best || w > best.w ? { w, r: s.reps ?? 0 } : best
          }, null)
        if (!top) return null
        return `• ${ex.name}  ${kgToDisplay(top.w, units)} ${lbl} × ${top.r}`
      })
      .filter(Boolean)
    const text = `${dayName} — ${status.setCount} sets\n${lines.join('\n')}`
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {})
    showToast('workout copied to clipboard')
  }

  async function handleDelete(dayName: string, status: DayStatus) {
    if (!userId || deletingDay) return
    setDeletingDay(dayName)
    // Optimistic: drop the tile NOW so a slow connection never looks frozen.
    // The old flow awaited the network FIRST, so nothing changed on screen for
    // seconds and re-taps were swallowed by the guard above ("took 2 minutes,
    // didn't work, then it did"). Snapshot so we can put the day back on failure.
    const snapshot = statuses
    setStatuses((prev) => {
      const next = { ...prev }
      delete next[dayName]
      return next
    })
    showToast(`${dayName} workout deleted`)
    try {
      await deleteWorkout(createClient(), { workoutId: status.workoutId, userId })
      // Invalidate Next's client Router Cache so navigating away and back shows
      // the delete instead of a stale "logged" board (Next 14 caches the RSC
      // payload for 30s-5min). Every other board mutation already does this.
      router.refresh()
    } catch (e) {
      console.error('[SessionMenu] deleteWorkout failed:', e)
      setStatuses(snapshot) // revert — the day is still there
      showToast('could not delete, try again')
    } finally {
      setDeletingDay(null)
    }
  }

  // ── Swipe-left-to-edit ────────────────────────────────────────────
  // Drag (or click-drag) a day tile to the left to peel back an "Edit"
  // panel; pull past the commit threshold and release to jump straight
  // into that day's exercise editor (/app/fitness/setup?editDay=idx).
  // One tile is "active" at a time. `snap` switches the transform from
  // finger-tracking (no transition) to a spring-back/commit glide.
  const COMMIT_PX = 92   // pull this far left to trigger the edit jump
  const MAX_PULL = 116   // rubber-band stop; matches the Edit action width
  // React owns ONLY which tile is "active" (so the Edit panel behind it is
  // shown). The live transform is written straight to the card's DOM node on
  // every pointermove — never through React state — so the tile tracks the
  // finger 1:1 with zero render latency and zero transition lag. Routing the
  // drag through setState (a re-render per move) + an 80ms transition is what
  // made it feel laggy before.
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  // Live DOM handles to each swipeable card so the handlers (and the one-time
  // hint) can move them imperatively.
  const cardEls = useRef<Map<number, HTMLAnchorElement>>(new Map())
  // All live gesture bookkeeping lives in refs so the pointermove/up
  // handlers never depend on state having committed yet (avoids a
  // stale-closure dead-zone on the very first move after pointerdown).
  const dragIdx = useRef<number | null>(null)
  const startX = useRef(0)
  const startY = useRef(0)
  const curDx = useRef(0)
  const axis = useRef<'idle' | 'h' | 'v'>('idle')
  const moved = useRef(false)
  const snapTimer = useRef<number | null>(null)

  // Glide curves. Drag = no transition (1:1 finger tracking). Commit = a fast
  // ease-in "whoosh" the rest of the way off-screen. Spring = a soft settle
  // back when released short of the threshold.
  const COMMIT_GLIDE = 'transform 200ms cubic-bezier(0.4, 0, 1, 1)'
  const SPRING_GLIDE = 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1)'

  // The Edit action panel sits as the card's previous sibling inside the slot.
  function revealOf(el: HTMLElement | null): HTMLElement | null {
    return (el?.previousElementSibling as HTMLElement | null) ?? null
  }

  function clearSnapTimer() {
    if (snapTimer.current != null) {
      window.clearTimeout(snapTimer.current)
      snapTimer.current = null
    }
  }

  // Write the card's transform straight to the DOM — no React render in the
  // hot path. `instant` skips the transition for true 1:1 finger tracking.
  function paint(el: HTMLAnchorElement | null, x: number, instant: boolean) {
    if (!el) return
    el.style.transition = instant ? 'none' : el.style.transition
    el.style.transform = `translateX(${x}px)`
    const reveal = revealOf(el)
    if (reveal) reveal.style.setProperty('--p', String(Math.min(1, -x / COMMIT_PX)))
  }

  function onCardPointerDown(e: React.PointerEvent, idx: number) {
    // Only the primary button / a touch; ignore right-clicks.
    if (e.button !== 0 && e.pointerType === 'mouse') return
    clearSnapTimer()
    dragIdx.current = idx
    startX.current = e.clientX
    startY.current = e.clientY
    curDx.current = 0
    axis.current = 'idle'
    moved.current = false
    const el = cardEls.current.get(idx) ?? (e.currentTarget as HTMLAnchorElement)
    el.style.transition = 'none'
    // Reveal the Edit panel behind the card (single render, gesture start only).
    setActiveIdx(idx)
  }

  function onCardPointerMove(e: React.PointerEvent, idx: number) {
    if (dragIdx.current !== idx) return
    const dx = e.clientX - startX.current
    const dy = e.clientY - startY.current
    if (axis.current === 'idle') {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      // Lock the axis on first real movement. Vertical wins ties so the
      // page still scrolls normally; horizontal captures the pointer.
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      if (axis.current === 'h') {
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch {}
      }
    }
    if (axis.current !== 'h') return
    e.preventDefault()
    moved.current = true
    // Left-only. Rubber-band beyond MAX_PULL so it feels anchored.
    let next = Math.min(0, dx)
    if (next < -MAX_PULL) next = -MAX_PULL + (next + MAX_PULL) * 0.18
    curDx.current = next
    // 1:1 with the finger — straight to the DOM, no transition, no re-render.
    paint(cardEls.current.get(idx) ?? (e.currentTarget as HTMLAnchorElement), next, true)
  }

  function endSwipe(idx: number) {
    if (dragIdx.current !== idx) return
    const committed = axis.current === 'h' && curDx.current <= -COMMIT_PX
    dragIdx.current = null
    axis.current = 'idle'
    const el = cardEls.current.get(idx) ?? null
    if (committed) {
      // One satisfying motion: the card keeps sliding the rest of the way
      // off-screen left (Apple-notification style), and we hand off to the
      // editor as it clears — fast, continuous, no dead pause.
      if (el) {
        const reveal = revealOf(el)
        if (reveal) reveal.style.setProperty('--p', '1')
        el.style.transition = COMMIT_GLIDE
        el.style.transform = 'translateX(-112%)'
      }
      clearSnapTimer()
      snapTimer.current = window.setTimeout(() => {
        router.push(`/app/fitness/setup?editDay=${idx}`)
      }, 120)
      return
    }
    // Spring back, then drop the active state so transforms reset cleanly.
    if (el) {
      el.style.transition = SPRING_GLIDE
      el.style.transform = 'translateX(0px)'
      const reveal = revealOf(el)
      if (reveal) reveal.style.setProperty('--p', '0')
    }
    clearSnapTimer()
    snapTimer.current = window.setTimeout(() => {
      if (el) { el.style.transition = ''; el.style.transform = '' }
      setActiveIdx(null)
    }, 300)
  }

  useEffect(() => () => clearSnapTimer(), [])

  // Discoverability: ONCE ever, give today's card a small "peek" so the user
  // learns a left-swipe edits the day. Subtle (a ~30px nudge revealing a
  // sliver of the green Edit action) and gated on localStorage so it never
  // nags. Skipped if the user is already interacting.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try { if (localStorage.getItem('swipeEditHintSeen')) return } catch { return }
    const hintIdx = days.findIndex(d => d.day === TODAY_DAY_NUM && d.type !== 'RECOVERY')
    if (hintIdx < 0) return
    try { localStorage.setItem('swipeEditHintSeen', '1') } catch {}
    const t1 = window.setTimeout(() => {
      if (dragIdx.current !== null) return
      const el = cardEls.current.get(hintIdx)
      if (!el) return
      const reveal = revealOf(el)
      setActiveIdx(hintIdx) // fade the Edit panel in behind the card
      // Next frame: nudge the card open a sliver, then settle it back.
      requestAnimationFrame(() => {
        el.style.transition = SPRING_GLIDE
        el.style.transform = 'translateX(-34px)'
        if (reveal) reveal.style.setProperty('--p', String(Math.min(1, 34 / COMMIT_PX)))
      })
      window.setTimeout(() => {
        if (dragIdx.current !== null) return
        el.style.transition = SPRING_GLIDE
        el.style.transform = 'translateX(0px)'
        if (reveal) reveal.style.setProperty('--p', '0')
        window.setTimeout(() => {
          if (dragIdx.current !== null) return
          el.style.transition = ''
          el.style.transform = ''
          setActiveIdx(null)
        }, 340)
      }, 720)
    }, 1200)
    return () => window.clearTimeout(t1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Editorial atmosphere — drifting mint particles across the page.
  // Same drift mechanic as the landing/creators. vh-based translate
  // (NOT % — % is element-relative and a 1.5px dot moves 1.5px).
  useEffect(() => {
    const root = particlesRef.current
    if (!root) return

    const N = window.innerWidth < 640 ? 12 : 20
    const created: HTMLSpanElement[] = []

    for (let i = 0; i < N; i++) {
      const s = document.createElement('span')
      const x = Math.random() * 100
      const startY = 60 + Math.random() * 40
      const dur = 20 + Math.random() * 26
      const delay = -Math.random() * dur
      const dx = Math.random() * 30 - 15 + 'px'
      const dy = -(60 + Math.random() * 50) + 'vh'
      const size = 1.2 + Math.random() * 1.2
      s.style.left = x + '%'
      s.style.top = startY + '%'
      s.style.width = s.style.height = size + 'px'
      s.style.animationDuration = dur + 's'
      s.style.animationDelay = delay + 's'
      s.style.setProperty('--dx', dx)
      s.style.setProperty('--dy', dy)
      root.appendChild(s)
      created.push(s)
    }

    return () => {
      created.forEach((s) => s.remove())
    }
  }, [])

  function toggleUnits(next: Units) {
    if (next === units) return
    setUnits(next) // optimistic
    startTransition(async () => {
      const res = await setUnitsAction(next)
      if (!res.ok) {
        setUnits(units) // revert on failure
      }
    })
  }

  useEffect(() => {
    setDateStr(
      new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    )
  }, [])

  return (
    <main className={`${dashboardStyles.page} ${styles.editorialPage} grain-overlay`}>
      {/* Editorial atmosphere — mint glow aurora behind everything,
          mirrored mountain horizon at the bottom (same SVG paths as
          the landing for visual continuity), drifting particle field.
          All pointer-events: none, z-index below the shell. */}
      <div className={styles.atmosphere} aria-hidden />

      <div className={styles.mountainsLayer} aria-hidden>
        <svg viewBox="0 0 1600 420" preserveAspectRatio="none">
          <defs>
            <linearGradient id="session-mt-far" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d1a17" stopOpacity="0" />
              <stop offset="55%" stopColor="#0d1a17" stopOpacity=".55" />
              <stop offset="100%" stopColor="#0d1a17" stopOpacity=".95" />
            </linearGradient>
            <linearGradient id="session-mt-near" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#050a09" stopOpacity=".4" />
              <stop offset="60%" stopColor="#050a09" stopOpacity=".95" />
              <stop offset="100%" stopColor="#050a09" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path
            d="M0,300 L120,230 L210,260 L320,180 L430,220 L560,150 L680,210 L820,170 L960,220 L1100,180 L1240,240 L1380,200 L1500,250 L1600,220 L1600,420 L0,420 Z"
            fill="url(#session-mt-far)"
          />
          <path
            d="M0,360 L100,320 L220,340 L340,290 L460,330 L590,300 L720,340 L860,310 L1000,350 L1140,310 L1280,355 L1420,320 L1540,360 L1600,340 L1600,420 L0,420 Z"
            fill="url(#session-mt-near)"
          />
        </svg>
      </div>

      <div className={styles.particles} ref={particlesRef} aria-hidden />

      <div className={`${dashboardStyles.shell} ${styles.editorialShell}`}>
        <div className={fitnessStyles.header}>
          <div className={styles.topRow}>
            <Link href="/app" className={fitnessStyles.back}>
              <span className={fitnessStyles.backArrow}>←</span> Vitality
            </Link>
            {/* Right-cluster: wide "Adjust your training" pill paired
                with the settings gear. Same pill-button vocabulary as
                the gear (hairline border, mint accent, --card bg) so the
                two read as a chrome cluster. The pill surfaces the
                setup re-entry that used to live three taps deep behind
                the gear -> SettingsSheet -> "Tailor my split" row. */}
            <div className={styles.topRowRight}>
              {/* Log a session you trained away from your phone — back-dated into
                  history. Always available, sits left of the deload pill. */}
              <Link href="/app/fitness/log/past" className={`${styles.actPill} ${styles.pastPill}`}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 3v5h5" />
                  <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
                  <path d="M12 7v5l3.5 2" />
                </svg>
                <span className={styles.pillLabel}>Log a past workout</span>
              </Link>
              {/* Start a deload. Hidden while one is active — the active state +
                  "end" lives next to the "Today's session" title below, so it's
                  where the eye expects it (mirrors the day logger). */}
              {!deloadActive && (
                <button
                  type="button"
                  className={`${styles.actPill} ${styles.deloadPill}`}
                  onClick={() => setDeloadOpen(true)}
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z" />
                  </svg>
                  <span className={styles.pillLabel}>Take a deload week</span>
                </button>
              )}
              <button
                type="button"
                className={`${styles.actPill} ${styles.weekPill}`}
                onClick={() => setNewWeekOpen(true)}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 3v3m0 12v3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M3 12h3m12 0h3M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1" />
                  <circle cx="12" cy="12" r="3.4" />
                </svg>
                <span className={styles.pillLabel}>Start a new week</span>
              </button>
              <Link href="/app/fitness/setup" className={styles.adjustPill}>
                <span className={styles.adjustPillIcon} aria-hidden>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2 L21 7 L21 17 L12 22 L3 17 L3 7 Z" />
                    <path d="M12 12 L21 7" />
                    <path d="M12 12 L3 7" />
                    <path d="M12 12 L12 22" />
                  </svg>
                </span>
                <span className={styles.adjustPillText}>
                  <em>Adjust your training</em>
                </span>
                <span className={styles.adjustPillArrow} aria-hidden>→</span>
              </Link>
              <button
                type="button"
                className={styles.settingsBtn}
                onClick={() => setSettingsOpen(true)}
                aria-label="Settings"
                title="Settings"
              >
                <SettingsGear />
              </button>
            </div>
          </div>
          <div className={styles.titleRow}>
            <h1 className={`${fitnessStyles.title} ${deloadActive ? styles.titleDeload : ''}`}>Today&apos;s session</h1>
            {/* Active-deload badge, right beside the title so it's unmistakable
                that this week is a deload. The moon marks it; the divided "end"
                segment makes ending deliberate (one tap, reversible). */}
            {deloadActive && (
              <button
                type="button"
                className={styles.deloadBadge}
                onClick={endDeloadFromMenu}
                aria-label="Deload week active — tap to end"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z" />
                </svg>
                <span className={styles.deloadBadgeLabel}>
                  {deloadTotal > 0 ? `Deload week · ${deloadRemaining} left` : 'Deload week'}
                </span>
                <span className={styles.deloadBadgeEnd}>end</span>
              </button>
            )}
          </div>
          <div className={styles.headerMeta}>
            <p className={fitnessStyles.subtitle}>{dateStr}</p>
            {revertInfo && (
              <div className={styles.revertBar} role="status">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
                </svg>
                <span>New week started.</span>
                <button type="button" className={styles.revertUndo} onClick={undoNewWeek}>Undo</button>
                <span className={styles.revertNote}>revertable for 1 hour, or until you leave</span>
              </div>
            )}
          </div>
        </div>

        {deloadOpen && (
          <DeloadConfirm
            dayNames={trainingDayNames}
            onConfirm={confirmDeloadFromMenu}
            onClose={() => setDeloadOpen(false)}
          />
        )}

        {newWeekOpen && (
          <NewWeekConfirm
            onConfirm={confirmNewWeek}
            onClose={() => setNewWeekOpen(false)}
          />
        )}

        <div className={styles.grid}>
          {days.map((day, i) => {
            const isToday = day.day === TODAY_DAY_NUM
            const isRest = day.type === 'RECOVERY'
            const exerciseCount = day.exercises.length

            // Completion state, derived from the most recent workout row for
            // this day_name. Completed wins over "today" — if you finished
            // today's session, the tile should celebrate it as done, not
            // still invite you in. "Not finished" only fires for a PAST,
            // unsubmitted row (never shame an in-progress session today).
            //
            // A session is stored keyed by day NAME, so a split that runs the
            // same workout twice (e.g. Full Body A on day 1 AND day 5) would
            // otherwise paint the single most-recent session's progress onto
            // BOTH tiles — the "it syncs up with everything" glitch. Bind the
            // status to the FIRST tile carrying a given name only, so the other
            // occurrences read as their own fresh, openable day. Works for any
            // split, including custom/added ones with repeated day names.
            const firstWithName = days.findIndex(d => d.name === day.name) === i
            const status = firstWithName ? statuses[day.name] : undefined
            // The board is "Today's session": a day shows the green "done" check
            // ONLY if you finished it TODAY — so the check always means "fully
            // logged" and never lingers as a stale claim on a fresh day. A day
            // finished on a previous day clears back to a normal openable tile
            // (fresh board, no rotation assumptions); a past unsubmitted day
            // still reads "not finished".
            const isCompleted = !!status?.submittedAt && status.date === todayKey
            // A past, never-submitted day you can resume to finish (drives the
            // ?resume link + the "finish it" cue), with or without logged sets.
            const isPastUnfinished =
              !isCompleted && !!status && !status.submittedAt && !!todayKey && status.date < todayKey && !isRest
            // Logged-vs-total for any non-completed day that has a saved row.
            const prog = !isCompleted && status && !isRest ? sessionProgress(status) : null
            // "In progress" = a logged-but-unsubmitted session, shown with the
            // flashing dot + X/Y bar. Covers TODAY's active session AND a past day
            // left unfinished, so the live progress never vanishes the next day (it
            // just gains a "finish it" cue). Keyed off the row's date.
            const isInProgress =
              !!prog && prog.logged > 0 && !!todayKey && (status?.date === todayKey || isPastUnfinished)
            // A past unfinished day with NOTHING logged falls back to a plain
            // "Not finished" line (there's no progress to show).
            const isUnfinished = isPastUnfinished && !(prog && prog.logged > 0)

            // ── Completed tile: planning text relaxes off, a mint seal comes
            //    on, and the footer turns into view / copy / delete. It's a
            //    plain container (not a Link) so the buttons own every tap.
            // ── Completed tile: a finished day is a WIN you can always do
            //    again, never a dead end. The whole card opens its day (fresh
            //    slate on a new date, today's session if you already trained it
            //    today). A soft mint seal + "done" badge celebrates it; the
            //    secondary view / copy / delete tuck behind a "..." overflow so
            //    the main tap stays "open". It's a button, not a Link, so the
            //    overflow buttons can live inside without nesting in an anchor.
            if (isCompleted && status) {
              const menuOpen = openMenuDay === day.name
              return (
                <div
                  key={day.day}
                  className={styles.cardSlot}
                  style={{ animationDelay: `${120 + i * 50}ms` }}
                >
                  <div
                    className={`${styles.card} ${styles.cardDone}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/app/fitness/log/${day.day}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        router.push(`/app/fitness/log/${day.day}`)
                      }
                    }}
                  >
                    <div className={`${styles.cardArt} ${categoryArtClass[day.category]}`} />
                    <div className={styles.cardBody}>
                      <div className={styles.cardTopRow}>
                        <span className={styles.dayMeta}>
                          <span className={styles.dayNum}>·{String(day.day).padStart(2, '0')}</span>
                          <span className={styles.donePill} aria-hidden>done</span>
                        </span>
                        <button
                          type="button"
                          className={styles.moreBtn}
                          aria-label={`${day.name} options`}
                          aria-expanded={menuOpen}
                          onClick={(e) => { e.stopPropagation(); setOpenMenuDay(menuOpen ? null : day.name) }}
                        >
                          {ICON_MORE}
                        </button>
                      </div>

                      <h2 className={`${styles.dayName} ${styles.dayNameDone}`}>{day.name}</h2>

                      <div className={styles.doneRow}>
                        <span className={styles.doneSeal} aria-hidden>
                          {ICON_SEAL}
                          {/* celebration sparkle burst out of the seal */}
                          <span className={styles.doneSparks}>
                            {Array.from({ length: 6 }).map((_, k) => (
                              <span key={k} style={{ '--a': `${k * 60}deg` } as React.CSSProperties} />
                            ))}
                          </span>
                        </span>
                        <span className={styles.doneCount}>{status.setCount} sets</span>
                        <span className={styles.doneInBooks}>in the books</span>
                      </div>

                      <p className={styles.againCue}>
                        <em>Start it again</em>
                        <span aria-hidden>→</span>
                      </p>
                    </div>

                    {menuOpen && (
                      <div className={styles.moreMenu} role="menu" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          role="menuitem"
                          className={styles.moreItem}
                          onClick={(e) => { e.stopPropagation(); setOpenMenuDay(null); router.push(`/app/fitness/log/${day.day}`) }}
                        >
                          <span className={styles.moreItemIcon} aria-hidden>{ICON_VIEW}</span>View log
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className={styles.moreItem}
                          onClick={(e) => { e.stopPropagation(); setOpenMenuDay(null); copyWorkout(day.name, status) }}
                        >
                          <span className={styles.moreItemIcon} aria-hidden>{ICON_COPY}</span>Copy day
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className={`${styles.moreItem} ${styles.moreItemDel}`}
                          disabled={deletingDay === day.name}
                          onClick={(e) => { e.stopPropagation(); setOpenMenuDay(null); setDeleteTarget({ day: day.name, status }) }}
                        >
                          <span className={styles.moreItemIcon} aria-hidden>{ICON_TRASH}</span>Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            }

            // Rest days have no exercises to reorganize, so they keep the
            // plain tap-to-open behavior with no swipe affordance.
            const swipeable = !isRest
            const active = activeIdx === i
            // A past, unfinished day reopens THAT day's session (its logged sets
            // loaded) via ?resume=<row date>, so you can add what you missed
            // (e.g. forgotten cardio) and finish it - instead of dead-ending
            // into a blank today-session. Normal/today days omit it, open today.
            const dayHref = isPastUnfinished && status
              ? `/app/fitness/log/${day.day}?resume=${status.date}`
              : `/app/fitness/log/${day.day}`

            const cardInner = (
              <Link
                href={dayHref}
                draggable={false}
                // The live transform lives on the DOM node (written imperatively
                // by the gesture handlers), never on this style prop — so React
                // re-renders never fight the drag.
                ref={swipeable ? (el) => {
                  if (el) cardEls.current.set(i, el as unknown as HTMLAnchorElement)
                  else cardEls.current.delete(i)
                } : undefined}
                className={`${styles.card} ${isInProgress ? styles.cardInProgress : isUnfinished ? styles.cardUnfinished : isToday ? styles.cardToday : ''} ${isRest ? styles.cardRest : ''} ${active ? styles.cardDragging : ''}`}
                onPointerDown={swipeable ? (e) => onCardPointerDown(e, i) : undefined}
                onPointerMove={swipeable ? (e) => onCardPointerMove(e, i) : undefined}
                onPointerUp={swipeable ? () => endSwipe(i) : undefined}
                onPointerCancel={swipeable ? () => endSwipe(i) : undefined}
                onClick={(e) => {
                  // A swipe gesture should never also fire the tap-to-open
                  // navigation underneath it.
                  if (moved.current) {
                    e.preventDefault()
                    moved.current = false
                  }
                }}
              >
                <div className={`${styles.cardArt} ${categoryArtClass[day.category]}`} />

                <div className={styles.cardBody}>
                  <div className={styles.cardTopRow}>
                    <span className={styles.dayMeta}>
                      <span className={styles.dayNum}>
                        ·{String(day.day).padStart(2, '0')}
                      </span>
                      {isInProgress ? (
                        <span className={styles.progPill}>
                          <span className={styles.liveDot} aria-hidden />in progress
                        </span>
                      ) : isToday ? (
                        <span className={styles.todayBadge}>
                          <em>today</em>
                        </span>
                      ) : null}
                    </span>
                    <SplitGlyph kind={getSplitGlyphKind(day)} className={styles.cardGlyph} />
                  </div>

                  {/* Title the card by the day's real NAME — the exact same
                      field the logger (SplitLog) titles with. Category drives
                      the art + glyph only; it must never stand in for the name,
                      or a rotation named "Full body A" (tagged category "push")
                      shows "Push" on the card but opens "Full body A". */}
                  <h2 className={styles.dayName}>
                    {day.name}
                  </h2>

                  {isInProgress && prog ? (
                    <div className={styles.progBlock}>
                      <span className={styles.progLabel}>
                        <b>{prog.logged}</b> of {prog.total} logged
                      </span>
                      <div className={styles.progTrack}>
                        <div
                          className={styles.progFill}
                          style={{ width: `${prog.total ? (prog.logged / prog.total) * 100 : 0}%` }}
                        />
                      </div>
                      <p className={styles.progCue}><em>{isPastUnfinished ? 'tap to finish it →' : 'tap to keep going →'}</em></p>
                    </div>
                  ) : (
                    <>
                      <div className={styles.cardBottomRow}>
                        <span className={`${styles.pill} ${dayTypePillClass[day.type]}`}>
                          {isRest ? 'REST' : day.type}
                        </span>
                        {!isRest && (
                          <span className={styles.exCount}>
                            {exerciseCount} exercises
                          </span>
                        )}
                      </div>

                      {isUnfinished ? (
                        <p className={styles.unfinishedCue}>
                          <em>Not finished · tap to finish it</em>
                        </p>
                      ) : isToday ? (
                        <p className={styles.todayCue}>
                          <em>Next up · tap to lock in</em>
                        </p>
                      ) : null}
                    </>
                  )}
                </div>

                <span className={styles.arrow} aria-hidden>→</span>
              </Link>
            )

            if (!swipeable) {
              return (
                <div
                  key={day.day}
                  className={styles.cardSlot}
                  style={{ animationDelay: `${120 + i * 50}ms` }}
                >
                  {cardInner}
                </div>
              )
            }

            return (
              <div
                key={day.day}
                className={`${styles.cardSlot} ${active ? styles.cardSlotActive : ''}`}
                style={{ animationDelay: `${120 + i * 50}ms` }}
              >
                {/* Edit panel revealed behind the card as it slides left. */}
                <div className={styles.editReveal} aria-hidden>
                  <span className={styles.editRevealInner}>
                    <svg
                      className={styles.editRevealIcon}
                      viewBox="0 0 24 24"
                      width="22"
                      height="22"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                    <span className={styles.editRevealLabel}>Edit</span>
                  </span>
                </div>
                {cardInner}
              </div>
            )
          })}
        </div>
      </div>

      {settingsOpen && (
        <SettingsSheet
          units={units}
          onUnitsChange={toggleUnits}
          intakeCompleted={intakeCompleted}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Delete is permanent — always confirm first so a logged session can never
          be erased by a single (accidental) tap. */}
      {deleteTarget && (
        <div className={styles.deleteScrim} onClick={() => setDeleteTarget(null)} role="dialog" aria-modal="true" aria-label="Remove session">
          <div className={styles.deleteSheet} onClick={(e) => e.stopPropagation()}>
            <span className={styles.deleteEyebrow}>permanent</span>
            <h3 className={styles.deleteTitle}>Remove your {deleteTarget.day} session?</h3>
            <p className={styles.deleteMsg}>
              This erases the {deleteTarget.status.setCount} logged sets in it for good. It can&rsquo;t be undone.
            </p>
            <div className={styles.deleteBtns}>
              <button type="button" className={styles.deleteKeep} onClick={() => setDeleteTarget(null)}>Keep it</button>
              <button
                type="button"
                className={styles.deleteRemove}
                disabled={deletingDay === deleteTarget.day}
                onClick={() => { const t = deleteTarget; setDeleteTarget(null); handleDelete(t.day, t.status) }}
              >
                {deletingDay === deleteTarget.day ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`${styles.toast} ${toast ? styles.toastShow : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </main>
  )
}

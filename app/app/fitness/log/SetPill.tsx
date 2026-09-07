'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './log.module.css'
import { kgToDisplay, displayToKg, unitLabel, type Units } from '@/lib/units'
import { MAX_WEIGHT_DISPLAY, MAX_REPS } from '@/lib/workouts/backfill'

export type PillKind = 'empty' | 'clean' | 'over' | 'partial' | 'failed'

interface SetPillProps {
  idx: number
  /** Stored in kg (canonical). Converted to user's display unit at render. */
  prescribedWeight: number
  prescribedReps: number
  /** Stored in kg. */
  currentWeight: number | null
  currentReps: number | null
  kind: PillKind
  isPR: boolean
  /** Display unit. SetPill converts incoming kg → display unit for render
   *  and converts user-typed display value → kg before calling onLog. */
  units: Units
  /** When true, append a small "/ea" indicator to the weight, signalling
   *  the value is per-hand (dumbbell / single-side lifts). */
  perHand?: boolean
  /** Off-day only: the normal-day weight (kg) shown struck out + kept ABOVE the
   *  eased value, so the user always sees what they'd normally do. null/omit =
   *  no "was" line (normal day, or a logged set showing its real number). */
  wasWeightKg?: number | null
  wasReps?: number
  /** Log at the given weight/reps. Weight MUST be in kg. */
  onLog: (weight: number, reps: number) => void
  /** Mark this set as missed (failed). */
  onMiss: () => void
  /** Revert this set back to empty. */
  onUndo: () => void
}

/**
 * SetPill — the six-state confirm pill that replaces the old set row.
 *
 * Two tap zones:
 *   - left (idx + value) → editing mode (inline number inputs)
 *   - right (action label) → log at prescribed (when empty), or undo (when logged)
 *
 * State colors carry the meaning. Words confirm. See
 * docs/superpowers/specs/2026-05-24-splitlog-pill-redesign-design.md.
 */
export default function SetPill({
  idx,
  prescribedWeight,
  prescribedReps,
  currentWeight,
  currentReps,
  kind,
  isPR,
  units,
  perHand,
  wasWeightKg,
  wasReps,
  onLog,
  onMiss,
  onUndo,
}: SetPillProps) {
  // Compact-logger revamp: the row is ALWAYS inline-editable (tap and type any
  // number) rather than a tap-to-open editor. `editWeight`/`editReps` hold the
  // live draft in the user's display unit; "hit it →" commits via onLog (kg).
  const [shimmer, setShimmer] = useState(false)
  const prevKindRef = useRef<PillKind>(kind)
  const shimmerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Draft text for the always-on inputs. Seeded from current (if logged) or
  // prescription (if not), in the user's display unit.
  const seedWeight = () => String(kgToDisplay(currentWeight ?? prescribedWeight, units))
  const seedReps = () => String(currentReps ?? prescribedReps)
  const [editWeight, setEditWeight] = useState(seedWeight)
  const [editReps, setEditReps] = useState(seedReps)

  // Keep the draft in sync with prescription / logged value when this row isn't
  // mid-typed. A tune re-prescribes the lift (prescribedWeight/Reps change) and
  // an unlogged row should follow the new target; a logged row reflects its
  // recorded value. We re-seed whenever the upstream values change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setEditWeight(seedWeight()); setEditReps(seedReps()) },
    [prescribedWeight, prescribedReps, currentWeight, currentReps, units])

  // Fire 800ms mint-flood shimmer when transitioning into clean or over.
  // No shimmer on partial / failed (color flood alone tells that story).
  //
  // We hold the timer in a ref so a rapid kind change (e.g. clean → empty
  // → clean again within 800ms) clears the previous timer before starting
  // a new one. Without that, two overlapping timers could leave shimmer
  // stuck in an inconsistent state.
  useEffect(() => {
    const prev = prevKindRef.current
    prevKindRef.current = kind
    if (shimmerTimerRef.current) {
      clearTimeout(shimmerTimerRef.current)
      shimmerTimerRef.current = null
    }
    if (prev !== kind && (kind === 'clean' || kind === 'over')) {
      setShimmer(true)
      shimmerTimerRef.current = setTimeout(() => {
        setShimmer(false)
        shimmerTimerRef.current = null
      }, 800)
    }
    return () => {
      if (shimmerTimerRef.current) {
        clearTimeout(shimmerTimerRef.current)
        shimmerTimerRef.current = null
      }
    }
  }, [kind])

  // Commit the current draft → log it. Reads the always-on inputs, validates,
  // converts the typed display value back to kg, and calls the SAME onLog the
  // tap-editor used. reps rounding: "0.5" → 1 (logged), "0.4" → 0 (miss).
  function commitEdit() {
    const wDisplay = parseFloat(editWeight)
    const rFloat = parseFloat(editReps)
    // Reject out-of-range entries so a fat-finger (e.g. "99999" for "99.9")
    // can't silently corrupt this exercise's history graph / peak / PR. Upper
    // bounds clear any real human lift (see MAX_* in lib/workouts/backfill).
    if (!Number.isFinite(wDisplay) || wDisplay < 0 || wDisplay > MAX_WEIGHT_DISPLAY) return
    if (!Number.isFinite(rFloat) || rFloat < 0 || rFloat > MAX_REPS) return
    const r = Math.round(rFloat)
    // 0 / empty reps is a no-op, NOT an auto-miss. Auto-missing on an empty rep
    // field marked sets "missed" by accident when the user meant to log a real
    // (often partial) set. A miss is now only the explicit "miss" button; a set
    // with fewer reps than target logs normally and classifies as a partial.
    if (r === 0) return
    onLog(displayToKg(wDisplay, units), r)
  }

  function handleEditorKey(e: React.KeyboardEvent) {
    // Enter just dismisses the keyboard — it never logs. Logging is the explicit
    // "hit it →" button only, so editing a value can't accidentally log a set.
    if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() }
  }

  const displayUnit = unitLabel(units)
  const repsDelta = (currentReps ?? prescribedReps) - prescribedReps

  // Pill className composition. The row is always inline-editable, so there's no
  // separate "editing" surface — state color comes purely from `kind`.
  const stateClass =
      kind === 'clean' ? styles.pillClean
    : kind === 'over' ? styles.pillOver
    : kind === 'partial' ? styles.pillPartial
    : kind === 'failed' ? styles.pillFailed
    : styles.pillEmpty
  const shimmerClass = shimmer ? styles.pillShimmer : ''

  // Roman numeral for the editorial set index (i, ii, iii, ...).
  const roman = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][idx] ?? String(idx + 1)

  const isLogged = kind !== 'empty'
  // Off-day "was" line: only on an un-logged set with a real base to show.
  const showWas = wasWeightKg != null && wasWeightKg > 0 && !isLogged

  // Logging is explicit (the "hit it →" button) — tapping the row body no longer
  // logs. Tapping anywhere used to commit the set, which silently logged sets
  // while the user was only trying to edit a weight/reps value. Now you can edit
  // freely and the set is only logged when you deliberately hit it.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  // Right-side affordance. Empty → "hit it →" (logs the typed draft). Logged →
  // a STATUS word (not a tap target; reset is the ↺ button only).
  let statusLabel = 'done'
  if (kind === 'over') statusLabel = repsDelta > 0 ? `done · +${repsDelta}` : 'done'
  else if (kind === 'partial') statusLabel = repsDelta < 0 ? `partial · ${repsDelta}` : 'partial'
  else if (kind === 'failed') statusLabel = 'missed'

  return (
    <div
      className={`${styles.pill} ${stateClass} ${shimmerClass} ${showWas ? styles.pillOffDay : ''}`}
      role="group"
      style={{ ['--ri' as string]: idx }}
      aria-label={`Set ${idx + 1}, ${editWeight} ${displayUnit === 'kg' ? 'kilograms' : 'pounds'} by ${editReps} reps, ${kind}`}
    >
      <span className={styles.pillIdx}>{roman}</span>
      {/* Always-editable inline inputs — tap and type any number. Logging
          commits the draft via onLog (kg). On an off day the normal-day
          prescription is stacked, struck out, just above. */}
      <span className={styles.pillValueStack}>
        {showWas && (
          <span className={styles.pillWas}>
            {kgToDisplay(wasWeightKg as number, units)}<i>{displayUnit}</i> × {wasReps}
          </span>
        )}
      <span className={styles.pillValue}>
        <input
          className={styles.pillInlineInput}
          type="number"
          inputMode="decimal"
          value={editWeight}
          onChange={e => setEditWeight(e.target.value)}
          onKeyDown={handleEditorKey}
          onClick={stop}
          onPointerDown={stop}
          aria-label={`Weight for set ${idx + 1}`}
        />
        <span className={styles.pillUnit}>
          {displayUnit}
          {perHand && <span className={styles.pillPerHand}>/ea</span>}
        </span>
        <span className={styles.pillTimes}>×</span>
        <input
          className={styles.pillInlineInput}
          type="number"
          inputMode="numeric"
          value={editReps}
          onChange={e => setEditReps(e.target.value)}
          onKeyDown={handleEditorKey}
          onClick={stop}
          onPointerDown={stop}
          aria-label={`Reps for set ${idx + 1}`}
        />
      </span>
      </span>
      <span className={styles.pillSpacer} aria-hidden />
      <div className={styles.pillActionGroup}>
        {isLogged ? (
          <span className={`${styles.pillHit} ${styles.pillStatus}`}>
            {isPR && kind === 'over' && <span className={styles.pillPr} aria-label="Personal record">★ </span>}
            {statusLabel}
          </span>
        ) : (
          <>
            <button
              type="button"
              className={styles.pillHit}
              onClick={e => { e.stopPropagation(); commitEdit() }}
              aria-label={`Log set ${idx + 1}`}
            >
              hit it →
            </button>
            <button
              type="button"
              className={styles.pillMiss}
              onClick={e => { e.stopPropagation(); onMiss() }}
              onPointerDown={stop}
              aria-label={`Mark set ${idx + 1} missed`}
            >
              miss
            </button>
          </>
        )}
        {isLogged && (
          <button
            type="button"
            className={styles.pillReset}
            onClick={e => { e.stopPropagation(); onUndo() }}
            onPointerDown={stop}
            aria-label={`Reset set ${idx + 1}`}
            title="Reset this set"
          >
            <svg
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3.5 5.5 A4 4 0 1 0 5.5 2.5" />
              <polyline points="2 2 3.5 5.5 7 4.5" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

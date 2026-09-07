'use client'

import { useEffect, useState } from 'react'
import styles from './exerciseSettings.module.css'
import { saveExerciseOverride } from './actions'
import type { DayType } from './splitData'
import { kgToDisplay, displayToKg, unitLabel, type Units } from '@/lib/units'
import WizardSteps from './WizardSteps'

/** Values handed back when stepping from Setup to Name, so the wizard preserves
 *  what the user already dialed in. */
export interface TuneValues {
  weightKg: number
  sets: number
  reps: number
  rest: number
}

interface ExerciseSettingsProps {
  exerciseId: string
  exerciseName: string
  dayType: DayType
  dayNum: number
  /** Current prescribed weight (kg). Pre-fills the weight input. */
  currentWeight: number
  /** Current prescribed set count. Pre-fills the sets input. */
  currentSets: number
  /** The split's default prescribed sets for this exercise on this day.
   *  Powers the "reset to default" link. */
  defaultSets: number
  /** Current prescribed reps. Pre-fills the reps input. */
  currentReps: number
  /** The split's default prescribed reps for this exercise on this day.
   *  Powers the reps "reset to default" link. */
  defaultReps: number
  /** Current rest-between-sets in seconds (saved override or the
   *  tier×day-type default). Pre-fills the rest input. */
  currentRest: number
  /** The computed default rest seconds (REST_SEC[tier][dayType]) for this
   *  lift on this day. Powers the rest "reset to default" link. */
  defaultRest: number
  /** Highest set index (0-based) the user has logged data on. Used to block
   *  shrinking past logged sets so saving never deletes recorded data. */
  loggedSetCount: number
  /** Display unit. Modal converts incoming kg → display unit for the input
   *  and converts back to kg before calling saveExerciseOverride. */
  units: Units
  /** Called with new (weight in kg, sets, reps, rest seconds) when save
   *  succeeds so SplitLog can re-prefill unlogged pills + adjust the in-session
   *  pill count + reps + the rest timer. */
  onSaved: (weight: number, sets: number, reps: number, rest: number) => void
  onClose: () => void
  /** Creating a brand-new custom lift (the Setup step of the build-a-lift
   *  wizard). The lift doesn't exist yet, so we DON'T persist an override here —
   *  the parent's onSaved creates + adds it. Allows weight 0 (bodyweight), shows
   *  the step rail + "add to today" CTA, and never auto-closes on save (the
   *  parent unmounts us by clearing the create flow). */
  creating?: boolean
  /** Whether this lift has a real, library-backed rest recommendation. False for
   *  custom/just-for-log lifts (and the build-a-lift wizard), where `defaultRest`
   *  is a neutral fallback, not a true recommendation — so we hide the "reset"
   *  link, which would otherwise imply a context we don't actually have. */
  hasRecommendation?: boolean
  /** Wizard back: step from Setup back to Name, handing up the current values so
   *  they survive the round trip. Only wired in `creating` mode. */
  onBack?: (vals: TuneValues) => void
  /** Setup builder reuse: when false, do NOT call saveExerciseOverride (the
   *  training_settings row isn't saved until the wizard finishes). Just hand
   *  the values up via onSaved + close. Defaults true (logger behavior). */
  persistOnSave?: boolean
}

/** "150" → "2:30" — friendly mm:ss for the rest display. */
function fmtRest(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return '—'
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Step a numeric string value by `delta`, clamped to [min, max]. */
function step(value: string, delta: number, min: number, max: number): string {
  const n = parseInt(value, 10)
  const base = Number.isFinite(n) ? n : min
  return String(Math.min(max, Math.max(min, base + delta)))
}

/** Clock-style entry: a digit string → total seconds, with the last two digits
 *  read as seconds and the rest as minutes ("107" → 1:07, "90" → 1:30). Lets the
 *  user set any rest, not just 15s multiples, using a plain number pad (no colon
 *  to hunt for). Clamped to [0, 600]; NaN when empty so the caller can ignore it. */
function parseClockDigits(digits: string): number {
  const d = digits.replace(/\D/g, '')
  if (!d) return NaN
  const secs = parseInt(d.slice(-2), 10)
  const mins = d.length > 2 ? parseInt(d.slice(0, -2), 10) : 0
  return Math.min(600, Math.max(0, mins * 60 + secs))
}

/** Subtle line icons per field — muted, matches the logger's action-pill glyphs. */
const FIELD_ICON = {
  weight: (
    <svg className={styles.rowIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10" />
    </svg>
  ),
  sets: (
    <svg className={styles.rowIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 20 7 12 11 4 7Z" /><path d="M4 12 12 16 20 12" /><path d="M4 17 12 21 20 17" />
    </svg>
  ),
  reps: (
    <svg className={styles.rowIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3l3 3-3 3" /><path d="M20 6H9a5 5 0 0 0-5 5" /><path d="M7 21l-3-3 3-3" /><path d="M4 18h11a5 5 0 0 0 5-5" />
    </svg>
  ),
  rest: (
    <svg className={styles.rowIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="13" r="8" /><path d="M12 13V9M12 13l3 2M9 3h6" />
    </svg>
  ),
}

const dayTypeLabel: Record<DayType, string> = {
  HEAVY: 'Heavy day',
  VOLUME: 'Volume day',
  RECOVERY: 'Recovery day',
}

/**
 * Per-exercise quick-tune sheet.
 *
 * Two fields:
 *   - weight (kg) — saved under `${exerciseId}__${dayType}` so the same lift
 *     keeps separate base weights for heavy vs volume days
 *   - target sets — saved on rotation_days; applies on next visit to this day
 *
 * Modal pattern + styling mirrors HistoryModal for consistency.
 */
export default function ExerciseSettings({
  exerciseId,
  exerciseName,
  dayType,
  dayNum,
  currentWeight,
  currentSets,
  currentReps,
  currentRest,
  defaultRest,
  loggedSetCount,
  units,
  onSaved,
  onClose,
  creating = false,
  hasRecommendation = true,
  onBack,
  persistOnSave = true,
}: ExerciseSettingsProps) {
  // Modal works in display units; conversion happens at save boundary.
  // New lifts start with no weight yet — show 0 as a placeholder, not a real
  // value the user has to delete before typing their working weight.
  const [weight, setWeight] = useState(
    creating && currentWeight === 0 ? '' : String(kgToDisplay(currentWeight, units)),
  )
  const [sets, setSets] = useState(String(currentSets))
  const [reps, setReps] = useState(String(currentReps))
  const [rest, setRest] = useState(String(currentRest))
  // Tap-to-type rest: when editing, the user types a free time (clock-style
  // digits) that need not be a multiple of 15. The ± steppers still nudge by 15.
  const [editingRest, setEditingRest] = useState(false)
  const [restDraft, setRestDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Lock body scroll + close on Escape.
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    // Block double-submit if a save is already in flight. Rapid Enter
    // presses on a slow connection can fire two submits before React
    // flushes the disabled state, causing a duplicate write.
    if (saving) return
    setError(null)
    // Blank weight = 0 (bodyweight / no added weight). 0 is a valid base: plenty
    // of lifts carry no external load (hanging leg raise, dips, ab work), and the
    // user should be able to tune one to 0 in peace.
    const wDisplay = weight.trim() === '' ? 0 : parseFloat(weight)
    const s = parseInt(sets, 10)
    const r = parseInt(reps, 10)
    const rt = parseInt(rest, 10)
    // Allow >= 0 everywhere — 0 means bodyweight, not "invalid".
    if (!Number.isFinite(wDisplay) || wDisplay < 0) { setError('Weight must be 0 or more.'); return }
    if (!Number.isFinite(s) || s < 1 || s > 6) { setError('Sets must be between 1 and 6.'); return }
    if (!Number.isFinite(r) || r < 1 || r > 50) { setError('Reps must be between 1 and 50.'); return }
    if (!Number.isFinite(rt) || rt < 0 || rt > 600) { setError('Rest must be between 0 and 600 seconds.'); return }
    // Block shrinking past logged sets — would silently delete recorded data.
    if (s < loggedSetCount) {
      setError(`You've already logged ${loggedSetCount} set${loggedSetCount === 1 ? '' : 's'}. Undo a logged set first if you want to reduce below ${loggedSetCount}.`)
      return
    }
    // Convert display unit → kg for canonical storage.
    const wKg = displayToKg(wDisplay, units)

    // Creating a new lift: it doesn't exist server-side yet, so we don't persist
    // an override here. Hand the values to the parent, which creates the custom
    // exercise + adds it to the log, then unmounts us by clearing the create
    // flow. (Don't call onClose — that's the discard path.)
    if (creating) {
      onSaved(wKg, s, r, rt)
      return
    }

    // Setup builder: hand values up without persisting (no settings row yet).
    if (!persistOnSave) {
      onSaved(wKg, s, r, rt)
      onClose()
      return
    }

    setSaving(true)
    const res = await saveExerciseOverride({
      exerciseId,
      dayType,
      dayNum,
      weight: wKg,
      sets: s,
      reps: r,
      rest: rt,
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error ?? 'Save failed.')
      return
    }
    onSaved(wKg, s, r, rt)
    onClose()
  }

  // Tap the rest time → type a custom value. Start blank so the current time
  // shows as a placeholder (no need to clear it first), mirroring the weight row.
  function startEditRest() {
    setRestDraft('')
    setEditingRest(true)
  }
  // Commit the typed rest (clock-style). Blank/invalid keeps the existing value.
  function commitRestDraft() {
    const parsed = parseClockDigits(restDraft)
    if (Number.isFinite(parsed)) setRest(String(parsed))
    setEditingRest(false)
    setRestDraft('')
  }

  // Wizard back — hand the current (possibly edited) values up so the Name step
  // and a return trip don't wipe what the user already dialed in. Tolerant of
  // mid-edit blanks: falls back to the seeded values rather than NaN.
  function handleBack() {
    if (!onBack) return
    const wDisplay = parseFloat(weight)
    const s = parseInt(sets, 10)
    const r = parseInt(reps, 10)
    const rt = parseInt(rest, 10)
    onBack({
      weightKg: Number.isFinite(wDisplay) ? displayToKg(wDisplay, units) : currentWeight,
      sets: Number.isFinite(s) ? s : currentSets,
      reps: Number.isFinite(r) ? r : currentReps,
      rest: Number.isFinite(rt) ? rt : currentRest,
    })
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.sheet}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-settings-title"
      >
        <div className={styles.head}>
          {creating
            ? <WizardSteps step={2} />
            : <span className={styles.eyebrow}>TUNE · {dayTypeLabel[dayType].toUpperCase()}</span>}
          <h2 id="exercise-settings-title" className={styles.title}>{exerciseName}</h2>
        </div>

        <form onSubmit={handleSave} className={styles.form}>
          {/* Weight — wide range, so tap the number to type it. No stepper. */}
          <div className={styles.row}>
            <span className={styles.rowLeft}>{FIELD_ICON.weight}<span className={styles.rowLabel}>Weight</span></span>
            <div className={styles.ctl}>
              <input
                className={styles.num}
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0"
                value={weight}
                placeholder={creating ? '0' : undefined}
                onChange={e => setWeight(e.target.value)}
                aria-label={`Weight in ${unitLabel(units) === 'kg' ? 'kilograms' : 'pounds'}`}
              />
              <span className={styles.unit}>{unitLabel(units)}</span>
            </div>
          </div>

          {/* Sets — small range, so ± steppers. Can't go below logged sets. */}
          <div className={styles.row}>
            <span className={styles.rowLeft}>{FIELD_ICON.sets}<span className={styles.rowLabel}>Sets</span></span>
            <div className={styles.ctl}>
              <button type="button" className={styles.step} onClick={() => setSets(step(sets, -1, Math.max(1, loggedSetCount), 6))} aria-label="Fewer sets">−</button>
              <input className={styles.num} type="number" inputMode="numeric" min="1" max="6" value={sets} onChange={e => setSets(e.target.value)} aria-label="Sets" />
              <button type="button" className={styles.step} onClick={() => setSets(step(sets, 1, 1, 6))} aria-label="More sets">+</button>
            </div>
          </div>

          {/* Reps — ± steppers. */}
          <div className={styles.row}>
            <span className={styles.rowLeft}>{FIELD_ICON.reps}<span className={styles.rowLabel}>Reps</span></span>
            <div className={styles.ctl}>
              <button type="button" className={styles.step} onClick={() => setReps(step(reps, -1, 1, 50))} aria-label="Fewer reps">−</button>
              <input className={styles.num} type="number" inputMode="numeric" min="1" max="50" value={reps} onChange={e => setReps(e.target.value)} aria-label="Reps" />
              <button type="button" className={styles.step} onClick={() => setReps(step(reps, 1, 1, 50))} aria-label="More reps">+</button>
            </div>
          </div>

          {/* Rest — ±15s steppers, shown as mm:ss. A small reset link appears
              under the label once the rest is tuned off its recommended value. */}
          <div className={styles.row}>
            <span className={styles.rowLeft}>
              {FIELD_ICON.rest}
              <span className={styles.rowLabelStack}>
                <span className={styles.rowLabel}>Rest</span>
                {/* "reset" only when there's a real recommendation to reset TO —
                    custom lifts have no such context, so it would be a lie. */}
                {hasRecommendation && parseInt(rest, 10) !== defaultRest && (
                  <button
                    type="button"
                    className={styles.resetLink}
                    onClick={() => setRest(String(defaultRest))}
                  >
                    reset
                  </button>
                )}
              </span>
            </span>
            <div className={styles.ctl}>
              <button type="button" className={styles.step} onClick={() => setRest(step(rest, -15, 0, 600))} aria-label="Less rest">−</button>
              {/* Tap the time to type a custom rest (any value); ± still steps 15.
                  Digits fill right-to-left like a phone timer: 4,2,3 → 4:23. The
                  raw digit buffer rides on a transparent input underneath so the
                  formatted face stays clean and backspace deletes a digit. */}
              {editingRest ? (
                <span className={styles.restEntry}>
                  <span
                    className={`${styles.restEntryFace} ${restDraft ? '' : styles.restEntryPlaceholder}`}
                    aria-hidden="true"
                  >
                    {fmtRest(restDraft ? parseClockDigits(restDraft) : parseInt(rest, 10))}
                  </span>
                  <input
                    className={styles.restEntryInput}
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    autoFocus
                    value={restDraft}
                    onChange={e => setRestDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    onBlur={commitRestDraft}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitRestDraft() } }}
                    aria-label="Rest time — type digits, fills right to left"
                  />
                </span>
              ) : (
                <button type="button" className={styles.restValBtn} onClick={startEditRest} aria-label="Edit rest time">
                  {fmtRest(parseInt(rest, 10))}
                </button>
              )}
              <button type="button" className={styles.step} onClick={() => setRest(step(rest, 15, 0, 600))} aria-label="More rest">+</button>
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          {creating ? (
            /* Wizard: equal back · cancel pair, full-width "add to today" below. */
            <div className={`${styles.foot} ${styles.footWizard}`}>
              <div className={styles.wizardSecondary}>
                {onBack && (
                  <button type="button" className={styles.cancelBtn} onClick={handleBack} disabled={saving}>back</button>
                )}
                <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={saving}>cancel</button>
              </div>
              <button type="submit" className={styles.saveBtn} disabled={saving}>add to today</button>
            </div>
          ) : (
            <div className={styles.foot}>
              <div className={styles.actions}>
                <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={saving}>cancel</button>
                <button type="submit" className={styles.saveBtn} disabled={saving}>{saving ? 'saving…' : 'save'}</button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

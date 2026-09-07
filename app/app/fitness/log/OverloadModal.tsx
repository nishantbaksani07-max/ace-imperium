'use client'

import { useEffect, useState, type ReactNode } from 'react'
import styles from './overloadModal.module.css'
import { kgToDisplay, displayToKg, unitLabel, type Units } from '@/lib/units'

/** The session overload chosen for a lift: a weight bump (kg) + a reps bump. */
export interface OverloadBump {
  weightKg: number
  reps: number
}

interface OverloadModalProps {
  exerciseName: string
  /** Optional muscle glyph rendered in the header (same icon as the card). */
  muscleIcon?: ReactNode
  /** The bump currently armed for this lift, or null when not armed. */
  bump: OverloadBump | null
  units: Units
  /** The lift's current base/last weight in kg (drives the "last" readout). */
  lastWeightKg: number
  lastSets: number
  lastReps: number
  /** Arm / replace the session overload with the chosen weight + reps bump. */
  onArm: (bump: OverloadBump) => void
  /** Clear the overload (session-only). */
  onClear: () => void
  onClose: () => void
}

/**
 * Progressive-overload card — exact port of the compact-logger demo's `.poModal`.
 *
 * Tapping the ★ on a lift opens this small centered card. It is the demo's
 * customizable overload card: the lifter picks HOW MUCH to push today —
 * stepping the added weight up/down (fine plate increments + a free-type field)
 * and/or stepping the added reps up/down — then "add it" arms that exact bump.
 *
 * Arming is SESSION-ONLY — it routes back through SplitLog's `armedOverload`
 * Map<exId, {weightKg, reps}>, never the database. The auto gold-flush
 * celebration on the lift card is unaffected (that fires in logSet when a
 * logged set beats the lift's best).
 *
 * Screens, mirroring the demo:
 *   choices  — last-session readout + "add a rep" (instant) / "add weight"
 *              (opens the stepper) + "clear it" (if armed) + "not right now"
 *   step     — weight + reps steppers (−/+ and a free-type weight field) + "add it"
 *   armed    — "it's set" view with the locked amount + edit / clear / done
 *   done     — cozy "+amount · on your sets for today", auto-closes
 */
export default function OverloadModal({
  exerciseName,
  muscleIcon,
  bump,
  units,
  lastWeightKg,
  lastSets,
  lastReps,
  onArm,
  onClear,
  onClose,
}: OverloadModalProps) {
  // The finest sensible plate step and the smart starting nudge, per unit.
  const stepDisp = units === 'imperial' ? 2.5 : 1.25
  const defaultDisp = units === 'imperial' ? 5 : 2.5
  const unit = unitLabel(units)

  const isArmed = !!bump && (bump.weightKg > 0 || bump.reps > 0)

  // View: armed lifts open straight into the "it's set" card; the rest start
  // on the choices screen (matching the demo's `isArmed(l) ? armedView() : choices()`).
  const [view, setView] = useState<'choices' | 'step' | 'armed' | 'done'>(
    isArmed ? 'armed' : 'choices',
  )
  // Working bump while on the step screen (display units for weight).
  const [weightDisp, setWeightDisp] = useState(defaultDisp)
  // The applied label shown on the cozy "done" screen.
  const [doneLabel, setDoneLabel] = useState('')

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const lastWeightDisp = kgToDisplay(lastWeightKg, units)

  // Pretty label for a bump, e.g. "+2.5 kg", "+1 rep", "+2.5 kg · +2 reps".
  function bumpLabel(b: OverloadBump): string {
    const parts: string[] = []
    if (b.weightKg > 0) parts.push(`+${kgToDisplay(b.weightKg, units)} ${unit}`)
    if (b.reps > 0) parts.push(`+${b.reps} rep${b.reps > 1 ? 's' : ''}`)
    return parts.join(' · ') || 'no change'
  }

  // ── Choices screen actions ──
  // Keep it simple (the point of Vitality): "add a rep" is one tap, +1 rep,
  // done. "add weight" opens a weight-only stepper. No reps stepper.
  function addARep() {
    const b: OverloadBump = { weightKg: 0, reps: 1 }
    onArm(b)
    applied(b)
  }
  function openStep() {
    // Pre-seed the weight nudge from the armed bump when editing, else default.
    setWeightDisp(bump && bump.weightKg > 0 ? kgToDisplay(bump.weightKg, units) : defaultDisp)
    setView('step')
  }

  // ── Step screen ──
  function adjWeight(dir: 1 | -1) {
    setWeightDisp(v => {
      const next = Math.round((v + dir * stepDisp) * 100) / 100
      return Math.max(0, next)
    })
  }
  function confirmStep() {
    const weightKg = weightDisp > 0 ? Math.round(displayToKg(weightDisp, units) * 100) / 100 : 0
    if (weightKg <= 0) return // nothing to arm
    const b: OverloadBump = { weightKg, reps: 0 }
    onArm(b)
    applied(b)
  }

  // ── Done screen (cozy reveal, auto-close) ──
  function applied(b: OverloadBump) {
    setDoneLabel(bumpLabel(b))
    setView('done')
    setTimeout(onClose, 1150)
  }

  function handleClear() {
    onClear()
    onClose()
  }

  const closeBtn = (
    <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
        <path d="M3.5 3.5 L10.5 10.5 M10.5 3.5 L3.5 10.5" />
      </svg>
    </button>
  )

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="overload-title"
    >
      <div className={styles.card} onClick={e => e.stopPropagation()}>
        <header className={styles.head}>
          <div className={styles.headTitleWrap}>
            {muscleIcon && <span className={styles.headIcon} aria-hidden>{muscleIcon}</span>}
            <div>
              <div className={styles.eyebrow}>overload</div>
              <div id="overload-title" className={styles.title}>{exerciseName}</div>
            </div>
          </div>
          {closeBtn}
        </header>

        {view === 'done' ? (
          <div className={styles.body}>
            <div className={styles.done}>
              <div className={styles.doneAmt}>{doneLabel}</div>
              <div className={styles.doneSub}>on your sets for today</div>
            </div>
          </div>
        ) : view === 'armed' ? (
          <div className={`${styles.body} ${styles.armedBody}`}>
            <div className={`${styles.star} ${styles.starArmed}`} aria-hidden>★</div>
            <div className={styles.armedAmt}>{bump ? bumpLabel(bump) : ''}</div>
            <div className={styles.armedLbl}>locked onto this lift</div>
            <div className={styles.choices}>
              <button type="button" className={styles.choice} onClick={openStep}>
                edit
              </button>
              <button type="button" className={styles.choice} onClick={handleClear}>
                clear it
              </button>
            </div>
            <button type="button" className={styles.skip} onClick={onClose}>done</button>
          </div>
        ) : view === 'step' ? (
          <div className={`${styles.body} ${styles.stepBody}`}>
            <div className={styles.stepGroup}>
              <span className={styles.stepLbl}>add weight</span>
              <div className={styles.poStep}>
                <button type="button" className={styles.adj} onClick={() => adjWeight(-1)} aria-label="Less weight">−</button>
                <span className={styles.poVal}>
                  <span className={styles.poPlus}>+</span>
                  <input
                    className={styles.poInput}
                    inputMode="decimal"
                    value={weightDisp}
                    onChange={e => {
                      const v = parseFloat(e.target.value)
                      setWeightDisp(isNaN(v) ? 0 : Math.max(0, v))
                    }}
                    aria-label="Added weight"
                  />
                  <span className={styles.poUnit}>{unit}</span>
                </span>
                <button type="button" className={styles.adj} onClick={() => adjWeight(1)} aria-label="More weight">+</button>
              </div>
            </div>

            <button type="button" className={styles.confirm} onClick={confirmStep}>add it</button>
            <button type="button" className={styles.skip} onClick={() => setView('choices')}>back</button>
          </div>
        ) : (
          <div className={styles.body}>
            <div className={styles.star} aria-hidden>★</div>
            <div className={styles.show}>
              <span className={styles.showD}>last session</span>
              <span className={styles.showV}>
                <span className={styles.stat}><b>{lastSets}</b> sets</span>
                <span className={styles.stat}><b>{lastReps}</b> reps</span>
                <span className={styles.stat}><b>{lastWeightDisp}</b> {unit}</span>
              </span>
            </div>
            <p className={styles.hint}>How much do you want to push today?</p>
            <div className={styles.choices}>
              <button type="button" className={styles.choice} onClick={addARep}>add a rep</button>
              <button type="button" className={styles.choice} onClick={openStep}>add {defaultDisp} {unit}</button>
            </div>
            {isArmed && (
              <button type="button" className={styles.remove} onClick={handleClear}>clear it</button>
            )}
            <button type="button" className={styles.skip} onClick={onClose}>not right now</button>
          </div>
        )}
      </div>
    </div>
  )
}

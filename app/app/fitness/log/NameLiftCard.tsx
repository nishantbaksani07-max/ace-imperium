'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './swapModal.module.css'
import type { DayType } from './splitData'
import { useVisualViewport } from './useVisualViewport'
import WizardSteps from './WizardSteps'
import MuscleIcon, { MUSCLE_ICON_KEYS, MUSCLE_ICON_LABEL, type MuscleIconKey } from '@/components/MuscleIcon'

interface NameLiftCardProps {
  /** Pre-filled from what the user typed in the search field. */
  initialName: string
  /** Toggle seed — preserved if the user steps forward to Setup and back. */
  initialKeepInLibrary: boolean
  /** Body-part seed — preserved across a Setup→Name round trip. */
  initialMuscle: MuscleIconKey | null
  dayType: DayType
  /** Step 1 of building a custom lift. Back returns to the search picker; Next
   *  carries the (possibly edited) name + library choice + body part forward. */
  onBack: () => void
  onNext: (name: string, keepInLibrary: boolean, muscle: MuscleIconKey | null) => void
}

/**
 * "Name your lift" — step 1 of the build-a-lift wizard. Eyebrow progress rail +
 * one field + a "keep in my library" toggle + back/next. Nothing is created or
 * added to the log here; that only happens after the user finishes the Setup
 * (Tune) step. Shares the SwapModal shell so the wizard feels like one flow.
 */
export default function NameLiftCard({ initialName, initialKeepInLibrary, initialMuscle, dayType, onBack, onNext }: NameLiftCardProps) {
  const [name, setName] = useState(initialName)
  const [keepInLibrary, setKeepInLibrary] = useState(initialKeepInLibrary)
  const [muscle, setMuscle] = useState<MuscleIconKey | null>(initialMuscle)
  const inputRef = useRef<HTMLInputElement>(null)
  const vv = useVisualViewport()
  const trimmed = name.trim()

  // Escape steps back (not "close") — this is mid-flow, not a dead end.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onBack()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onBack])

  function submit() {
    if (trimmed) onNext(trimmed, keepInLibrary, muscle)
  }

  return (
    <div
      className={styles.backdrop}
      onClick={onBack}
      style={vv ? { height: `${vv.height}px`, top: `${vv.offsetTop}px` } : undefined}
    >
      <div
        className={styles.sheet}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-lift-title"
      >
        <div className={styles.wizardHead}>
          <WizardSteps step={1} />
          <h2 id="name-lift-title" className={styles.title}>Name your lift</h2>
        </div>

        <div className={styles.searchRow}>
          <input
            ref={inputRef}
            className={styles.searchInput}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            placeholder="e.g. Close grip bench press"
            aria-label="Name your new lift"
            autoFocus
          />
        </div>

        <div className={styles.bodyPartSection}>
          <span className={styles.bodyPartLabel}>Body part {muscle ? '' : '· optional'}</span>
          <div className={styles.bodyPartRow}>
            {MUSCLE_ICON_KEYS.map(key => (
              <button
                key={key}
                type="button"
                className={`${styles.bodyChip} ${muscle === key ? styles.bodyChipOn : ''}`}
                onClick={() => setMuscle(m => (m === key ? null : key))}
                aria-pressed={muscle === key}
                aria-label={MUSCLE_ICON_LABEL[key]}
              >
                <MuscleIcon name={key} size={18} />
                <span className={styles.bodyChipLabel}>{MUSCLE_ICON_LABEL[key]}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className={styles.toggleRow}
          onClick={() => setKeepInLibrary(v => !v)}
          role="switch"
          aria-checked={keepInLibrary}
        >
          <span className={styles.toggleText}>
            <span className={styles.toggleLabel}>Keep in my library</span>
            <span className={styles.toggleHint}>
              {keepInLibrary ? 'found in search next time' : 'just for today’s log'}
            </span>
          </span>
          <span className={`${styles.switch} ${keepInLibrary ? styles.switchOn : ''}`} aria-hidden>
            <span className={styles.knob} />
          </span>
        </button>

        <div className={styles.wizardActions}>
          <button type="button" className={styles.backBtn} onClick={onBack}>back</button>
          <button type="button" className={styles.nextBtn} onClick={submit} disabled={!trimmed}>next</button>
        </div>
      </div>
    </div>
  )
}

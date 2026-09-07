'use client'

import { useEffect, useState } from 'react'

import styles from './fuelInfo.module.css'

// The Vitality "info button" — the /i_info pattern adapted to React. A small
// circled-i to the RIGHT of the "Today's fuel" title that opens a popup
// explaining the whole Fuel section. The Vitality look (Step 1 of /i_info) is
// already global via app/globals.css, so this is just the button + popup.
//
// Content is a plain object, so the same component drops next to any title with
// different copy.

const SECTIONS = [
  { key: 'macros', label: 'Macros', body: 'Log every meal — search a food, scan a barcode, or pick a drink. It tallies calories, protein, carbs and fat against your daily targets.' },
  { key: 'water', label: 'Water', body: 'Tap to add a glass. Your hydration count carries into Peak, so a dry day shows up in your readiness.' },
  { key: 'supps', label: 'Supplements', body: 'Check off your stack as you take it — nothing skipped, nothing doubled.' },
  { key: 'weight', label: 'Weight', body: 'Weigh in and watch the 7-day average trend, the line that actually tells you it’s working.' },
]

const CUES = ['Log before you eat, not after', 'Set targets in “Adjust targets”', 'Gym vs rest day changes your goal']

export default function FuelInfo() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const roman = ['i', 'ii', 'iii', 'iv', 'v']

  return (
    <>
      <button
        type="button"
        className={styles.ib}
        aria-label="About today’s fuel"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        i
      </button>

      {open && (
        <div
          className={styles.scrim}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label="About today’s fuel">
            <button className={styles.close} aria-label="Close" onClick={() => setOpen(false)}>
              ×
            </button>
            <div className={styles.eyebrow}>Guide</div>
            <h2 className={styles.title}>Today’s fuel</h2>
            <p className={styles.gist}>Your whole day’s intake in one place — eat, drink, supplement, weigh.</p>

            <div className={styles.steps}>
              {SECTIONS.map((s, i) => (
                <div key={s.key} className={styles.step}>
                  <span className={styles.n}>{roman[i]}</span>
                  <span>
                    <b className={styles.stepT}>{s.label}.</b> {s.body}
                  </span>
                </div>
              ))}
            </div>

            <div className={styles.cues}>
              {CUES.map((c) => (
                <span key={c} className={styles.cue}>{c}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

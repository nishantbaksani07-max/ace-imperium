'use client'

import { useEffect, useRef } from 'react'
import styles from './supplements.module.css'
import { WINDOWS } from './supplements'
import type { DbSupplement } from './types'

interface Props {
  supplement: DbSupplement
  onClose: () => void
  onAdd: () => void
  /** Hides the "Add to stack" button — used when the popover is opened
   *  from an item that's already in the user's stack. */
  hideAdd?: boolean
}

/**
 * Compact info card that drops in below the search dropdown when the
 * user clicks the (i) on a result. Three labelled sections, in plain
 * language:
 *
 *   WHAT IT DOES   one-line benefit
 *   WHEN           best-time guidance (window + nuance)
 *   HOW            typical dose + any food/cycle notes
 *
 * Keeps the user in flow — they can read, then click "Add to stack"
 * without re-clicking the row.
 */
export default function InfoPopover({ supplement, onClose, onAdd, hideAdd = false }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const win = WINDOWS.find(w => w.key === supplement.window)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className={styles.infoPopover} ref={ref} role="dialog" aria-label={`${supplement.name} info`}>
      <header className={styles.infoHead}>
        <span className={styles.infoIcon} aria-hidden>{supplement.icon}</span>
        <h3 className={styles.infoName}>{supplement.name}</h3>
        <button
          type="button"
          className={styles.infoClose}
          onClick={onClose}
          aria-label="Close info"
        >
          ×
        </button>
      </header>

      <dl className={styles.infoBody}>
        <div className={styles.infoRow}>
          <dt className={styles.infoLabel}>What it does</dt>
          <dd className={styles.infoVal}>{supplement.helps}</dd>
        </div>

        <div className={styles.infoRow}>
          <dt className={styles.infoLabel}>When</dt>
          <dd className={styles.infoVal}>
            <span className={styles.infoWindowChip}>
              {win?.icon} {win?.title.toLowerCase() ?? supplement.window}
              {win?.time && win.cutoffHour !== null ? ` · ${win.time}` : ''}
            </span>
            <span className={styles.infoNuance}>{supplement.bestTime}</span>
          </dd>
        </div>

        <div className={styles.infoRow}>
          <dt className={styles.infoLabel}>How</dt>
          <dd className={styles.infoVal}>
            <span className={styles.infoDose}>{supplement.dose}</span>
            {supplement.note && (
              <span className={styles.infoNuance}>{supplement.note}</span>
            )}
          </dd>
        </div>
      </dl>

      {!hideAdd && (
        <footer className={styles.infoFoot}>
          <button type="button" className={styles.infoAddBtn} onClick={onAdd}>
            Order →
          </button>
        </footer>
      )}
    </div>
  )
}

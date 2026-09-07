'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import styles from './swapModal.module.css'
import type { DayType } from './splitData'
import { kgToDisplay, unitLabel, type Units } from '@/lib/units'
import { useVisualViewport } from './useVisualViewport'

/** A smart, biomechanically-matched alternative (from exerciseAlternatives). */
export interface SwapRecommendation {
  id: string
  name: string
  /** Target weight on this lift today, already converted to kg. */
  weightKg: number
}

/** Any exercise in the library, offered through the search field. */
export interface SwapLibraryItem {
  id: string
  name: string
  /** Primary muscle label ("Chest", "Quads") or null when unknown. */
  muscle: string | null
  /** Seed weight (kg) to prefill unlogged sets after the swap. */
  weightKg: number
  /** True when this lift has its own logged history, so weightKg is real (not
   *  inherited from the source lift). Drives whether we show a number. */
  hasHistory: boolean
}

const dayTypeLabel: Record<DayType, string> = {
  HEAVY: 'Heavy day',
  VOLUME: 'Volume day',
  RECOVERY: 'Recovery day',
}

interface SwapModalProps {
  sourceName: string
  dayType: DayType
  units: Units
  recommendations: SwapRecommendation[]
  library: SwapLibraryItem[]
  onSelect: (newExerciseId: string, weightKg: number) => void
  onClose: () => void
  /** 'swap' (default) replaces a lift; 'add' inserts a new one for today. */
  mode?: 'swap' | 'add'
  /** Add mode only: create a user-defined lift from the typed query when the
   *  library doesn't have it. Absent → no "add your own" affordance. */
  onCreateCustom?: (name: string) => void
}

/**
 * Swap modal — replaces the old inline popover (which bled off-screen on
 * phones) with a centered card that mirrors the Tune sheet (ExerciseSettings).
 *
 * Two ways to swap, in priority order:
 *   1. Recommended — the 1-2 biomechanically matched alternatives, with the
 *      target weight already converted for this lift.
 *   2. Search the library — type any exercise name and swap it in. Useful when
 *      you're in a different gym and the matched machine isn't available.
 *
 * Selecting either calls onSelect(id, weightKg). The swap is per-session only
 * (handled by the parent's swapExercise); this component is pure UI.
 */
export default function SwapModal({
  sourceName,
  dayType,
  units,
  recommendations,
  library,
  onSelect,
  onClose,
  mode = 'swap',
  onCreateCustom,
}: SwapModalProps) {
  const isAdd = mode === 'add'
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Close on Escape — matches the Tune sheet's dismissal affordances.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Keep the sheet above the on-screen keyboard — see useVisualViewport.
  const vv = useVisualViewport()

  const q = query.trim().toLowerCase()
  const hasQuery = q.length > 0
  // Both modes are search-driven: nothing until you type. Add mode's library
  // already excludes the lifts on the day (filtered upstream in SplitLog), so
  // results never surface something you've already got.
  const filtered = useMemo(() => {
    if (!hasQuery) return []
    return library.filter(
      item =>
        item.name.toLowerCase().includes(q) ||
        (item.muscle?.toLowerCase().includes(q) ?? false),
    )
  }, [q, hasQuery, library])

  // Offer "add your own" only in add mode, only after they've typed, and not
  // when the typed text already names a lift in the results (avoids an obvious
  // duplicate of a built-in or existing custom lift).
  const showCreate =
    isAdd && !!onCreateCustom && hasQuery &&
    !filtered.some(item => item.name.toLowerCase() === q)

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      style={vv ? { height: `${vv.height}px`, top: `${vv.offsetTop}px` } : undefined}
    >
      <div
        className={styles.sheet}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="swap-modal-title"
      >
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close"
        >
          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M3.5 3.5 L10.5 10.5 M10.5 3.5 L3.5 10.5" />
          </svg>
        </button>
        <div className={styles.head}>
          <span className={styles.eyebrow}>{isAdd ? 'ADD' : 'SWAP'} · {dayTypeLabel[dayType].toUpperCase()}</span>
          <h2 id="swap-modal-title" className={styles.title}>{sourceName}</h2>
          {!isAdd && (
            <p className={styles.subtitle}>
              <em>Swap this lift for today only. The new exercise starts fresh and prefills at the matched weight.</em>
            </p>
          )}
        </div>

        {recommendations.length > 0 && (
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Recommended for you</span>
            <div className={styles.recList}>
              {recommendations.map(rec => (
                <button
                  key={rec.id}
                  type="button"
                  className={styles.row}
                  onClick={() => onSelect(rec.id, rec.weightKg)}
                >
                  <span className={styles.rowName}>{rec.name}</span>
                  <span className={styles.rowMeta}>
                    <span className={styles.rowWeight}>
                      {kgToDisplay(rec.weightKg, units)}
                      <span className={styles.rowUnit}>{unitLabel(units)}</span>
                    </span>
                    <svg className={styles.rowArrow} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 7 L11 7" />
                      <polyline points="8,4 11,7 8,10" />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={`${styles.section} ${hasQuery ? styles.searchSectionActive : ''}`}>
          {!isAdd && <span className={styles.sectionLabel}>Search the library</span>}
          <div className={styles.searchRow}>
            <svg className={styles.searchIcon} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="6" cy="6" r="4" />
              <path d="M9 9 L12 12" />
            </svg>
            <input
              ref={searchRef}
              className={styles.searchInput}
              type="text"
              inputMode="search"
              placeholder="Any exercise, any gym…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Search for an exercise to swap in"
            />
            {query && (
              <button type="button" className={styles.searchClear} onClick={() => setQuery('')} aria-label="Clear search">
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M3.5 3.5 L10.5 10.5 M10.5 3.5 L3.5 10.5" />
                </svg>
              </button>
            )}
          </div>

          {hasQuery && (
            <div className={styles.libList}>
              {filtered.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.row}
                    onClick={() => onSelect(item.id, item.weightKg)}
                  >
                    <span className={styles.rowName}>{item.name}</span>
                    {/* Only show a number when it's the lift's own remembered
                        weight — never inherit the source lift's load. */}
                    {item.hasHistory && (
                      <span className={styles.rowWeight}>
                        {kgToDisplay(item.weightKg, units)}
                        <span className={styles.rowUnit}>{unitLabel(units)}</span>
                      </span>
                    )}
                  </button>
              ))}

              {/* Add-your-own: when the library doesn't have what they typed,
                  let them save it as a custom lift (reusable + keeps history). */}
              {showCreate ? (
                <button
                  type="button"
                  className={`${styles.row} ${styles.createRow}`}
                  onClick={() => onCreateCustom!(query.trim())}
                >
                  <svg className={styles.createPlus} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                    <path d="M7 2.5 V11.5 M2.5 7 H11.5" />
                  </svg>
                  <span className={styles.rowName}>Add “{query.trim()}”</span>
                </button>
              ) : (
                filtered.length === 0 && (
                  <p className={styles.empty}>No exercises match “{query.trim()}”.</p>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

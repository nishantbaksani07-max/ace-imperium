'use client'

import { useState } from 'react'

import styles from './macros.module.css'
import { buildManualMeal, buildCustomMeal } from './build'
import FoodSearchPicker from './FoodSearchPicker'
import type { SaveMealInput } from './actions'
import type { SearchMode } from '@/lib/nutrition/types'

export default function ManualAdd({
  dayKey,
  isPro,
  onClose,
  onLog,
  searchMode,
  onSearchMode,
}: {
  dayKey: string
  isPro: boolean
  onClose: () => void
  onLog: (input: SaveMealInput) => void
  searchMode?: SearchMode
  onSearchMode?: (mode: SearchMode) => void
}) {
  const [tab, setTab] = useState<'search' | 'custom'>(isPro ? 'search' : 'custom')

  // custom state
  const [c, setC] = useState({ name: '', grams: '100', kcal: '', protein: '', carbs: '', fat: '' })

  return (
    <div className={styles.modalScrim} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h2 className={styles.modalTitle}>
            <em>Add food</em>
          </h2>
          <button className={styles.modalClose} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'search' ? styles.tabOn : ''}`} onClick={() => setTab('search')}>
            Search
          </button>
          <button className={`${styles.tab} ${tab === 'custom' ? styles.tabOn : ''}`} onClick={() => setTab('custom')}>
            Custom
          </button>
        </div>

        {tab === 'search' ? (
          <div className={styles.modalBody}>
            <FoodSearchPicker
              onPick={(candidate, grams) =>
                onLog(buildManualMeal(candidate, candidate.displayName, grams, dayKey))
              }
              searchMode={searchMode}
              onSearchMode={onSearchMode}
            />
          </div>
        ) : (
          <div className={styles.modalBody}>
            <input className={styles.input} placeholder="Name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
            <label className={styles.gramsField}>
              <span>Grams eaten</span>
              <input className={styles.input} type="number" inputMode="numeric" value={c.grams} onChange={(e) => setC({ ...c, grams: e.target.value })} />
            </label>
            <p className={styles.customHint}>Per 100g:</p>
            <div className={styles.customGrid}>
              {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
                <label key={k} className={styles.customField}>
                  <span>{k}</span>
                  <input
                    className={styles.input}
                    type="number"
                    inputMode="decimal"
                    value={c[k]}
                    onChange={(e) => setC({ ...c, [k]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            <button
              className={styles.snap}
              onClick={() =>
                onLog(
                  buildCustomMeal(
                    {
                      name: c.name,
                      grams: Number(c.grams) || 0,
                      kcal: Number(c.kcal) || 0,
                      protein: Number(c.protein) || 0,
                      carbs: Number(c.carbs) || 0,
                      fat: Number(c.fat) || 0,
                    },
                    dayKey
                  )
                )
              }
            >
              Log it
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

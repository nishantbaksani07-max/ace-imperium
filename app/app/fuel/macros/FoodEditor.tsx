'use client'

import { useState } from 'react'
import { PORTION_UNITS, type PortionUnit, gramsToUnit, portionStrToGrams } from '@/lib/nutrition/portions'
import type { MealFood, UsdaCandidate, SearchMode } from '@/lib/nutrition/types'
import { explainFood } from '@/lib/nutrition/client'
import VitalityIcon from '@/components/VitalityIcon'
import styles from './macros.module.css'
import FoodSearchPicker from './FoodSearchPicker'

const round = (n: number) => Math.round(n || 0)

// Round for display: 0 decimals for g/ml, up to 2 for other units.
function roundedDisplay(value: number, unit: PortionUnit): number {
  if (unit === 'g' || unit === 'ml') return Math.round(value)
  return +value.toFixed(2)
}

export default function FoodEditor({
  food,
  onSave,
  onCancel,
  onReidentify,
  onRemove,
  searchMode,
  onSearchMode,
}: {
  food: MealFood
  onSave: (next: { name: string; grams: number }) => void
  onCancel: () => void
  onReidentify: (candidate: UsdaCandidate, grams: number) => void
  onRemove: () => void
  searchMode?: SearchMode
  onSearchMode?: (mode: SearchMode) => void
}) {
  const [name, setName] = useState(food.name)
  const [grams, setGrams] = useState(food.grams || 0)
  const [unit, setUnit] = useState<PortionUnit>('g')
  // "What is this?" — lazily fetched friendly one-liner, cached per open editor.
  const [explain, setExplain] = useState<string | null>(null)
  const [explaining, setExplaining] = useState(false)
  async function askWhatIsThis() {
    if (explain || explaining) return
    setExplaining(true)
    try {
      setExplain(await explainFood(food.name, food.usdaDescription))
    } catch {
      setExplain('Could not look that up right now.')
    } finally {
      setExplaining(false)
    }
  }
  // String-backed amount so typing "1.5" or clearing the field doesn't snap back.
  const [amountStr, setAmountStr] = useState(() =>
    String(roundedDisplay(gramsToUnit(food.grams || 0, 'g'), 'g'))
  )
  const [showPicker, setShowPicker] = useState(false)

  // Per-100g for each macro, so the live readout scales with the grams slider —
  // shows kcal AND protein/carbs/fat for this one food item.
  const per100 = (v: number) => (food.grams > 0 ? (v / food.grams) * 100 : 0)
  const previewKcal = round((per100(food.macros.kcal) * grams) / 100)
  const pvP = round((per100(food.macros.protein) * grams) / 100)
  const pvC = round((per100(food.macros.carbs) * grams) / 100)
  const pvF = round((per100(food.macros.fat) * grams) / 100)
  const sliderMax = Math.max(500, Math.ceil(grams))
  // A 0-gram food has no density to rescale from (rescaleByGrams can't recover
  // macros from a zero base), and a blank/zero/negative amount would zero the
  // food out — gate Save on a real positive amount AND a rescalable source.
  const canSave = grams > 0 && food.grams > 0

  return (
    <div className={styles.editor}>
      {showPicker ? (
        <FoodSearchPicker
          initialQuery={food.name}
          onPick={(candidate, pickedGrams) => {
            onReidentify(candidate, pickedGrams)
          }}
          onCancel={() => setShowPicker(false)}
          searchMode={searchMode}
          onSearchMode={onSearchMode}
        />
      ) : (
        <>
          <input
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Food name"
          />
          <div className={styles.foodMetaRow}>
            <button type="button" className={styles.whatIsBtn} onClick={askWhatIsThis} disabled={explaining}>
              <VitalityIcon name="sparkles" size={13} />
              {explaining ? 'Looking it up…' : 'What is this?'}
            </button>
            <button type="button" className={styles.removeBtn} onClick={onRemove}>
              <VitalityIcon name="trash" size={13} />
              Remove
            </button>
          </div>
          {explain && (
            <div className={styles.explainPanel}>
              <span className={styles.explainTag}><VitalityIcon name="sparkles" size={11} /> the gist</span>
              <p className={styles.explainText}>{explain}</p>
            </div>
          )}
          <div className={styles.editorRow}>
            <input
              className={styles.input}
              type="number"
              inputMode="decimal"
              min={0}
              value={amountStr}
              onChange={(e) => {
                setAmountStr(e.target.value)
                setGrams(portionStrToGrams(e.target.value, unit))
              }}
              aria-label="Amount"
            />
            <select
              className={styles.unitSelect}
              value={unit}
              onChange={(e) => {
                const u = e.target.value as PortionUnit
                setUnit(u)
                setAmountStr(String(roundedDisplay(gramsToUnit(grams, u), u)))
              }}
              aria-label="Unit"
            >
              {PORTION_UNITS.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </select>
          </div>
          <input
            className={styles.slider}
            type="range"
            min={0}
            max={sliderMax}
            step={5}
            value={Math.min(grams, sliderMax)}
            onChange={(e) => {
              const v = Number(e.target.value)
              setGrams(v)
              setAmountStr(String(roundedDisplay(gramsToUnit(v, unit), unit)))
            }}
            aria-label="Portion grams"
          />
          {food.grams === 0 ? (
            <p className={styles.preview}>No amount on file — tap <em>Re-identify</em> below to set this food.</p>
          ) : (
            <div className={styles.editorMacros}>
              <span className={styles.editorKcal}>≈ {previewKcal} <i>kcal</i></span>
              <span className={styles.editorPills}>
                <span className={`${styles.emPill} ${styles.emP}`}><b>{pvP}g</b> protein</span>
                <span className={`${styles.emPill} ${styles.emC}`}><b>{pvC}g</b> carbs</span>
                <span className={`${styles.emPill} ${styles.emF}`}><b>{pvF}g</b> fat</span>
              </span>
            </div>
          )}
          <div className={styles.editorActions}>
            <button className={styles.ghost} onClick={onCancel}>Cancel</button>
            <button className={styles.ghost} onClick={() => setShowPicker(true)}>Not this? Re-identify</button>
            <button className={styles.snap} onClick={() => onSave({ name, grams })} disabled={!canSave}>Save</button>
          </div>
        </>
      )}
    </div>
  )
}

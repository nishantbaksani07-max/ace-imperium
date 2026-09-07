'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import type { UsdaCandidate, SearchMode } from '@/lib/nutrition/types'
import { scaleMacros } from '@/lib/nutrition/macros'
import { portionStrToGrams } from '@/lib/nutrition/portions'
import { usdaSearchMany, NeedsProError } from '@/lib/nutrition/client'
import {
  matchCommonFoods,
  browseCategory,
  sizeOptionsFor,
  normFood,
  CATALOG_CATEGORIES,
  type CommonFoodCandidate,
} from '@/lib/nutrition/commonFoodCatalog'
import { CategoryGlyph, catMeta, tint } from './categoryMeta'
import styles from './macros.module.css'

const round = (n: number) => Math.round(n || 0)

function SearchIcon() {
  return (
    <svg className={styles.searchIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

export default function FoodSearchPicker({
  initialQuery,
  onPick,
  onCancel,
  searchMode,
  onSearchMode,
}: {
  initialQuery?: string
  onPick: (candidate: UsdaCandidate, grams: number) => void
  onCancel?: () => void
  searchMode?: SearchMode
  onSearchMode?: (mode: SearchMode) => void
}) {
  const [query, setQuery] = useState(initialQuery ?? '')
  const [apiResults, setApiResults] = useState<UsdaCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState<string | null>(null)
  const [picked, setPicked] = useState<UsdaCandidate | null>(null)
  const [grams, setGrams] = useState('100')
  const [mode, setMode] = useState<SearchMode>(searchMode ?? 'basic')
  const [browseCat, setBrowseCat] = useState<string | null>(null)
  // Monotonic search id so a slow earlier response can't overwrite a newer one.
  const seqRef = useRef(0)

  const trimmed = query.trim()

  // Instant, typo-tolerant local matches (Basic lane only). Computed
  // synchronously from the query → the Common group NEVER flickers or blanks
  // while you fix a spelling (no network in this path).
  const local = useMemo<CommonFoodCandidate[]>(
    () => (mode === 'basic' ? matchCommonFoods(query) : []),
    [query, mode],
  )

  // Debounced live USDA search — fills "more from the database" / advanced.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setApiResults([])
      return
    }
    const t = setTimeout(() => runSearchFor(q, mode), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mode])

  async function runSearchFor(q: string, m: SearchMode = mode) {
    const seq = ++seqRef.current
    setSearching(true)
    setSearchErr(null)
    try {
      const r = await usdaSearchMany(q, m === 'advanced' ? 10 : 6, m)
      if (seq !== seqRef.current) return // superseded by a newer search
      setApiResults(r)
    } catch (err) {
      if (seq !== seqRef.current) return
      setApiResults([])
      if (err instanceof NeedsProError) setSearchErr('Food search is a Pro feature.')
      else setSearchErr(err instanceof Error ? err.message : 'Search failed.')
    } finally {
      if (seq === seqRef.current) setSearching(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (trimmed) runSearchFor(trimmed)
  }

  function selectMode(m: SearchMode) {
    setMode(m)
    onSearchMode?.(m)
  }

  function pick(c: UsdaCandidate) {
    setPicked(c)
    setGrams(String(c.serving.grams))
  }

  // Clamp the free-text grams to a real positive number; 0 for blank/negative,
  // so a stray "-" or an empty field can't add a 0/negative-calorie food.
  const gramsNum = portionStrToGrams(grams, 'g')
  const previewMacros = picked ? scaleMacros(picked.per100, gramsNum) : null

  const localNames = useMemo(() => new Set(local.map((c) => normFood(c.displayName))), [local])
  const moreResults = useMemo(
    () => apiResults.filter((c) => !localNames.has(normFood(c.displayName)) && !localNames.has(normFood(c.description))),
    [apiResults, localNames],
  )

  function Card({ c, common }: { c: UsdaCandidate; common: boolean }) {
    const sm = scaleMacros(c.per100, c.serving.grams)
    const category = common ? (c as CommonFoodCandidate).category : undefined
    const m = catMeta(category)
    const name = mode === 'advanced' && !common ? c.description : c.displayName
    return (
      <button
        className={`${styles.row} ${picked?.fdcId === c.fdcId ? styles.rowOn : ''}`}
        onClick={() => pick(c)}
        type="button"
      >
        <span className={styles.badge} style={{ color: m.color, background: tint(m.color, 0.15), borderColor: tint(m.color, 0.3) }}>
          <CategoryGlyph category={category} />
        </span>
        <span className={styles.rowMid}>
          <span className={styles.rowName}>{name}</span>
          <span className={styles.rowMeta}>
            {round(sm.protein)}P · {round(sm.carbs)}C · {round(sm.fat)}F · {c.serving.label}
          </span>
        </span>
        <span className={styles.rowKcal}>
          <b>{round(sm.kcal)}</b>
          <span>kcal</span>
        </span>
      </button>
    )
  }

  function GroupHead({ label, common }: { label: string; common?: boolean }) {
    return (
      <div className={styles.groupHead}>
        <span className={`${styles.groupLbl} ${common ? styles.commonLbl : ''}`}>{label}</span>
        <span className={styles.groupRule} />
      </div>
    )
  }

  function renderResults() {
    // Empty / pre-search → browse by type (visual grid).
    if (trimmed.length < 2) {
      return (
        <div className={styles.browseWrap}>
          <div className={styles.browseGrid}>
            {CATALOG_CATEGORIES.map((cat) => {
              const m = catMeta(cat)
              return (
                <button
                  key={cat}
                  type="button"
                  className={`${styles.tile} ${browseCat === cat ? styles.tileOn : ''}`}
                  onClick={() => setBrowseCat(browseCat === cat ? null : cat)}
                >
                  <span className={styles.tileIco} style={{ color: m.color, background: tint(m.color, 0.15) }}>
                    <CategoryGlyph category={cat} />
                  </span>
                  <span className={styles.tileLbl}>{m.short}</span>
                </button>
              )
            })}
          </div>
          {browseCat && (
            <>
              <GroupHead label={browseCat} common />
              {browseCategory(browseCat).map((c) => (
                <Card key={`${c.fdcId}|${c.displayName}`} c={c} common />
              ))}
            </>
          )}
        </div>
      )
    }

    if (mode === 'advanced') {
      if (apiResults.length === 0) {
        if (searching) return null
        return <p className={styles.modalErr}>No matches. Try a simpler name.</p>
      }
      return (
        <>
          <GroupHead label={`Database matches · ${apiResults.length}`} />
          {apiResults.map((c) => (
            <Card key={`${c.fdcId}|${c.displayName}`} c={c} common={false} />
          ))}
        </>
      )
    }

    // Basic
    const showEmpty = !searching && local.length === 0 && moreResults.length === 0
    return (
      <>
        {local.length > 0 && local[0].corrected && (
          <p className={styles.searchHint}>Closest matches for “{trimmed}”</p>
        )}
        {local.length > 0 && (
          <>
            <GroupHead label={`Common foods · ${local.length}`} common />
            {local.map((c) => (
              <Card key={`${c.fdcId}|${c.displayName}`} c={c} common />
            ))}
          </>
        )}
        {moreResults.length > 0 && (
          <>
            <GroupHead label={local.length > 0 ? 'More from the database' : `Results · ${moreResults.length}`} />
            {moreResults.map((c) => (
              <Card key={`${c.fdcId}|${c.displayName}`} c={c} common={false} />
            ))}
          </>
        )}
        {showEmpty && (
          <p className={styles.modalErr}>No everyday match. Try Advanced for the full database, or check the spelling.</p>
        )}
      </>
    )
  }

  return (
    <div className={styles.pickerWrap}>
      <form onSubmit={handleSubmit} className={styles.searchWrap}>
        <SearchIcon />
        <input
          className={styles.searchInput}
          placeholder="Search any food"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setBrowseCat(null)
            setPicked(null)
          }}
          autoFocus
        />
      </form>

      {onSearchMode && (
        <div className={styles.modeRow}>
          <div className={styles.searchModeToggle}>
            <button
              className={`${styles.searchModeBtn} ${mode === 'basic' ? styles.searchModeBtnOn : ''}`}
              onClick={() => selectMode('basic')}
              type="button"
            >
              Basic
            </button>
            <button
              className={`${styles.searchModeBtn} ${mode === 'advanced' ? styles.searchModeBtnOn : ''}`}
              onClick={() => selectMode('advanced')}
              type="button"
            >
              Advanced
            </button>
          </div>
        </div>
      )}

      {searchErr && <p className={styles.modalErr}>{searchErr}</p>}

      <div className={styles.resultList}>{renderResults()}</div>

      {picked && (
        <div className={styles.confirm}>
          {sizeOptionsFor(picked).length > 0 && (
            <div className={styles.sizeRow}>
              {sizeOptionsFor(picked).map((s) => (
                <button
                  key={s.label}
                  type="button"
                  className={`${styles.sizeChip} ${gramsNum === s.grams ? styles.sizeChipOn : ''}`}
                  onClick={() => setGrams(String(s.grams))}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <label className={styles.gramsField}>
            <span>Grams</span>
            <input
              className={styles.input}
              type="number"
              inputMode="numeric"
              min={0}
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
            />
          </label>
          {picked.serving.grams !== gramsNum && (
            <p className={styles.servingHint}>{picked.serving.label} = {picked.serving.grams}g</p>
          )}
          {previewMacros && (
            <p className={styles.preview}>
              {round(previewMacros.kcal)} kcal · {round(previewMacros.protein)}P · {round(previewMacros.carbs)}C · {round(previewMacros.fat)}F
            </p>
          )}
          <button className={styles.snap} onClick={() => onPick(picked, gramsNum)} disabled={gramsNum <= 0}>
            Use this
          </button>
        </div>
      )}

      {onCancel && (
        <button className={styles.ghost} onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  )
}

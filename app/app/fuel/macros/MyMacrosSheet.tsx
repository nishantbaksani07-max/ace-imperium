'use client'

import { useEffect, useMemo, useState } from 'react'

import FoodSearchPicker from './FoodSearchPicker'
import {
  buildManualMeal,
  buildCustomMeal,
  buildRecentMeal,
  buildTemplateMeal,
  buildRepeatMeal,
  type MicroKey,
} from './build'
import type { SaveMealInput } from './actions'
import type { UseMacros } from './useMacros'
import type { Meal } from '@/lib/nutrition/types'
import styles from './myMacrosSheet.module.css'

/**
 * My Macros — the unified add-to-today sheet (replaces the old Search/Custom
 * modal). A centered, animated Vitality surface with five lanes that all reuse
 * data the app already holds:
 *   · My Foods   — recent single foods (one-tap re-log)
 *   · My Meals   — whole past meals, re-logged in one tap
 *   · Favorites  — saved templates
 *   · Search     — the USDA picker
 *   · Custom     — manual entry + an optional micronutrient drawer
 * Photo / Barcode hop back out to the page's existing capture flows.
 */

type Tab = 'foods' | 'meals' | 'favs' | 'search' | 'custom'

interface Props {
  macros: UseMacros
  onClose: () => void
}

const MICROS: { key: MicroKey; label: string; unit: string }[] = [
  { key: 'sugar', label: 'Sugar', unit: 'g' },
  { key: 'fiber', label: 'Fiber', unit: 'g' },
  { key: 'sodium', label: 'Sodium', unit: 'mg' },
  { key: 'potassium', label: 'Potassium', unit: 'mg' },
  { key: 'satFat', label: 'Sat. fat', unit: 'g' },
  { key: 'cholesterol', label: 'Cholesterol', unit: 'mg' },
]

const round = (n: number) => Math.round(n || 0)

/** Strip the "(custom: …)" / "(from favorite: …)" wrappers for display. */
function cleanName(s: string): string {
  let t = (s || '').trim()
  if (t.startsWith('(') && t.endsWith(')')) t = t.slice(1, -1)
  const i = t.indexOf(': ')
  if (i > 0 && i < 22) t = t.slice(i + 2)
  return t || 'Meal'
}

export default function MyMacrosSheet({ macros: m, onClose }: Props) {
  const dayKey = m.currentDayKey

  // "My Meals" = a simple history of the last 10 logged meals, newest first.
  const pastMeals = useMemo(
    () =>
      [...m.meals]
        .filter((meal) => !meal.pending && (meal.foods?.length ?? 0) >= 1)
        .reverse()
        .slice(0, 10),
    [m.meals],
  )

  // Search always opens first — it's the primary intent of "Add food".
  const [tab, setTab] = useState<Tab>('search')

  // custom form
  const [c, setC] = useState({ name: '', grams: '100', kcal: '', protein: '', carbs: '', fat: '' })
  const [micros, setMicros] = useState<Record<string, string>>({})
  const [showMicros, setShowMicros] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  function log(input: SaveMealInput) {
    void m.logBuilt(input)
    onClose()
  }

  const foods = m.recents
  const favs = m.templates
  const meals = pastMeals

  const TABS: { id: Tab; label: string }[] = [
    { id: 'search', label: 'Search' },
    { id: 'foods', label: 'My Foods' },
    { id: 'meals', label: 'My Meals' },
    { id: 'favs', label: 'Favorites' },
    { id: 'custom', label: 'Custom' },
  ]

  return (
    <div className={styles.scrim} onClick={onClose} role="dialog" aria-modal="true" aria-label="My Macros">
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.glow} aria-hidden />
        <div className={styles.top}>
          <div>
            <div className={styles.eyebrow}>Fuel · Add to today</div>
            <h2 className={styles.title}><em>My Macros</em></h2>
            <div className={styles.sub}>Snap it, search it, or pull from what you&apos;ve saved.</div>
          </div>
          <button className={styles.x} onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className={styles.tabs}>
          {TABS.map((t) => (
            <button key={t.id} className={`${styles.tab} ${tab === t.id ? styles.tabOn : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className={styles.body}>
          {/* MY FOODS */}
          {tab === 'foods' && (
            <Pane>
              <button className={styles.createRow} onClick={() => setTab('custom')}>
                <span className={styles.createIc}><Ic name="plus" /></span>
                Create a custom food
              </button>
              {foods.length === 0 ? (
                <Empty icon="apple" text="Foods you log show up here for one-tap re-logging. Or create your own above." />
              ) : (
                <List>
                  {foods.map((r, i) => (
                    <Row key={r.name + i} i={i} name={r.name} kcal={round(r.macros.kcal)}
                      p={round(r.macros.protein)} cb={round(r.macros.carbs)} f={round(r.macros.fat)}
                      icon="apple" onClick={() => log(buildRecentMeal(r, dayKey))} />
                  ))}
                </List>
              )}
            </Pane>
          )}

          {/* MY MEALS */}
          {tab === 'meals' && (
            <Pane>
              {meals.length === 0 ? (
                <Empty icon="meal" text="Multi-food meals you log can be repeated here in one tap." />
              ) : (
                <List>
                  {meals.map((meal, i) => (
                    <Row key={meal.id} i={i} name={cleanName(meal.whatISee)}
                      meta={(meal.foods || []).map((f) => f.name).slice(0, 5).join(' · ')}
                      kcal={round(meal.totals.kcal)} p={round(meal.totals.protein)} cb={round(meal.totals.carbs)} f={round(meal.totals.fat)}
                      icon="meal" plus onClick={() => log(buildRepeatMeal(meal, dayKey))} />
                  ))}
                </List>
              )}
            </Pane>
          )}

          {/* FAVORITES */}
          {tab === 'favs' && (
            <Pane>
              {favs.length === 0 ? (
                <Empty icon="star" text="Star a meal to keep it here for your fastest re-logs." />
              ) : (
                <List>
                  {favs.map((t, i) => (
                    <Row key={t.id} i={i} name={t.name}
                      meta={(t.foods || []).map((f) => f.name).slice(0, 5).join(' · ')}
                      kcal={round(t.totals.kcal)} p={round(t.totals.protein)} cb={round(t.totals.carbs)} f={round(t.totals.fat)}
                      icon="star" star onClick={() => log(buildTemplateMeal(t, dayKey))} />
                  ))}
                </List>
              )}
            </Pane>
          )}

          {/* SEARCH */}
          {tab === 'search' && (
            <Pane>
              <FoodSearchPicker
                onPick={(candidate, grams) => log(buildManualMeal(candidate, candidate.displayName, grams, dayKey))}
                searchMode={m.goals.searchMode ?? 'basic'}
                onSearchMode={m.setSearchMode}
              />
            </Pane>
          )}

          {/* CUSTOM */}
          {tab === 'custom' && (
            <Pane>
              <div className={styles.field}>
                <div className={styles.lbl}>Name</div>
                <input className={styles.inp} placeholder="e.g. Mum's chili" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
              </div>
              <div className={styles.field}>
                <div className={styles.lbl}>Grams eaten</div>
                <input className={styles.inp} type="number" inputMode="numeric" value={c.grams} onChange={(e) => setC({ ...c, grams: e.target.value })} />
              </div>
              <div className={styles.per}>Per 100 g</div>
              <div className={styles.grid2}>
                {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
                  <div key={k} className={styles.field}>
                    <div className={styles.lbl}>{k}</div>
                    <input className={styles.inp} type="number" inputMode="decimal" placeholder="0"
                      value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} />
                  </div>
                ))}
              </div>

              <div className={styles.more}>
                <button className={`${styles.moreBtn} ${showMicros ? styles.moreOpen : ''}`} onClick={() => setShowMicros((v) => !v)}>
                  <Ic name="chevron" />
                  More · micronutrients (optional)
                </button>
                <div className={`${styles.microWrap} ${showMicros ? styles.microOpen : ''}`}>
                  <div className={styles.microGrid}>
                    {MICROS.map((mk) => (
                      <div key={mk.key} className={styles.field}>
                        <div className={styles.lbl}>{mk.label}</div>
                        <input className={styles.inp} type="number" inputMode="decimal" placeholder={mk.unit}
                          value={micros[mk.key] ?? ''} onChange={(e) => setMicros({ ...micros, [mk.key]: e.target.value })} />
                      </div>
                    ))}
                  </div>
                  <div className={styles.microHint}>Leave any blank. We only track what you fill in.</div>
                </div>
              </div>

              <button
                className={styles.cta}
                onClick={() => {
                  const microSpec: Partial<Record<MicroKey, number>> = {}
                  for (const mk of MICROS) {
                    const v = Number(micros[mk.key])
                    if (Number.isFinite(v) && v > 0) microSpec[mk.key] = v
                  }
                  log(buildCustomMeal({
                    name: c.name,
                    grams: Number(c.grams) || 0,
                    kcal: Number(c.kcal) || 0,
                    protein: Number(c.protein) || 0,
                    carbs: Number(c.carbs) || 0,
                    fat: Number(c.fat) || 0,
                    micros: Object.keys(microSpec).length ? microSpec : undefined,
                  }, dayKey))
                }}
              >
                <Ic name="plus" /> Log it
              </button>
            </Pane>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── pieces ── */

function Pane({ children }: { children: React.ReactNode }) {
  return <div className={styles.pane}>{children}</div>
}

function List({ children }: { children: React.ReactNode }) {
  return <div className={styles.list}>{children}</div>
}

function Row({ i, name, meta, kcal, p, cb, f, icon, star, plus, onClick }: {
  i: number; name: string; meta?: string; kcal: number; p: number; cb: number; f: number
  icon: IconName; star?: boolean; plus?: boolean; onClick: () => void
}) {
  return (
    <button className={styles.row} style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }} onClick={onClick}>
      <span className={styles.rico}><Ic name={icon} /></span>
      <span className={styles.rmid}>
        <span className={styles.rname}>{name}</span>
        {meta && <span className={styles.rmeta}>{meta}</span>}
        <span className={styles.rmacros}>
          <span className={styles.mP}><b>{p}</b>P</span>
          <span className={styles.mC}><b>{cb}</b>C</span>
          <span className={styles.mF}><b>{f}</b>F</span>
        </span>
      </span>
      <span className={styles.rkcal}><b>{kcal}</b><span>kcal</span></span>
      {plus && <span className={styles.plus}><Ic name="plus" /></span>}
      {star && <span className={styles.rstar}><Ic name="star" /></span>}
    </button>
  )
}

function Empty({ icon, text }: { icon: IconName; text: string }) {
  return (
    <div className={styles.empty}>
      <Ic name={icon} />
      <p>{text}</p>
    </div>
  )
}

/* ── inline icons (kept local so names never drift) ── */
type IconName = 'camera' | 'barcode' | 'plus' | 'search' | 'apple' | 'meal' | 'star' | 'chevron'
function Ic({ name }: { name: IconName }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
    case 'camera': return <svg viewBox="0 0 24 24" {...p}><path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="12.5" r="3.5" /></svg>
    case 'barcode': return <svg viewBox="0 0 24 24" {...p}><path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14" /></svg>
    case 'plus': return <svg viewBox="0 0 24 24" {...p} strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></svg>
    case 'search': return <svg viewBox="0 0 24 24" {...p} strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
    case 'apple': return <svg viewBox="0 0 24 24" {...p}><path d="M12 7c-3-4-9-1-7 4 1 3 5 6 7 8 2-2 6-5 7-8 2-5-4-8-7-4z" /></svg>
    case 'meal': return <svg viewBox="0 0 24 24" {...p}><path d="M4 3v8a3 3 0 0 0 6 0V3M7 3v18M17 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4 2.5-1 2.5-4S18.5 3 17 3zM17 12v9" /></svg>
    case 'star': return <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 17.3 6.2 21l1.6-6.8L3 9.6l7-.6L12 3l2 6 7 .6-4.8 4.6 1.6 6.8z" /></svg>
    case 'chevron': return <svg viewBox="0 0 24 24" {...p} strokeWidth={2.2}><path d="M6 9l6 6 6-6" /></svg>
  }
}

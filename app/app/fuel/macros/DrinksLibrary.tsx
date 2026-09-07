'use client'

// Drinks Library — the beverage twin of the common-foods catalog. A calm,
// premium browse-and-log flow: tap a category, then a drink, then a real-world
// size. Every size card shows a relatable anchor ("a soda can", "a standard
// water bottle") so millilitres mean something. Water is NOT here — it lives in
// its own section (·04); a "Log water" shortcut jumps straight there.

import { useMemo, useState } from 'react'
import {
  DRINK_CATEGORIES,
  drinksByCategory,
  searchDrinks,
  drinkCategory,
  type CatalogDrink,
  type DrinkCategoryId,
  type DrinkGlyph,
} from '@/lib/nutrition/drinkCatalog'
import type { Macros } from '@/lib/nutrition/types'
import styles from './drinksLibrary.module.css'

export interface DrinkLogResult {
  name: string
  ml: number
  kcal: number
  macros: Macros
}

const DAY_KCAL = 2000

// ─── category glyphs (path data lifted from the preview's `G` object) ────────
const GLYPH_PATHS: Record<DrinkGlyph, string> = {
  can: 'M6 3h12v18H6z M6 7h12',
  cup: 'M5 8h11v5a5 5 0 0 1-10 0z M16 9h2a2 2 0 0 1 0 4h-2',
  glass: 'M7 4h10l-1.4 16H8.4z',
  bolt: 'M13 3 5 14h6l-1 7 8-11h-6z',
  bottle: 'M10 3h4v3l1 3v11a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V9l1-3z',
}
// Rounded-rect corners on the can read better than the preview's sharp rect.
const CAN_PATH = '<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M6 7h12"/>'

function Glyph({ glyph, color }: { glyph: DrinkGlyph; color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {glyph === 'can' ? (
        <g dangerouslySetInnerHTML={{ __html: CAN_PATH }} />
      ) : (
        <path d={GLYPH_PATHS[glyph]} />
      )}
    </svg>
  )
}

// muted tinted fill from a category hex (matches the preview's `tint()`)
function tintBg(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

// A relatable real-world anchor for a volume. Alex's ask: nobody can picture
// "330 ml", but everyone can picture a water bottle — so sizes read relative to
// a standard 500 ml bottle (a can is a bit under one, a big cup a bit over).
function sizeAnchor(ml: number): string {
  if (ml <= 60) return 'a shot'
  if (ml <= 180) return 'a small glass'
  if (ml <= 300) return 'half a water bottle'
  if (ml <= 400) return 'a bit under a water bottle'
  if (ml <= 480) return 'nearly a water bottle'
  if (ml <= 540) return 'a standard water bottle'
  if (ml <= 660) return 'a bit over a water bottle'
  return 'two water bottles'
}

// ─── selected-drink readout state ────────────────────────────────────────────
interface Selected {
  drink: CatalogDrink
  ml: number
  kcal: number
  sizeLabel: string
  macros: Macros
}

// Macros for a chosen size: use stated macros if present, else calories-only
// (drinks track kcal — matches buildDrinkMeal).
function macrosForKcal(kcal: number): Macros {
  return { kcal, protein: 0, carbs: 0, fat: 0 }
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
      <path d="M5 12h14M12 5v14" />
    </svg>
  )
}

function DropIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3c4 5 6 7 6 10a6 6 0 0 1-12 0c0-3 2-5 6-10z" />
    </svg>
  )
}

export default function DrinksLibrary({
  onLog,
  onClose,
  onLogWater,
}: {
  onLog: (r: DrinkLogResult) => void
  onClose: () => void
  onLogWater: () => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<DrinkCategoryId | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Selected | null>(null)

  const trimmed = query.trim()
  const searching = trimmed.length > 0

  // What rows to show: search hits, or the chosen category, or nothing (grid).
  const rows = useMemo<CatalogDrink[]>(() => {
    if (searching) return searchDrinks(trimmed)
    if (category) return drinksByCategory(category)
    return []
  }, [searching, trimmed, category])

  const groupLabel = searching ? 'Matches' : category ? drinkCategory(category).name : ''
  const showRows = searching || category !== null

  function selectSize(drink: CatalogDrink, idx: number) {
    const s = drink.sizes[idx]
    setSelected({
      drink,
      ml: s.ml,
      kcal: s.kcal,
      sizeLabel: s.label,
      macros: s.macros ?? macrosForKcal(s.kcal),
    })
  }

  // Expand a row (collapsing any other), and default-select its first size so
  // the readout is populated immediately.
  function toggleRow(drink: CatalogDrink) {
    if (openId === drink.id) {
      setOpenId(null)
      return
    }
    setOpenId(drink.id)
    selectSize(drink, 0)
  }

  function backToGrid() {
    setCategory(null)
    setQuery('')
    setOpenId(null)
  }

  function onSearchChange(v: string) {
    setQuery(v)
    setOpenId(null)
    if (v.trim()) setCategory(null)
  }

  function logIt() {
    if (!selected) return
    onLog({
      name: selected.drink.name,
      ml: selected.ml,
      kcal: selected.kcal,
      macros: selected.macros,
    })
    setSelected(null)
    setOpenId(null)
  }

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <div className={styles.headMain}>
          <div className={styles.eyebrow}>Fuel · Add a drink</div>
          <h2 className={styles.title}>Drinks</h2>
          <div className={styles.sub}>Sodas, coffee, juice, the lot — the same calm flow as adding a food.</div>
        </div>
        <button className={styles.x} onClick={onClose} aria-label="Close drinks">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
            <path d="M6 6 18 18 M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className={styles.tagRow}>
        <button className={styles.waterBtn} onClick={onLogWater}>
          <DropIcon />
          <span>Just water? <b>Log it in Water →</b></span>
        </button>
      </div>

      <div className={styles.search}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          value={query}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search drinks — coke, latte, oat milk…"
          autoComplete="off"
          aria-label="Search drinks"
        />
      </div>

      {!showRows && (
        <div className={styles.grid}>
          {DRINK_CATEGORIES.map((c) => (
            <button key={c.id} className={styles.tile} onClick={() => setCategory(c.id)}>
              <span className={styles.tileIc} style={{ background: tintBg(c.tint, 0.13) }}>
                <Glyph glyph={c.glyph} color={c.tint} />
              </span>
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      )}

      {showRows && (
        <>
          <div className={styles.groupHead}>
            <span className={styles.lbl}>{groupLabel} · {rows.length}</span>
            <span className={styles.rule} />
            <button className={styles.back} onClick={backToGrid}>← all</button>
          </div>

          {rows.length === 0 ? (
            <div className={styles.empty}>No match — try a simpler name, or add a custom drink.</div>
          ) : (
            <div className={styles.list}>
              {rows.map((d) => {
                const cat = drinkCategory(d.category)
                const open = openId === d.id
                const firstKcal = d.sizes[0].kcal
                const zero = firstKcal === 0
                return (
                  <div key={d.id} className={`${styles.row} ${open ? styles.open : ''}`}>
                    <button className={styles.rowMain} onClick={() => toggleRow(d)} aria-expanded={open}>
                      <span className={styles.badge} style={{ background: tintBg(cat.tint, 0.13) }}>
                        <Glyph glyph={cat.glyph} color={cat.tint} />
                      </span>
                      <span className={styles.rmid}>
                        <span className={styles.rname}>{d.name}</span>
                        <span className={styles.rmeta}>
                          {zero ? (
                            <><b>0</b> kcal · pick a size</>
                          ) : (
                            <><b>{firstKcal}</b> kcal · {d.sizes[0].ml} ml</>
                          )}
                        </span>
                      </span>
                      <span className={`${styles.rkcal} ${zero ? styles.zero : ''}`}>
                        <b>{firstKcal}</b>
                        <span>kcal</span>
                      </span>
                    </button>

                    <div className={styles.sizes}>
                      {open && (
                        <>
                          <div className={styles.sHint}>Pick a size</div>
                          <div className={styles.chips}>
                            {d.sizes.map((s, i) => {
                              const on = !!selected && selected.drink.id === d.id && selected.ml === s.ml && selected.sizeLabel === s.label
                              return (
                                <button
                                  key={`${s.label}-${s.ml}`}
                                  className={`${styles.chip} ${on ? styles.on : ''}`}
                                  onClick={() => selectSize(d, i)}
                                >
                                  <b>{s.label}</b>
                                  <small>{s.ml} ml · {s.kcal} kcal</small>
                                  <em className={styles.anchor}>{sizeAnchor(s.ml)}</em>
                                </button>
                              )
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      <div className={styles.bar}>
        <div className={`${styles.barInner} ${selected ? styles.show : ''}`}>
          {selected && (
            <>
              <div className={styles.bAmt}>{selected.ml}<small>ml</small></div>
              <div className={styles.bMid}>
                <div className={styles.t}>
                  <span className={styles.dot} style={{ background: drinkCategory(selected.drink.category).tint }} />
                  <span>{selected.drink.name}</span> <i>·</i> <i>{selected.sizeLabel}</i>
                </div>
                <div className={styles.s}>
                  {selected.kcal === 0 ? (
                    <><b>0 kcal</b> · won&rsquo;t touch your day</>
                  ) : (
                    <><b>{selected.kcal} kcal</b> · {Math.round((selected.kcal / DAY_KCAL) * 100)}% of your day</>
                  )}
                </div>
              </div>
              <button className={styles.log} onClick={logIt}>
                <PlusIcon />Log it
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

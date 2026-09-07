'use client'

import { useEffect, useState } from 'react'

import VitalityIcon, { type IconName } from '@/components/VitalityIcon'
import { useSupplementsState } from '../fitness/supplements/state'
import type { WindowKey, DbSupplement } from '../fitness/supplements/types'
import { SUPPLEMENT_DB, WINDOWS, CONDITION_BY_ID, recommendedFor } from '../fitness/supplements/supplements'
import ScheduleEditor from './ScheduleEditor'
import styles from './fuelSections.module.css'

const SLOT_ICON: Record<WindowKey, IconName> = {
  morning: 'breakfast',
  lunch: 'sun',
  evening: 'dinner',
  bed: 'bed',
  anytime: 'clock',
}
const META = Object.fromEntries(WINDOWS.map((w) => [w.key, w])) as Record<WindowKey, (typeof WINDOWS)[number]>
const TONE_CLASS: Record<string, string> = {
  food: styles.condFood,
  empty: styles.condEmpty,
  timing: styles.condTiming,
  water: styles.condWater,
  habit: styles.condHabit,
}
const POPS = ['animPop', 'animRipple', 'animBounce']

const CHECK = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5 10 17.5 19 6.5" />
  </svg>
)
const PLUS = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

function searchSupps(raw: string): DbSupplement[] {
  const q = raw.toLowerCase().trim()
  if (!q) return []
  const starts: DbSupplement[] = []
  const contains: DbSupplement[] = []
  for (const s of SUPPLEMENT_DB) {
    const hay = [s.name.toLowerCase(), ...s.aliases.map((a) => a.toLowerCase())]
    if (hay.some((h) => h.startsWith(q))) starts.push(s)
    else if (hay.some((h) => h.includes(q))) contains.push(s)
  }
  return [...starts, ...contains].slice(0, 6)
}

/**
 * Supplements — day rail. Reuses `useSupplementsState` + localStorage
 * (`vitality_supplements_v1`), so saved stacks survive. Each supplement sits in
 * its time block with its dose + colour-coded intake-condition tags; checking
 * one off plays a little (randomised) animation. The "When to take them" button
 * opens the schedule editor where blocks + conditions are configured.
 */
export default function SupplementsSection() {
  const [mounted, setMounted] = useState(false)
  const sup = useSupplementsState()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [pop, setPop] = useState<{ id: string; kind: string } | null>(null)

  useEffect(() => setMounted(true), [])

  const Eyebrow = (
    <div className={styles.eyebrow}>
      <span className={styles.eyebrowNum}>·05</span>
      <span className={styles.eyebrowLbl}>Supplements</span>
      <span className={styles.eyebrowRule} />
    </div>
  )

  if (!mounted || !sup.ready) {
    return (
      <section className={styles.section}>
        {Eyebrow}
        <div className={styles.card} style={{ minHeight: 200 }} />
      </section>
    )
  }

  const { state, todayTaken, totalCount, takenCount, actions } = sup
  const pct = totalCount > 0 ? takenCount / totalCount : 0
  const q = query.trim()
  const matches = open && q ? searchSupps(query) : []
  const showCustom = !!q && !matches.some((m) => m.name.toLowerCase() === q.toLowerCase())

  // Render order: active blocks, then anytime if it holds anything.
  const anytimeItems = state.items.filter((i) => i.window === 'anytime')
  const railSlots: WindowKey[] = [...state.slots, ...(anytimeItems.length ? (['anytime'] as WindowKey[]) : [])]

  function check(id: string) {
    const turningOn = !todayTaken[id]
    actions.toggleTaken(id)
    if (turningOn) {
      const kind = POPS[Math.floor(Math.random() * POPS.length)]
      setPop({ id, kind })
      setTimeout(() => setPop((p) => (p?.id === id ? null : p)), 700)
    }
  }
  function addLib(s: DbSupplement) {
    actions.addItem({
      name: s.name,
      icon: '',
      dose: s.dose,
      window: s.window,
      note: s.note,
      sourceId: s.id,
      conditions: recommendedFor(s.id),
    })
    setQuery('')
    setOpen(false)
  }
  function addCustom() {
    if (!q) return
    actions.addItem({ name: q, icon: '', dose: '', window: 'anytime', note: '', sourceId: null, conditions: [] })
    setQuery('')
    setOpen(false)
  }

  return (
    <section className={styles.section}>
      {Eyebrow}
      <div className={styles.card}>
        <div className={styles.tileTop}>
          <span className={styles.tileIc}>
            <VitalityIcon name="pill" size={20} />
          </span>
          <span className={styles.tileLbl}>Daily stack</span>
          {totalCount > 0 && (
            <span className={styles.stackCount}>
              {takenCount}/{totalCount} taken
            </span>
          )}
        </div>

        {totalCount > 0 && (
          <div className={styles.meter}>
            <div className={styles.fill} style={{ width: `${pct * 100}%` }} />
          </div>
        )}

        {/* day rail */}
        <div className={styles.rail}>
          {railSlots.map((key) => {
            const items = state.items.filter((i) => i.window === key)
            const m = META[key]
            return (
              <div key={key} className={styles.slot}>
                <div className={styles.slotHead}>
                  <span className={styles.slotIc}>
                    <VitalityIcon name={SLOT_ICON[key]} size={17} />
                  </span>
                  <div>
                    <div className={styles.slotTitle}>{m?.title ?? key}</div>
                    <div className={styles.slotTime}>{m?.time ?? ''}</div>
                  </div>
                </div>
                <div className={styles.slotItems}>
                  {items.length === 0 ? (
                    <span className={styles.slotEmpty}>Nothing yet</span>
                  ) : (
                    items.map((item) => {
                      const taken = !!todayTaken[item.id]
                      const popCls = pop?.id === item.id ? styles[pop.kind] : ''
                      return (
                        <div key={item.id} className={styles.suppItem}>
                          <button
                            className={`${styles.check} ${taken ? styles.checkOn : ''} ${popCls}`}
                            onClick={() => check(item.id)}
                            aria-label={taken ? `Mark ${item.name} not taken` : `Mark ${item.name} taken`}
                          >
                            {taken && CHECK}
                          </button>
                          <span className={styles.suppIc}>
                            <VitalityIcon name="pill" size={16} />
                          </span>
                          <div className={styles.suppMid}>
                            <span className={`${styles.suppName} ${taken ? styles.suppNameTaken : ''}`}>{item.name}</span>
                            <span className={styles.suppTags}>
                              {item.dose && <span className={styles.suppDose}>{item.dose}</span>}
                              {item.conditions.map((cid) => {
                                const c = CONDITION_BY_ID[cid]
                                if (!c) return null
                                return (
                                  <span key={cid} className={`${styles.cond} ${TONE_CLASS[c.tone]}`}>
                                    <VitalityIcon name={c.icon as IconName} size={11} />
                                    {c.label}
                                  </span>
                                )
                              })}
                            </span>
                          </div>
                          <button className={styles.remove} onClick={() => actions.removeItem(item.id)} aria-label={`Remove ${item.name}`}>
                            ×
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {totalCount === 0 && <p className={styles.empty}>Search the library below to start your stack.</p>}

        {/* search add */}
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>
            <VitalityIcon name="search" size={16} />
          </span>
          <input
            className={`${styles.addInput} ${styles.searchField}`}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Search 100+ supplements to add"
            onKeyDown={(e) => {
              if (e.key === 'Enter') matches.length ? addLib(matches[0]) : addCustom()
              if (e.key === 'Escape') setOpen(false)
            }}
          />
          {(matches.length > 0 || showCustom) && (
            <div className={styles.suggestions}>
              {matches.map((s) => (
                <button key={s.id} type="button" className={styles.suggestion} onMouseDown={() => addLib(s)}>
                  <span className={styles.sugIc}>
                    <VitalityIcon name="pill" size={15} />
                  </span>
                  <span className={styles.sugBody}>
                    <span className={styles.sugName}>{s.name}</span>
                    <span className={styles.sugHelps}>{s.helps}</span>
                  </span>
                  <span className={styles.sugDose}>{s.dose}</span>
                </button>
              ))}
              {showCustom && (
                <button type="button" className={styles.suggestion} onMouseDown={addCustom}>
                  <span className={styles.sugIc}>{PLUS}</span>
                  <span className={styles.sugBody}>
                    <span className={styles.sugName}>Add &ldquo;{q}&rdquo;</span>
                    <span className={styles.sugHelps}>Custom supplement</span>
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

        <button className={styles.timingBtn} onClick={() => setShowEditor(true)}>
          <VitalityIcon name="clock" size={15} /> When to take them
          <span className={styles.timingArrow}>
            <VitalityIcon name="arrowRight" size={15} />
          </span>
        </button>
      </div>

      {showEditor && <ScheduleEditor sup={sup} onClose={() => setShowEditor(false)} />}
    </section>
  )
}

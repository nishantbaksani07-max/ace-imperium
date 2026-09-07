'use client'

import { useEffect, useState } from 'react'

import VitalityIcon, { type IconName } from '@/components/VitalityIcon'
import CozyLoader from '@/components/CozyLoader'
import type { CozyItem } from '@/lib/cozy/types'
import type { useSupplementsState } from '../fitness/supplements/state'
import type { WindowKey, ToggleableSlot } from '../fitness/supplements/types'
import { WINDOWS, CONDITIONS, CONDITION_BY_ID, recommendedFor } from '../fitness/supplements/supplements'
import styles from './fuelSections.module.css'

const SLOT_ORDER: ToggleableSlot[] = ['morning', 'lunch', 'evening', 'bed']
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

// Cozy facts shown while the recommendations "compute".
const COZY: CozyItem[] = [
  { text: 'Fat-soluble vitamins like D and K absorb best with a meal that has some fat.', highlight: 'with a meal', tone: 'amber' },
  { text: 'Magnesium in the evening helps a lot of people wind down for sleep.', highlight: 'wind down', tone: 'violet' },
  { text: 'Iron and calcium compete for absorption, so it helps to space them apart.', highlight: 'space them apart', tone: 'blue' },
  { text: 'Creatine works no matter when you take it. Consistency beats timing.', highlight: 'Consistency beats timing', tone: 'mint' },
  { text: 'Caffeine about 30 to 45 minutes before training is the sweet spot.', highlight: 'before training', tone: 'amber' },
  { text: 'Zinc absorbs best on an empty stomach, with food is fine if it bothers you.', highlight: 'empty stomach', tone: 'blue' },
  { text: 'Fiber like psyllium needs plenty of water to do its job and feel good.', highlight: 'plenty of water', tone: 'mint' },
]

/**
 * Schedule editor — the card page behind "When to take them". Toggle time
 * blocks, set each supplement's block, and follow Vitality's recommended intake
 * conditions. On open it plays a brief cozy "reading your stack" moment, then
 * each supplement shows the recommended tag(s) it knows (from DB_CONDITION_HINTS)
 * with a one-tap "Use these"; "Edit" opens the full colour-coded label library.
 */
export default function ScheduleEditor({
  sup,
  onClose,
}: {
  sup: ReturnType<typeof useSupplementsState>
  onClose: () => void
}) {
  const { state, actions } = sup
  const [editId, setEditId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(state.items.length === 0)
  const pickSlots: WindowKey[] = [...state.slots, 'anytime']

  useEffect(() => {
    if (loaded) return
    const t = setTimeout(() => setLoaded(true), 2200)
    return () => clearTimeout(t)
  }, [loaded])

  return (
    <div className={styles.editScrim} onClick={onClose}>
      <div className={styles.editModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.editHead}>
          <div className={styles.editTitle}>
            <span className={styles.tileIc}>
              <VitalityIcon name="clock" size={18} />
            </span>
            When to take them
          </div>
          <button className={styles.editClose} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.editBody}>
          {/* time blocks */}
          <div className={styles.editGroup}>
            <span className={styles.editLbl}>Time blocks</span>
            <p className={styles.editHint}>Turn off a block you do not use. Anything in it moves to Anytime.</p>
            <div className={styles.blockRow}>
              {SLOT_ORDER.map((key) => {
                const on = state.slots.includes(key)
                return (
                  <button
                    key={key}
                    className={`${styles.blockChip} ${on ? styles.blockChipOn : ''}`}
                    onClick={() => actions.toggleSlot(key)}
                  >
                    <VitalityIcon name={SLOT_ICON[key]} size={15} />
                    {META[key]?.title ?? key}
                  </button>
                )
              })}
            </div>
          </div>

          {/* per-supplement schedule */}
          <div className={styles.editGroup}>
            <span className={styles.editLbl}>Your supplements</span>
            {state.items.length === 0 ? (
              <p className={styles.editHint}>Add supplements on the stack first, then schedule them here.</p>
            ) : !loaded ? (
              <CozyLoader
                items={COZY}
                tags={['Timing tip', 'Did you know', 'For you']}
                title="Reading your stack for the best timing"
                intervalMs={1500}
              />
            ) : (
              state.items.map((item) => {
                const hints = recommendedFor(item.sourceId)
                const editing = editId === item.id
                const allApplied = hints.length > 0 && hints.every((h) => item.conditions.includes(h))
                return (
                  <div key={item.id} className={styles.editItem}>
                    <div className={styles.editItemHead}>
                      <span className={styles.suppIc}>
                        <VitalityIcon name="pill" size={16} />
                      </span>
                      <span className={styles.editItemName}>{item.name}</span>
                      {item.dose && <span className={styles.suppDose}>{item.dose}</span>}
                    </div>

                    <div className={styles.editRow}>
                      <span className={styles.editRowLbl}>Time</span>
                      <div className={styles.editPills}>
                        {pickSlots.map((key) => (
                          <button
                            key={key}
                            className={`${styles.slotPick} ${item.window === key ? styles.slotPickOn : ''}`}
                            onClick={() => actions.setWindow(item.id, key)}
                          >
                            {META[key]?.title ?? key}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Vitality recommendation */}
                    <div className={styles.recRow}>
                      <span className={styles.recLbl}>
                        <VitalityIcon name="sparkles" size={12} /> We suggest
                      </span>
                      <div className={styles.editPills}>
                        {hints.length === 0 ? (
                          <span className={styles.recNone}>No special timing. Take it whenever suits you.</span>
                        ) : allApplied ? (
                          <span className={styles.recFollowing}>
                            <VitalityIcon name="star" size={12} /> Following the recommendation
                          </span>
                        ) : (
                          <>
                            {hints.map((cid) => {
                              const c = CONDITION_BY_ID[cid]
                              if (!c) return null
                              const on = item.conditions.includes(cid)
                              return (
                                <button
                                  key={cid}
                                  className={`${styles.recChip} ${TONE_CLASS[c.tone]} ${on ? styles.recChipOn : ''}`}
                                  onClick={() => actions.toggleCondition(item.id, cid)}
                                >
                                  <VitalityIcon name={c.icon as IconName} size={12} />
                                  {c.label}
                                </button>
                              )
                            })}
                            <button
                              className={styles.useThese}
                              onClick={() => hints.forEach((h) => !item.conditions.includes(h) && actions.toggleCondition(item.id, h))}
                            >
                              Use these
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className={styles.editRow}>
                      <span className={styles.editRowLbl}>Take it</span>
                      <div className={styles.editPills}>
                        {editing ? (
                          <>
                            {CONDITIONS.map((c) => {
                              const on = item.conditions.includes(c.id)
                              const suggested = hints.includes(c.id) && !on
                              return (
                                <button
                                  key={c.id}
                                  className={`${styles.condPick} ${TONE_CLASS[c.tone]} ${on ? styles.condPickOn : ''} ${
                                    suggested ? styles.condSuggested : ''
                                  }`}
                                  onClick={() => actions.toggleCondition(item.id, c.id)}
                                >
                                  <VitalityIcon name={c.icon as IconName} size={13} />
                                  {c.label}
                                </button>
                              )
                            })}
                            <button className={styles.condDone} onClick={() => setEditId(null)}>
                              Done
                            </button>
                          </>
                        ) : item.conditions.length ? (
                          <>
                            {item.conditions.map((cid) => {
                              const c = CONDITION_BY_ID[cid]
                              if (!c) return null
                              return (
                                <span key={cid} className={`${styles.condChip} ${TONE_CLASS[c.tone]}`}>
                                  <VitalityIcon name={c.icon as IconName} size={12} />
                                  {c.label}
                                </span>
                              )
                            })}
                            <button className={styles.addCondBtn} onClick={() => setEditId(item.id)}>
                              Edit
                            </button>
                          </>
                        ) : (
                          <button className={styles.addCondBtn} onClick={() => setEditId(item.id)}>
                            <VitalityIcon name="plus" size={13} /> Add your own
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <button className={styles.editDone} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}

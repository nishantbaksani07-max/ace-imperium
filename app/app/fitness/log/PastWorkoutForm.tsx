'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import styles from './pastWorkout.module.css'
import { EX, type SplitDay, type DayType } from './splitData'
import SwapModal from './SwapModal'
import { exerciseMuscleDisplay } from '@/lib/training/muscleDisplay'
import { buildBackfillExercises, validateBackfillInputs, type BackfillLiftInput, type BackfillSetInput } from '@/lib/workouts/backfill'
import { saveBackfillWorkout } from '@/lib/workouts/queries'
import { createClient } from '@/lib/supabase/client'
import { getLocalDateKey } from '@/lib/dates'
import { unitLabel, type Units } from '@/lib/units'

interface PastWorkoutFormProps {
  split: SplitDay[]
  units: Units
  userId: string
  /** Local YYYY-MM-DD for today — the date picker's ceiling (past only). */
  todayKey: string
}

interface SetRow { weight: string; reps: string; missed: boolean }
interface Lift {
  uid: number
  id: string
  name: string
  targetReps: number
  weight: string
  reps: string
  sets: number
  expanded: boolean
  setRows: SetRow[]
}

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']

function shiftKey(key: string, deltaDays: number): string {
  const d = new Date(key + 'T00:00:00')
  d.setDate(d.getDate() + deltaDays)
  return getLocalDateKey(d)
}
function numOrNull(s: string): number | null {
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}
function prettyDate(key: string, todayKey: string): string {
  if (key === shiftKey(todayKey, -1)) return 'Yesterday'
  const d = new Date(key + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

export default function PastWorkoutForm({ split, units, userId, todayKey }: PastWorkoutFormProps) {
  const router = useRouter()
  const uidRef = useRef(0)
  const nextUid = () => ++uidRef.current

  // Only real training days are pickable as a "session"; rest days have nothing
  // to backfill. Custom is appended as a free-entry option.
  const dayChips = split.filter(d => d.type !== 'RECOVERY')

  const [date, setDate] = useState(() => shiftKey(todayKey, -1))
  const [dayName, setDayName] = useState<string>(() => dayChips[0]?.name ?? 'Workout')
  const [lifts, setLifts] = useState<Lift[]>(() => liftsForDay(dayChips[0]))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [collision, setCollision] = useState<{ date: string; dayName: string } | null>(null)

  function liftsForDay(day: SplitDay | undefined): Lift[] {
    if (!day) return []
    return day.exercises.map(de => ({
      uid: nextUid(),
      id: de.id,
      name: EX[de.id]?.name ?? de.id,
      targetReps: de.reps,
      weight: '',
      reps: String(de.reps),
      sets: de.sets,
      expanded: false,
      setRows: [],
    }))
  }

  // The searchable exercise LIBRARY (built-in EX lifts), minus what's already on
  // the form. Picking one stores against its real library id so the backfilled
  // data feeds that exercise's history graph — the whole point of backfilling.
  const library = useMemo(() => {
    const have = new Set(lifts.map(l => l.id))
    return Object.keys(EX)
      .filter(id => !have.has(id))
      .map(id => ({ id, name: EX[id].name, muscle: exerciseMuscleDisplay(id)?.primaryLabel ?? null, weightKg: 0, hasHistory: false }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [lifts])

  function addLiftFromLibrary(id: string) {
    setLifts(prev => [...prev, {
      uid: nextUid(), id, name: EX[id]?.name ?? id, targetReps: 8,
      weight: '', reps: '8', sets: 3, expanded: false, setRows: [],
    }])
    setPickerOpen(false)
  }

  function pickDay(day: SplitDay | null) {
    setError('')
    if (day) { setDayName(day.name); setLifts(liftsForDay(day)) }
    else { setDayName('Custom'); setLifts([]) }
  }

  function patchLift(uid: number, patch: Partial<Lift>) {
    setLifts(prev => prev.map(l => (l.uid === uid ? { ...l, ...patch } : l)))
  }
  function expandLift(l: Lift) {
    const setRows: SetRow[] = Array.from({ length: Math.max(1, l.sets) }, () => ({ weight: l.weight, reps: l.reps, missed: false }))
    patchLift(l.uid, { expanded: true, setRows })
  }
  function collapseLift(l: Lift) {
    patchLift(l.uid, { expanded: false, sets: l.setRows.length || l.sets })
  }
  function patchSetRow(uid: number, idx: number, patch: Partial<SetRow>) {
    setLifts(prev => prev.map(l => {
      if (l.uid !== uid) return l
      const setRows = l.setRows.map((r, i) => (i === idx ? { ...r, ...patch } : r))
      return { ...l, setRows }
    }))
  }
  function addSetRow(l: Lift) {
    patchLift(l.uid, { setRows: [...l.setRows, { weight: l.weight, reps: l.reps, missed: false }] })
  }

  function setClampSets(l: Lift, delta: number) {
    patchLift(l.uid, { sets: Math.min(10, Math.max(1, l.sets + delta)) })
  }

  function buildInputs(): BackfillLiftInput[] {
    return lifts.map(l => {
      const sets: BackfillSetInput[] = l.expanded
        ? l.setRows.map(r => ({ weight: numOrNull(r.weight), reps: numOrNull(r.reps), missed: r.missed }))
        : Array.from({ length: l.sets }, () => ({ weight: numOrNull(l.weight), reps: numOrNull(l.reps), missed: false }))
      return { id: l.id, name: l.name, targetReps: l.targetReps, sets }
    })
  }

  async function handleSave(force = false) {
    setError('')
    const inputs = buildInputs()
    // Catch fat-finger weights/reps before they can skew the history graph.
    const rangeErr = validateBackfillInputs(inputs)
    if (rangeErr) { setError(rangeErr); return }
    const exercises = buildBackfillExercises(inputs, units)
    if (exercises.length === 0) {
      setError('Add at least one set with a weight and reps.')
      return
    }
    setSaving(true)
    try {
      const supabase = createClient()
      // Wrong-day guard: if a REAL session of this day already exists on this
      // date, the user likely picked the wrong day — confirm before adding a
      // second (which would double up that exercise on the graph). Skipped for
      // Custom (no real day to collide with).
      const isRealDay = dayChips.some(d => d.name === dayName)
      if (!force && isRealDay) {
        const { data: existing } = await supabase
          .from('workouts')
          .select('id')
          .eq('user_id', userId)
          .eq('date', date)
          .eq('day_name', dayName)
          .maybeSingle()
        if (existing) {
          setSaving(false)
          setCollision({ date, dayName })
          return
        }
      }
      // Writes into the shared "(history)" lane (merged by exercise id), so a
      // backfill never collides with the user's real rotation rows.
      await saveBackfillWorkout(supabase, { userId, date, exercises })
      setDone(true)
      setTimeout(() => { router.push('/app/fitness/log'); router.refresh() }, 1400)
    } catch (e) {
      console.error('[PastWorkoutForm] save failed:', e)
      setError('Could not save — check your connection and try again.')
      setSaving(false)
    }
  }

  const unit = unitLabel(units)

  if (done) {
    return (
      <main className={`${styles.page} grain-overlay`}>
        <div className={styles.doneWrap}>
          <div className={styles.doneSeal} aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 L10 17.5 L19 7" /></svg>
          </div>
          <h1 className={styles.doneTitle}><em>Added to your history</em></h1>
          <p className={styles.doneSub}>{dayName} · {prettyDate(date, todayKey)}</p>
        </div>
      </main>
    )
  }

  return (
    <main className={`${styles.page} grain-overlay`}>
      <div className={styles.aurora} aria-hidden />
      <div className={styles.shell}>
        <Link href="/app/fitness/log" className={styles.back}>
          <span aria-hidden>←</span> Logger
        </Link>

        <div className={styles.head}>
          <span className={styles.eyebrow}>Add to history</span>
          <h1 className={styles.title}><em>Log a past workout</em></h1>
          <p className={styles.lede}><em>Trained away from your phone, or forgot to log it? Add it here — straight into your history.</em></p>
        </div>

        {/* When */}
        <section className={styles.step}>
          <div className={styles.stepLabel}>When</div>
          <div className={styles.chips}>
            {[1, 2, 3].map(d => {
              const key = shiftKey(todayKey, -d)
              return (
                <button key={d} type="button" className={`${styles.chip} ${date === key ? styles.chipOn : ''}`} onClick={() => setDate(key)}>
                  {d === 1 ? 'Yesterday' : `${d} days ago`}
                </button>
              )
            })}
          </div>
          <label className={styles.dateField}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></svg>
            <span>{prettyDate(date, todayKey)}</span>
            <span aria-hidden>·</span>
            <input type="date" value={date} max={todayKey} onChange={e => e.target.value && setDate(e.target.value)} />
          </label>
        </section>

        {/* Which session */}
        <section className={styles.step}>
          <div className={styles.stepLabel}>Which session</div>
          <div className={styles.chips}>
            {dayChips.map(day => (
              <button key={day.day} type="button" className={`${styles.chip} ${dayName === day.name ? styles.chipOn : ''}`} onClick={() => pickDay(day)}>
                {day.name}
              </button>
            ))}
            <button type="button" className={`${styles.chip} ${!dayChips.some(d => d.name === dayName) ? styles.chipOn : ''}`} onClick={() => pickDay(null)}>
              Custom
            </button>
          </div>
        </section>

        {/* What you did */}
        <section className={styles.step}>
          <div className={styles.stepLabel}>What you did</div>
          <div className={styles.lifts}>
            {lifts.map(l => (
              <div key={l.uid} className={styles.lift}>
                <div className={styles.liftHead}>
                  {/* Name is the canonical library label — display only, since the
                      lift's identity (its id) is what links the data to the graph. */}
                  <span className={styles.liftName}>{l.name}</span>
                  <button type="button" className={styles.liftDel} aria-label="Remove exercise" onClick={() => setLifts(prev => prev.filter(x => x.uid !== l.uid))}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M5 5l14 14M19 5L5 19" /></svg>
                  </button>
                </div>

                {!l.expanded ? (
                  <div className={styles.simple}>
                    <input className={styles.num} inputMode="decimal" placeholder="—" value={l.weight} onChange={e => patchLift(l.uid, { weight: e.target.value })} aria-label="weight" />
                    <span className={styles.uline}>{unit}</span>
                    <span className={styles.times}>×</span>
                    <input className={`${styles.num} ${styles.numDark}`} inputMode="numeric" value={l.reps} onChange={e => patchLift(l.uid, { reps: e.target.value })} aria-label="reps" />
                    <span className={styles.uline}>reps</span>
                    <span className={styles.stepper}>
                      <button type="button" onClick={() => setClampSets(l, -1)} aria-label="fewer sets">−</button>
                      <span className={styles.setsN}>{l.sets} sets</span>
                      <button type="button" onClick={() => setClampSets(l, 1)} aria-label="more sets">+</button>
                    </span>
                    <button type="button" className={styles.differ} onClick={() => expandLift(l)}>sets differ →</button>
                  </div>
                ) : (
                  <div className={styles.perset}>
                    {l.setRows.map((r, i) => {
                      const fewer = r.reps !== '' && l.reps !== '' && Number(r.reps) < Number(l.reps)
                      const kind = r.missed ? styles.pillMissed : fewer ? styles.pillPartial : styles.pillDone
                      return (
                        <div key={i} className={`${styles.pill} ${kind}`}>
                          <span className={styles.ri}>{ROMAN[i] ?? i + 1}</span>
                          <span className={styles.val}>
                            <input className={styles.pillInput} inputMode="decimal" placeholder="—" value={r.weight} onChange={e => patchSetRow(l.uid, i, { weight: e.target.value })} aria-label={`set ${i + 1} weight`} />
                            <span className={styles.u}>{unit}</span>
                            <span className={styles.x}>×</span>
                            <input className={styles.pillInput} inputMode="numeric" value={r.reps} onChange={e => patchSetRow(l.uid, i, { reps: e.target.value })} aria-label={`set ${i + 1} reps`} />
                          </span>
                          <span className={styles.spacer} />
                          {!r.missed && fewer && <span className={styles.tag}>partial</span>}
                          {r.missed && <span className={styles.tag}>missed</span>}
                          <button type="button" className={styles.missBtn} onClick={() => patchSetRow(l.uid, i, { missed: !r.missed })}>
                            {r.missed ? 'undo' : 'miss'}
                          </button>
                        </div>
                      )
                    })}
                    <div className={styles.persetFoot}>
                      <button type="button" className={styles.collapse} onClick={() => collapseLift(l)}>← all the same</button>
                      <button type="button" className={styles.addset} onClick={() => addSetRow(l)}>+ add set</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button type="button" className={styles.addEx} onClick={() => setPickerOpen(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
            Add an exercise
          </button>
        </section>

        {error && <p className={styles.error}>{error}</p>}

        <button type="button" className={styles.save} disabled={saving} onClick={() => handleSave()}>
          {saving ? 'Saving…' : 'Save to history'}
        </button>
        <p className={styles.saveHint}><em>Goes straight into your history &amp; graphs, dated to the day you trained.</em></p>
      </div>

      {pickerOpen && (
        <SwapModal
          mode="add"
          sourceName="Add a lift"
          dayType={(dayChips.find(d => d.name === dayName)?.type ?? 'VOLUME') as DayType}
          units={units}
          recommendations={[]}
          library={library}
          onSelect={(id) => addLiftFromLibrary(id)}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {collision && (
        <div className={styles.scrim} onClick={() => setCollision(null)}>
          <div className={styles.confirm} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <h2 className={styles.confirmTitle}><em>Already logged that day</em></h2>
            <p className={styles.confirmBody}>You already have a <b>{collision.dayName}</b> session on {prettyDate(collision.date, todayKey)}. Picked the wrong day?</p>
            <div className={styles.confirmRow}>
              <button type="button" className={styles.confirmCancel} onClick={() => setCollision(null)}>Pick another day</button>
              <button type="button" className={styles.confirmGo} onClick={() => { setCollision(null); handleSave(true) }}>Add it anyway</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

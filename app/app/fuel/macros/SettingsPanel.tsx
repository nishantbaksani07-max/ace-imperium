'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { saveProfile } from '@/app/account/actions'
import { saveCustomTargets } from './setupActions'
import { kgToDisplay, displayToKg, unitLabel } from '@/lib/units'
import { loadMacroAnswers, type MacroPick } from '@/lib/nutrition/macroAnswers'
import { recommendMicroGoals } from '@/lib/nutrition/dietStyle'
import styles from './macros.module.css'
import type { UseMacros } from './useMacros'
import type { NutritionGoals, DayTarget } from '@/lib/nutrition/types'

const round = (n: number) => Math.round(n || 0)

// ─── Custom Targets editor helpers ──────────────────────────────────────────
// Inputs are held as strings so a field can be blank. Macros treat blank as 0;
// body-fat and micros treat blank as "no goal" (null).
type DayStr = { kcal: string; p: string; c: string; f: string }
const num = (s: string): number => {
  const n = Number(s)
  return s.trim() === '' || Number.isNaN(n) ? 0 : n
}
const opt = (s: string): number | null => {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isNaN(n) ? null : n
}
const parseDay = (d: DayStr) => ({ kcal: num(d.kcal), protein: num(d.p), carbs: num(d.c), fat: num(d.f) })
const dayHelperKcal = (d: DayStr) => Math.round(4 * num(d.p) + 4 * num(d.c) + 9 * num(d.f))
function seedDay(t: DayTarget | null, base: { kcal: number; protein: number; carbs: number; fat: number }): DayStr {
  const s = t ?? base
  return { kcal: String(round(s.kcal)), p: String(round(s.protein)), c: String(round(s.carbs)), f: String(round(s.fat)) }
}

// One day's four inputs (kcal on its own line with a macro-math helper, then p/c/f).
function DayColumn({ head, day, onChange }: { head: string; day: DayStr; onChange: (d: DayStr) => void }) {
  const labels: Record<'p' | 'c' | 'f', string> = { p: 'protein', c: 'carbs', f: 'fat' }
  return (
    <div className={styles.editCol}>
      <span className={styles.editColHead}>{head}</span>
      <label className={styles.editField}>
        <span className={styles.editLabel}>kcal</span>
        <input
          className={styles.editNum}
          type="number"
          inputMode="numeric"
          value={day.kcal}
          onChange={(e) => onChange({ ...day, kcal: e.target.value })}
        />
      </label>
      <p className={styles.editHelper}>≈ {dayHelperKcal(day)} kcal from macros</p>
      <div className={styles.editMacroGrid}>
        {(['p', 'c', 'f'] as const).map((k) => (
          <label key={k} className={styles.editField}>
            <span className={styles.editLabel}>{labels[k]}</span>
            <input
              className={styles.editNum}
              type="number"
              inputMode="numeric"
              value={day[k]}
              onChange={(e) => onChange({ ...day, [k]: e.target.value })}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

// Recover a few "what you picked" chips from the saved plan, for plans created
// before the quiz cached its raw answers (so returning users still see context
// without redoing). The full chip set comes from localStorage on the next quiz.
const GOAL_LABEL: Record<string, string> = {
  CUT: 'Lose weight', CUT_HP: 'Lose weight', LEAN_BULK: 'Gain weight',
  FAST_BULK: 'Gain weight', MAINTAIN: 'Maintain', RECOMP: 'Recomp', RECOMP_MAINTAIN: 'Recomp',
}
const ACTIVITY_LABEL: Record<string, string> = {
  sedentary: 'Mostly sitting', light: 'Lightly active', moderate: 'On your feet', high: 'Very physical',
}
function backfillPicks(goals: NutritionGoals): MacroPick[] {
  const out: MacroPick[] = []
  if (goals.approach && GOAL_LABEL[goals.approach]) out.push({ label: 'Goal', value: GOAL_LABEL[goals.approach] })
  if (goals.trainingDays != null) out.push({ label: 'Training', value: goals.trainingDays > 0 ? `${goals.trainingDays} gym days` : 'No lifting' })
  if (goals.activity && ACTIVITY_LABEL[goals.activity]) out.push({ label: 'Activity', value: ACTIVITY_LABEL[goals.activity] })
  return out
}

export default function SettingsPanel({ macros, onClose, foodStoryDone = false }: { macros: UseMacros; onClose: () => void; foodStoryDone?: boolean }) {
  const m = macros
  // What the user picked in the macro quiz (localStorage), for the done card.
  const [picks, setPicks] = useState<MacroPick[]>([])
  useEffect(() => { setPicks(loadMacroAnswers()?.picks ?? []) }, [])
  // Prefer the full saved answers; fall back to what the plan itself records.
  const chips = picks.length > 0 ? picks : backfillPicks(m.goals)
  const [weightInput, setWeightInput] = useState('')
  const router = useRouter()
  const [savingUnits, setSavingUnits] = useState(false)

  // Custom Targets editor: flips the "set" card into an editable form.
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [cyc, setCyc] = useState(false)
  const [gymDay, setGymDay] = useState<DayStr>({ kcal: '', p: '', c: '', f: '' })
  const [restDay, setRestDay] = useState<DayStr>({ kcal: '', p: '', c: '', f: '' })
  const [everyDay, setEveryDay] = useState<DayStr>({ kcal: '', p: '', c: '', f: '' })
  const [bodyFat, setBodyFat] = useState('')
  const [fiber, setFiber] = useState('')
  const [sugar, setSugar] = useState('')
  const [sodium, setSodium] = useState('')

  function openEditor() {
    const g = m.goals
    const base = { kcal: g.kcalTarget, protein: g.proteinTarget, carbs: g.carbsTarget ?? 0, fat: g.fatTarget ?? 0 }
    setCyc(g.cycleEnabled)
    setGymDay(seedDay(g.training, base))
    setRestDay(seedDay(g.rest, base))
    setEveryDay(seedDay(null, base))
    // Body fat + micros come from the quiz: prefer the saved value, then fall
    // back to what the quiz gave us (body fat from the cached quiz answer; micros
    // from the standard recommendation off the plan's calories) so the fields are
    // never just blank. The user still edits freely from there.
    const rec = recommendMicroGoals({ kcal: g.kcalTarget, sex: 'M', dietStyle: null })
    const savedBf = (loadMacroAnswers()?.answers?.bodyFat as string | undefined) ?? ''
    const bfFromQuiz = savedBf.replace(/m$/, '').trim()
    setBodyFat(g.bodyFatPct != null ? String(g.bodyFatPct) : bfFromQuiz)
    setFiber(String(g.fiberTarget ?? rec.fiberTarget))
    setSugar(String(g.sugarLimitG ?? rec.sugarLimitG))
    setSodium(String(g.sodiumLimitMg ?? rec.sodiumLimitMg))
    setSaveErr(null)
    setEditing(true)
  }

  async function saveTargets() {
    setSaving(true)
    setSaveErr(null)
    let training, rest, base
    if (cyc) {
      training = parseDay(gymDay)
      rest = parseDay(restDay)
      // Both days need calories when the cycle is on, or a 0-kcal day silently
      // blanks the coach on that day (it divides by kcal).
      if (training.kcal < 1 || rest.kcal < 1) {
        setSaving(false)
        setSaveErr('Enter calories for both your gym day and your rest day.')
        return
      }
      // The base is the weekly-average fallback used when no day is selected.
      base = {
        kcal: Math.round((training.kcal + rest.kcal) / 2),
        protein: Math.round((training.protein + rest.protein) / 2),
        carbs: Math.round((training.carbs + rest.carbs) / 2),
        fat: Math.round((training.fat + rest.fat) / 2),
      }
    } else {
      base = parseDay(everyDay)
      training = base
      rest = base
    }
    const res = await saveCustomTargets({
      cycleEnabled: cyc,
      training,
      rest,
      base,
      bodyFatPct: opt(bodyFat),
      fiberTarget: opt(fiber),
      sugarLimitG: opt(sugar),
      sodiumLimitMg: opt(sodium),
    })
    setSaving(false)
    if (res.ok) {
      setEditing(false)
      router.refresh()
    } else {
      setSaveErr(res.error || 'Could not save just now. Give it another try.')
    }
  }

  const u = unitLabel(m.units)
  const latestDisplay = m.latestWeight ? kgToDisplay(m.latestWeight.kg, m.units) : null

  // Switch kg <-> lb. Persist to the profile, then refresh so every weight on
  // the page re-displays in the chosen unit.
  async function setUnits(next: 'metric' | 'imperial') {
    if (next === m.units || savingUnits) return
    setSavingUnits(true)
    const res = await saveProfile({ units: next })
    setSavingUnits(false)
    if (res.ok) router.refresh()
  }

  function logWeight() {
    const v = Number(weightInput)
    if (!v) return
    m.logWeight(displayToKg(v, m.units))
    setWeightInput('')
  }

  return (
    <div className={styles.modalScrim} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h2 className={styles.modalTitle}>
            <em>Targets</em>
          </h2>
          <button className={styles.modalClose} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          {/* Macro setup. You cannot reach this modal unless the quiz is done
              (the Fuel section is hard-walled on goals.onboarded), so the
              normal state here is "calculated" — show that clearly and make
              recalculating the explicit action, instead of a CTA that reads
              like an unfinished to-do. The first-time CTA is kept as a
              fallback in case a future non-walled surface renders this. */}
          {m.goals.onboarded ? (
            <div className={styles.macroDone}>
              {!editing ? (
              <>
              <span className={styles.macroDoneSeal}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M 3 8.5 L 7 12 L 13 4.5" />
                </svg>
                Complete
              </span>
              <div className={styles.macroDoneTitle}>Your macros are set</div>
              <p className={styles.macroDoneSub}>Built from your quiz answers. Tap a gym or rest day on the tracker.</p>
              {chips.length > 0 && (
                <div className={styles.macroDoneChips}>
                  {chips.map((p) => (
                    <span key={p.label} className={styles.doneChip}>{p.value}</span>
                  ))}
                </div>
              )}
              {m.goals.cycleEnabled && m.goals.training && m.goals.rest ? (
                <div className={styles.donePlan}>
                  <div className={styles.cycleCol}>
                    <span className={styles.cycleColHead}>Gym day</span>
                    <span className={styles.cycleKcal}>{round(m.goals.training.kcal)} <small>kcal</small></span>
                    <span className={styles.cycleMacros}>{round(m.goals.training.protein)}p · {round(m.goals.training.carbs)}c · {round(m.goals.training.fat)}f</span>
                  </div>
                  <div className={styles.cycleCol}>
                    <span className={styles.cycleColHead}>Rest day</span>
                    <span className={styles.cycleKcal}>{round(m.goals.rest.kcal)} <small>kcal</small></span>
                    <span className={styles.cycleMacros}>{round(m.goals.rest.protein)}p · {round(m.goals.rest.carbs)}c · {round(m.goals.rest.fat)}f</span>
                  </div>
                </div>
              ) : (
                <div className={styles.donePlan}>
                  <div className={styles.cycleCol}>
                    <span className={styles.cycleColHead}>Daily target</span>
                    <span className={styles.cycleKcal}>{round(m.goals.kcalTarget)} <small>kcal</small></span>
                    <span className={styles.cycleMacros}>{round(m.goals.proteinTarget)}p{m.goals.carbsTarget ? ` · ${round(m.goals.carbsTarget)}c` : ''}{m.goals.fatTarget ? ` · ${round(m.goals.fatTarget)}f` : ''}</span>
                  </div>
                </div>
              )}
              <div className={styles.doneActions}>
                <button type="button" className={styles.doneRedo} onClick={openEditor}>
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 2.5v4M4 10v3.5M12 2.5v3.5M12 9.5v4" />
                    <circle cx="4" cy="8" r="1.7" /><circle cx="12" cy="7.6" r="1.7" />
                  </svg>
                  Custom macros
                </button>
                <Link href="/app/fuel/macros/setup" onClick={onClose} className={styles.doneRedo}>
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 8 a5 5 0 1 1 -1.5 -3.6" />
                    <path d="M13 2.5 V5 H10.5" />
                  </svg>
                  Redo quiz
                </Link>
              </div>
              </>
              ) : (
              <div className={styles.editWrap}>
                <div className={styles.macroDoneTitle}>Edit your targets</div>
                <p className={styles.macroDoneSub}>Set your own numbers. No quiz needed.</p>

                <button
                  type="button"
                  className={cyc ? `${styles.editSwitch} ${styles.editSwitchActive}` : styles.editSwitch}
                  onClick={() => setCyc(!cyc)}
                  aria-pressed={cyc}
                >
                  <span className={styles.editSwitchTrack}>
                    <span className={styles.editSwitchKnob} />
                  </span>
                  Different gym + rest day targets
                </button>

                {cyc ? (
                  <div className={styles.editCols}>
                    <DayColumn head="Gym day" day={gymDay} onChange={setGymDay} />
                    <DayColumn head="Rest day" day={restDay} onChange={setRestDay} />
                  </div>
                ) : (
                  <div className={styles.editCols}>
                    <DayColumn head="Every day" day={everyDay} onChange={setEveryDay} />
                  </div>
                )}

                <div className={styles.editSection}>
                  <span className={styles.editSectionHead}>Body composition</span>
                  <label className={styles.editField}>
                    <span className={styles.editLabel}>Body fat %</span>
                    <input
                      className={styles.editNum}
                      type="number"
                      inputMode="decimal"
                      placeholder="optional"
                      value={bodyFat}
                      onChange={(e) => setBodyFat(e.target.value)}
                    />
                  </label>
                </div>

                <div className={styles.editSection}>
                  <span className={styles.editSectionHead}>Micronutrient goals (optional)</span>
                  <div className={styles.editMicroGrid}>
                    <label className={styles.editField}>
                      <span className={styles.editLabel}>Fiber (g)</span>
                      <input className={styles.editNum} type="number" inputMode="numeric" placeholder="none" value={fiber} onChange={(e) => setFiber(e.target.value)} />
                    </label>
                    <label className={styles.editField}>
                      <span className={styles.editLabel}>Sugar limit (g)</span>
                      <input className={styles.editNum} type="number" inputMode="numeric" placeholder="none" value={sugar} onChange={(e) => setSugar(e.target.value)} />
                    </label>
                    <label className={styles.editField}>
                      <span className={styles.editLabel}>Sodium limit (mg)</span>
                      <input className={styles.editNum} type="number" inputMode="numeric" placeholder="none" value={sodium} onChange={(e) => setSodium(e.target.value)} />
                    </label>
                  </div>
                  <p className={styles.editHelper}>Leave a field blank to keep it goal-free.</p>
                </div>

                {saveErr && <p className={styles.editErr}>{saveErr}</p>}

                <div className={styles.editActions}>
                  <button type="button" className={styles.editSave} onClick={saveTargets} disabled={saving}>
                    {saving ? 'Saving...' : 'Save targets'}
                  </button>
                  <button type="button" className={styles.editCancel} onClick={() => { setEditing(false); setSaveErr(null) }} disabled={saving}>
                    Cancel
                  </button>
                </div>
              </div>
              )}
            </div>
          ) : (
            <Link
              href="/app/fuel/macros/setup"
              onClick={onClose}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                padding: '14px 16px',
                border: '1px solid var(--mint)',
                borderRadius: 12,
                background: 'rgba(110, 231, 183, 0.06)',
                textDecoration: 'none',
                color: 'var(--fg)',
                marginBottom: 'var(--space-5)',
              }}
            >
              <span style={{ fontWeight: 600 }}>Calculate my macros →</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                A few quick questions and we set your real targets, plus your gym day and rest day numbers.
              </span>
            </Link>
          )}

          {/* The food-story quiz unlocks the AI coach. Sell it (green) when not
              done; show a calm completed state once it is. */}
          {foodStoryDone ? (
            <Link href="/app/quiz/nutrition" onClick={onClose} className={styles.coachDone}>
              <span className={styles.coachDoneCheck}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M 3 8.5 L 7 12 L 13 4.5" /></svg>
              </span>
              <span className={styles.coachDoneText}>
                <b>Coach unlocked</b>
                <span>Your food story is set. Edit it anytime.</span>
              </span>
              <span className={styles.coachDoneArrow} aria-hidden>→</span>
            </Link>
          ) : (
            <Link href="/app/quiz/nutrition" onClick={onClose} className={styles.coachUnlock}>
              <span className={styles.coachUnlockGlow} aria-hidden />
              <span className={styles.coachUnlockTag}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7 V5 a4 4 0 0 1 8 0" /><rect x="3" y="7" width="10" height="7" rx="1.5" /></svg>
                Unlocks your coach
              </span>
              <span className={styles.coachUnlockTitle}>Tell me your <b>food story</b></span>
              <span className={styles.coachUnlockSub}>Your allergies, how you eat, the way you want to be talked to. Two minutes, and your AI coach turns on for real.</span>
              <span className={styles.coachUnlockCta}>
                Unlock my coach
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8 H13" /><path d="M9 4 L13 8 L9 12" /></svg>
              </span>
            </Link>
          )}

          {/* weight */}
          <div className={styles.weightBox}>
            <div className={styles.weightHead}>
              <span className={styles.weekHead}>Body weight</span>
              <div className={styles.unitToggle} role="group" aria-label="Weight units">
                <button
                  type="button"
                  className={m.units === 'metric' ? styles.unitOn : ''}
                  onClick={() => setUnits('metric')}
                  disabled={savingUnits}
                >
                  kg
                </button>
                <button
                  type="button"
                  className={m.units === 'imperial' ? styles.unitOn : ''}
                  onClick={() => setUnits('imperial')}
                  disabled={savingUnits}
                >
                  lb
                </button>
              </div>
            </div>
            <div className={styles.weightRow}>
              <input
                className={styles.input}
                type="number"
                inputMode="decimal"
                placeholder={latestDisplay != null ? `${latestDisplay} ${u}` : `weight (${u})`}
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
              />
              <button className={styles.ghost} onClick={logWeight}>
                Log
              </button>
            </div>
            {latestDisplay != null && (
              <p className={styles.weightMeta}>
                Latest: {latestDisplay} {u}
              </p>
            )}
          </div>

          {/* favorites */}
          {m.templates.length > 0 && (
            <div className={styles.favBox}>
              <span className={styles.weekHead}>Favorites</span>
              {m.templates.map((t) => (
                <div key={t.id} className={styles.favRow}>
                  <span>
                    {t.name} · {round(t.totals.kcal)} kcal
                  </span>
                  <button className={styles.favDelete} onClick={() => m.removeFavorite(t.id)} aria-label="Delete favorite">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

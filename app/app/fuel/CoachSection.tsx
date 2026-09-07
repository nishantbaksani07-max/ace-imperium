'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

import CoachGem from '@/components/CoachGem'
import RevealText from '@/components/RevealText'
import { getLocalDayKey } from '@/lib/nutrition/dayKey'
import { eatingDayFraction, scoreDay, scoreMeal, type DayScore, type ScoreRow, type RowKey } from '@/lib/nutrition/coachScore'
import { dayFoodQuality, flaggedAllergens, type AllergenFlag } from '@/lib/nutrition/foodQuality'
import { goalLabel, type GoalMode } from '@/lib/nutrition/goalContext'
import { DIET_STYLE_WATCH, type DietStyle } from '@/lib/nutrition/dietStyle'
import type { NutritionRestriction } from '@/lib/preferences'
import { decideContextQuestion, type ContextAnswer, type ContextQuestion } from '@/lib/nutrition/contextQuestions'
import type { CoachDaySnapshot } from '@/lib/nutrition/coachPrompt'
import type { Meal, MealType } from '@/lib/nutrition/types'
import CoachDoorway from './CoachDoorway'
import { syncCoachFact } from './coachActions'
import styles from './coachSection.module.css'

/**
 * ·02 Your Coach — the deterministic, goal-aware daily food read.
 *
 * Everything here is pure math over data already loaded on the Fuel page (today's
 * meals + your goal + a training-day flag). No model call, no API key, instant,
 * impossible to abuse, never goes dark. The mode (lib/nutrition/goalContext) tunes
 * the grade: "lose weight" weights calories heaviest, "get stronger" weights
 * protein. The score breaks into four rows that always SUM to it, so "why a 7" is
 * answerable. On a training day the coach can ask one warm one-tap question that
 * nudges the score (it never moves a point on its own).
 *
 * Open-ended coaching lives in the iris "talk deeper in Claude" doorway. The
 * coach's face is Echo, the real gem-library gem (CoachGem preset="echo").
 */

// Module-level so the default prop is a STABLE reference — a fresh `[]` default
// in the destructure would be a new array each render, and it sits in the mount
// effect's deps, which would loop forever (any caller that omits restrictions).
const NO_RESTRICTIONS: NutritionRestriction[] = []

const CELEBRATED_KEY = 'vitality_coach_celebrated_v1'
const ctxKey = (dayKey: string, id: string) => `vitality_coach_ctxq_${dayKey}_${id}`
const CTX_IDS = ['preworkout_fuel_good', 'heavy_preworkout_fat'] as const

const BURST_PARTICLES = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2
  const r = 90 + (i % 3) * 22
  return { dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r) }
})

interface DayTotals {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

interface CoachSectionProps {
  proteinTarget: number
  kcalTarget: number
  foodStoryDone?: boolean
  /** Tunes the grade. Derived server-side from the user's goal. */
  goalMode: GoalMode
  /** Enables the coach's preworkout context questions. */
  isTrainingDayToday: boolean
  /** Recent meals (already loaded for Macros); the coach filters to today. */
  meals: Meal[]
  /** Allergens/diets the user asked to avoid (food-story quiz). Drives the
   *  deterministic allergen guard. Empty = no guard. */
  restrictions?: NutritionRestriction[]
  /** The user's eater-type. Tunes which signal the coach leads with. */
  dietStyle?: DietStyle | null
}

// The day score, shown simply: a big number out of ten in the display font,
// mint when good / amber when it needs work. No ring (Alex, 2026-07-11: "revert
// back to one score, just the two Vitality colors and the font, no stupid rings").
// Keeps the count-up so a fresh score still animates in.
function ScoreNumber({ score }: { score: number }) {
  const tone = score >= 7 ? 'good' : 'watch'
  const [shown, setShown] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    let raf = 0
    const from = prev.current
    const t0 = performance.now()
    const dur = 800
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur)
      const e = 1 - Math.pow(1 - p, 3)
      setShown(Math.round(from + (score - from) * e))
      if (p < 1) raf = requestAnimationFrame(tick)
      else prev.current = score
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [score])
  return (
    <div className={styles.dayScore} data-tone={tone}>
      <span className={styles.dayScoreN}>{shown}</span>
      <span className={styles.dayScoreOf}>/10</span>
    </div>
  )
}

function mealLabel(t: MealType): string {
  if (!t || t === 'auto' || t === 'other') return 'latest meal'
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function sumEarned(rows: ScoreRow[]): number {
  return rows.reduce((s, r) => s + r.earned, 0)
}

function biggestGapKey(rows: ScoreRow[]): RowKey {
  let best: ScoreRow | undefined = rows[0]
  let bestGap = -1
  for (const r of rows) {
    const g = r.max - r.earned
    if (g > bestGap) {
      bestGap = g
      best = r
    }
  }
  return best?.key ?? 'calories'
}

/** Apply the context-question delta to the Whole foods row (clamped). Returns the
 *  real change so the flourish never lies about an unchanged score. Mutates the
 *  passed rows (give it a fresh copy). */
function applyWholeDelta(rows: ScoreRow[], delta: number): number {
  const wf = rows.find((r) => r.key === 'wholefoods')
  if (!wf) return 0
  const before = wf.earned
  wf.earned = Math.max(0, Math.min(wf.max, before + delta))
  wf.tone = wf.earned >= wf.max ? 'good' : 'watch'
  return wf.earned - before
}

export default function CoachSection({ proteinTarget, kcalTarget, foodStoryDone = false, goalMode, isTrainingDayToday, meals, restrictions = NO_RESTRICTIONS, dietStyle = null }: CoachSectionProps) {
  // Stable primitive key so the mount effect doesn't re-run on a new array
  // identity (only when the actual set of restrictions changes).
  const restrictionsKey = restrictions.join('|')
  const [mounted, setMounted] = useState(false)
  const [scored, setScored] = useState(false)
  const [empty, setEmpty] = useState(false)
  const emptyMsg = 'Log a meal and I will take a look.'
  const [day, setDay] = useState<DayScore | null>(null)
  // Deterministic allergen guard + dietStyle focus line (BUILD 2).
  const [allergenFlags, setAllergenFlags] = useState<AllergenFlag[]>([])
  const [styleNote, setStyleNote] = useState<{ tone: 'good' | 'watch'; text: string } | null>(null)
  const [rows, setRows] = useState<ScoreRow[]>([])
  const [selected, setSelected] = useState<RowKey>('calories')
  const [meal, setMeal] = useState<{ score: number; reason: string; name: string } | null>(null)
  const [ctxQ, setCtxQ] = useState<ContextQuestion | null>(null)
  const [ctxResolved, setCtxResolved] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ v: string; good: boolean } | null>(null)
  const [undo, setUndo] = useState<(() => void) | null>(null)
  const [celebrating, setCelebrating] = useState(false)
  const [doorOpen, setDoorOpen] = useState(false)

  const dayKeyRef = useRef<string>('')
  const totalsRef = useRef<DayTotals>({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
  const coachCtrl = useRef<((move: string) => void) | null>(null)
  const celebTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fire = useCallback((move: string) => coachCtrl.current?.(move), [])

  const celebrate = useCallback((kind: 'score' | 'protein') => {
    try {
      if (localStorage.getItem(CELEBRATED_KEY) === dayKeyRef.current) return
      localStorage.setItem(CELEBRATED_KEY, dayKeyRef.current)
    } catch {
      /* ignore */
    }
    fire(kind === 'protein' ? 'win' : 'celebrate')
    setCelebrating(true)
    if (celebTimer.current) clearTimeout(celebTimer.current)
    celebTimer.current = setTimeout(() => setCelebrating(false), 1800)
  }, [fire])

  // Mount: filter today's meals, grade the day (pure), pick the context question.
  useEffect(() => {
    setMounted(true)
    if (!foodStoryDone) return

    const foodDayKey = getLocalDayKey()
    dayKeyRef.current = foodDayKey

    const todays = meals.filter((m) => m.dayKey === foodDayKey && !m.pending)
    const totals: DayTotals = todays.reduce(
      (a, m) => ({
        kcal: a.kcal + (Number(m.totals?.kcal) || 0),
        protein: a.protein + (Number(m.totals?.protein) || 0),
        carbs: a.carbs + (Number(m.totals?.carbs) || 0),
        fat: a.fat + (Number(m.totals?.fat) || 0),
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    )
    totals.kcal = Math.round(totals.kcal)
    totals.protein = Math.round(totals.protein)
    totals.carbs = Math.round(totals.carbs)
    totals.fat = Math.round(totals.fat)
    totalsRef.current = totals

    if (!todays.length || totals.kcal <= 0) {
      setEmpty(true)
      setScored(true)
      return
    }

    const foods = todays.flatMap((m) => m.foods || [])
    const quality = dayFoodQuality(foods)

    // Allergen guard: newest food first, deduped, at most three shown so it
    // stays a gentle heads-up not a wall. Empty when the user set no restrictions.
    const flagsRaw = flaggedAllergens(foods.slice().reverse(), restrictions)
    const seenFlag = new Set<string>()
    const flags: AllergenFlag[] = []
    for (const fl of flagsRaw) {
      const k = `${fl.food}|${fl.restriction}`
      if (seenFlag.has(k)) continue
      seenFlag.add(k)
      flags.push(fl)
      if (flags.length >= 3) break
    }
    setAllergenFlags(flags)

    // dietStyle focus line: lead with the signal this person actually cares about.
    if (dietStyle && DIET_STYLE_WATCH[dietStyle]) {
      const w = DIET_STYLE_WATCH[dietStyle]
      if (w.lead === 'sugar' && quality.sugarShare >= 0.25) {
        const names = quality.topSugaryFoods.slice(0, 2).join(' and ')
        setStyleNote({ tone: 'watch', text: names ? `Sugar crept in through ${names}. More than most people expect.` : 'Some sugar-forward food in today. Worth a glance.' })
      } else if (w.lead === 'fastfood' && quality.fastFoodShare >= 0.2) {
        const names = quality.topFastFoods.slice(0, 2).join(' and ')
        setStyleNote({ tone: 'watch', text: names ? `${names} today. Enjoy it, then let's get back to real meals.` : 'A fast-food style meal today. No shame, just noticing.' })
      } else {
        setStyleNote({ tone: 'good', text: w.onTrack })
      }
    } else {
      setStyleNote(null)
    }

    const frac = eatingDayFraction(new Date())
    const ds = scoreDay({ totals, target: { kcal: kcalTarget, protein: proteinTarget }, fractionElapsed: frac, quality, mode: goalMode })
    if (!ds) {
      setEmpty(true)
      setScored(true)
      return
    }

    // Re-apply any context answers already given today so the score persists.
    let answeredIds: string[] = []
    let storedDelta = 0
    for (const id of CTX_IDS) {
      try {
        const v = localStorage.getItem(ctxKey(foodDayKey, id))
        if (v != null) {
          answeredIds.push(id)
          storedDelta += Number(JSON.parse(v)?.delta) || 0
        }
      } catch {
        /* ignore */
      }
    }
    const liveRows = ds.rows.map((r) => ({ ...r }))
    if (storedDelta) applyWholeDelta(liveRows, storedDelta)

    const latest = todays[todays.length - 1]
    const ms = scoreMeal(latest, { mode: goalMode })
    const q = decideContextQuestion({ meal: latest, mode: goalMode, isTrainingDayToday, answeredIds })

    setDay(ds)
    setRows(liveRows)
    setSelected(biggestGapKey(liveRows))
    setMeal(ms ? { ...ms, name: latest.whatISee?.trim() || mealLabel(latest.mealType) } : null)
    setCtxQ(q)
    setScored(true)

    const shownScore = sumEarned(liveRows)
    fire(shownScore >= 8 ? 'cheer' : shownScore >= 5 ? 'nod' : 'consider')
    if (proteinTarget > 0 && totals.protein >= proteinTarget) celebrate('protein')
    else if (shownScore >= 9 && frac >= 0.5) celebrate('score')

    // Feed today's read into the shared memory so Vee + the connection web can
    // speak to the user's fuel. Fire-and-forget, never blocks the UI.
    void syncCoachFact(foodDayKey, `Fuel today is ${shownScore} out of 10, tuned for ${goalLabel(goalMode)}. ${ds.headline}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- restrictions read via stable restrictionsKey
  }, [celebrate, fire, proteinTarget, kcalTarget, foodStoryDone, goalMode, isTrainingDayToday, meals, restrictionsKey, dietStyle])

  useEffect(() => () => {
    for (const t of [celebTimer, flashTimer, undoTimer, collapseTimer]) if (t.current) clearTimeout(t.current)
  }, [])

  // Keep Echo alive.
  useEffect(() => {
    const greet = setTimeout(() => fire('happyHello'), 1400)
    const idle = setInterval(() => { if (!doorOpen) fire('curious') }, 9000)
    return () => {
      clearTimeout(greet)
      clearInterval(idle)
    }
  }, [fire, doorOpen])

  const onAnswer = useCallback((a: ContextAnswer) => {
    setCtxResolved(a.resolve)
    const id = ctxQ?.id
    // Compute the real change synchronously from the current rows, then commit.
    let realDelta = 0
    if (a.delta !== 0) {
      const next = rows.map((r) => ({ ...r }))
      realDelta = applyWholeDelta(next, a.delta)
      setRows(next)
    }
    if (id) {
      try {
        localStorage.setItem(ctxKey(dayKeyRef.current, id), JSON.stringify({ delta: realDelta }))
      } catch {
        /* ignore */
      }
    }
    if (realDelta !== 0) {
      setFlash({ v: realDelta > 0 ? '+1' : '−1', good: realDelta > 0 })
      fire(realDelta > 0 ? 'cheer' : 'consider')
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setFlash(null), 1150)
    }
    if (realDelta < 0 && id) {
      const restore = () => {
        setRows((prev) => {
          const next = prev.map((r) => ({ ...r }))
          applyWholeDelta(next, -realDelta)
          return next
        })
        try {
          localStorage.removeItem(ctxKey(dayKeyRef.current, id))
        } catch {
          /* ignore */
        }
        setFlash({ v: '+1', good: true })
        if (flashTimer.current) clearTimeout(flashTimer.current)
        flashTimer.current = setTimeout(() => setFlash(null), 1150)
        setUndo(null)
      }
      setUndo(() => restore)
      if (undoTimer.current) clearTimeout(undoTimer.current)
      undoTimer.current = setTimeout(() => setUndo(null), 2400)
    }
    if (collapseTimer.current) clearTimeout(collapseTimer.current)
    collapseTimer.current = setTimeout(() => setCtxQ(null), realDelta < 0 ? 2700 : 1200)
  }, [ctxQ, fire, rows])

  const displayScore = rows.length ? sumEarned(rows) : day?.score ?? null
  const selectedRow = useMemo(() => rows.find((r) => r.key === selected) || rows[0], [rows, selected])

  const snapshot: CoachDaySnapshot = {
    dayLabel: 'today',
    kcal: totalsRef.current.kcal,
    protein: totalsRef.current.protein,
    carbs: totalsRef.current.carbs,
    fat: totalsRef.current.fat,
    kcalTarget,
    proteinTarget,
    score: displayScore,
    scoreReason: day?.headline ?? '',
  }

  const Eyebrow = (
    <div className={styles.eyebrow}>
      <span className={styles.eyebrowNum}>·02</span>
      <span className={styles.eyebrowLbl}>Your Coach</span>
      <span className={styles.eyebrowRule} />
    </div>
  )

  if (!mounted) {
    return (
      <section className={styles.section}>
        {Eyebrow}
        <div className={styles.card} style={{ minHeight: 150 }} />
      </section>
    )
  }

  if (!foodStoryDone) {
    return (
      <section className={styles.section}>
        {Eyebrow}
        <div className={`${styles.card} ${styles.cardLocked}`}>
          <div className={styles.gemStage}>
            <CoachGem preset="echo" />
            <span className={styles.lockBadge} aria-hidden>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 7 V5.2 a3.5 3.5 0 0 1 7 0" /><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
              </svg>
            </span>
          </div>
          <div className={styles.divider} />
          <div className={styles.lockedCol}>
            <span className={styles.lockedTag}>Coach locked</span>
            <p className={styles.lockedTitle}>Tell me your <em>food story</em> and I turn on</p>
            <p className={styles.lockedSub}>Two minutes on how you eat, your allergies, and the way you want to be coached. Then I score your meals and actually know you.</p>
            <Link href="/app/quiz/nutrition" className={styles.lockedCta}>
              Unlock my coach
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8 H13" /><path d="M9 4 L13 8 L9 12" /></svg>
            </Link>
          </div>
        </div>
      </section>
    )
  }

  const goalPhrase = goalLabel(goalMode)

  return (
    <section className={styles.section}>
      {Eyebrow}
      <div className={`${styles.card} ${celebrating ? styles.cardCelebrate : ''}`}>
        <div className={styles.gemStage}>
          <CoachGem preset="echo" controlRef={coachCtrl} />
          {celebrating && (
            <span className={styles.burst} aria-hidden>
              {BURST_PARTICLES.map((p, i) => (
                <i key={i} style={{ ['--dx' as string]: `${p.dx}px`, ['--dy' as string]: `${p.dy}px` }} />
              ))}
            </span>
          )}
        </div>

        <div className={styles.divider} />

        <div className={styles.contentCol}>
          {!scored ? (
            <div className={styles.reason} style={{ marginTop: 8 }}>Reading your day&hellip;</div>
          ) : empty || displayScore == null ? (
            <div className={styles.reason} style={{ marginTop: 8 }}>{emptyMsg}</div>
          ) : (
            <>
              <div className={styles.scores}>
                <div className={styles.score}>
                  <span className={styles.scoreK}>Today’s score</span>
                  <div className={styles.ringWrap}>
                    <ScoreNumber score={displayScore} />
                    {flash && <span className={`${styles.deltaFly} ${flash.good ? styles.deltaGood : styles.deltaBad}`}>{flash.v}</span>}
                  </div>
                  {meal && (
                    <span className={styles.scoreCap}>
                      Latest meal scored {meal.score}/10
                    </span>
                  )}
                </div>
              </div>

              <div className={styles.goalCue}>
                <span className={styles.goalPip} aria-hidden />
                <span className={styles.goalLbl}>Tuned for</span>
                <span className={styles.goalPh}>{goalPhrase}</span>
              </div>

              {day?.headline && (
                <p className={styles.headline}>
                  <Highlight text={day.headline} phrase={day.headlineHighlight} />
                </p>
              )}

              {/* Allergen guard — a warm, hedged heads-up when a logged food
                  looks like something the user asked to avoid. Amber, never red. */}
              {allergenFlags.length > 0 && (
                <div className={styles.allergen} role="status">
                  <svg className={styles.allergenIco} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 3l9 16H3z" /><path d="M12 10v4" /><path d="M12 17h.01" />
                  </svg>
                  <div className={styles.allergenBody}>
                    {allergenFlags.map((f, i) => (
                      <p key={i} className={styles.allergenLine}>
                        {f.kind === 'diet' ? (
                          <><b>{f.food}</b> may not be <b>{f.label}</b>, which you asked to keep to.</>
                        ) : (
                          <><b>{f.food}</b> looks like it may contain <b>{f.label}</b>, which you asked to avoid.</>
                        )}
                      </p>
                    ))}
                    <span className={styles.allergenNote}>A heads-up from your food story, not a lab test. Worth a second look.</span>
                  </div>
                </div>
              )}

              {/* dietStyle focus line — leads with the signal this person cares
                  about (sugar, fast food, whole foods) instead of a raw macro grade. */}
              {styleNote && (
                <p className={styles.styleNote} data-tone={styleNote.tone}>
                  <span className={styles.styleDot} aria-hidden />
                  {styleNote.text}
                </p>
              )}

              {ctxQ && (
                <div className={styles.ctxStrip} data-tone={ctxQ.tone}>
                  <div className={styles.ctxAsk}>
                    <span className={styles.ctxAskE}>Echo</span>
                    <span className={styles.ctxAskT}>asks</span>
                  </div>
                  {ctxResolved ? (
                    <RevealText key={ctxResolved} text={ctxResolved} className={styles.ctxQ} />
                  ) : (
                    <>
                      <div className={styles.ctxQ}><Highlight text={ctxQ.question} phrase={ctxQ.highlight} bold /></div>
                      <div className={styles.ctxBtns}>
                        {ctxQ.answers.map((a, i) => (
                          <button
                            key={i}
                            type="button"
                            className={`${styles.ctxBtn} ${a.delta !== 0 ? styles.ctxBtnYes : styles.ctxBtnGhost}`}
                            onClick={() => onAnswer(a)}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {undo && (
                <div className={styles.graceUndo}>
                  <span>Point eased off.</span>
                  <button type="button" onClick={() => undo()}>Undo, keep the point</button>
                </div>
              )}

              <div className={styles.whyLabel}>Why today is a {displayScore}</div>
              <div className={styles.chips}>
                {rows.map((r) => {
                  const full = r.earned >= r.max
                  const tone = full ? 'good' : 'watch'
                  return (
                    <button
                      key={r.key}
                      type="button"
                      className={`${styles.chip} ${selected === r.key ? styles.chipActive : ''}`}
                      data-tone={tone}
                      onClick={() => setSelected(r.key)}
                    >
                      <span className={styles.chipLbl}>{r.label}</span>
                      <span className={styles.chipDelta}>{full ? '+0' : `−${r.max - r.earned}`}</span>
                    </button>
                  )
                })}
              </div>

              {selectedRow && (
                <div className={styles.detail} data-tone={selectedRow.earned >= selectedRow.max ? 'good' : 'watch'} key={selectedRow.key + ':' + selectedRow.earned}>
                  <div className={styles.dTop}>
                    <span className={styles.dName}>{selectedRow.label}</span>
                    <div className={styles.dRight}>
                      <span className={styles.dPips}>
                        {Array.from({ length: selectedRow.max }, (_, i) => (
                          <i key={i} className={`${styles.dPip} ${i < selectedRow.earned ? styles.dPipOn : ''}`} />
                        ))}
                      </span>
                      <span className={styles.dDelta}>{selectedRow.earned >= selectedRow.max ? '+0' : `−${selectedRow.max - selectedRow.earned}`}</span>
                    </div>
                  </div>
                  <div className={styles.dReason}>{selectedRow.reason}</div>
                  <div className={styles.dPts}>{selectedRow.earned} of {selectedRow.max} {selectedRow.max === 1 ? 'point' : 'points'}</div>
                </div>
              )}

              <div className={styles.askCol}>
                <button type="button" className={styles.claudePill} onClick={() => setDoorOpen(true)}>
                  <svg className={styles.claudePillSpark} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4" />
                  </svg>
                  <span className={styles.claudePillText}>talk deeper in Claude</span>
                  <svg className={styles.claudePillArrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </button>
                <span className={styles.claudeHint}>Free in Claude, knows your whole day. No limits.</span>
              </div>
            </>
          )}
        </div>
      </div>

      <CoachDoorway open={doorOpen} onClose={() => setDoorOpen(false)} snapshot={snapshot} />
    </section>
  )
}

/** Render `text` with one `phrase` wrapped in the mint highlight span. */
function Highlight({ text, phrase, bold }: { text: string; phrase?: string; bold?: boolean }) {
  if (!phrase || !text.includes(phrase)) return <>{text}</>
  const i = text.indexOf(phrase)
  return (
    <>
      {text.slice(0, i)}
      <em className={bold ? styles.hlBold : styles.hl}>{phrase}</em>
      {text.slice(i + phrase.length)}
    </>
  )
}

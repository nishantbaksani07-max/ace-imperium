'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'

import type { Meal, MealType, UsdaCandidate, SearchMode } from '@/lib/nutrition/types'
import { FOOD_FACTS, FACT_TAGS } from '@/lib/nutrition/foodFacts'
import { shiftDayKey, getRecentDayKeys } from '@/lib/nutrition/dayKey'
import { weightDelta, dayTotals } from '@/lib/nutrition/trend'
import { dailyFoodScore, foodScoreTone } from '@/lib/nutrition/dayScore'
import { kgToDisplay, unitLabel } from '@/lib/units'
import styles from './macros.module.css'
import { useMacros, type MacrosInit, SKIP_ANSWER } from './useMacros'
import { buildDrinkMeal, buildTemplateMeal, buildRecentMeal } from './build'
import WelcomeBackdrop from '@/components/WelcomeBackdrop'
import type { DrinkLogResult } from './DrinksLibrary'
import VitalityIcon, { type IconName } from '@/components/VitalityIcon'
import FuelInfo from './FuelInfo'

// Interaction-only sheets/modals: none render at first paint, so they load on
// first open instead of hydrating (and blocking) with the page bundle.
const MyMacrosSheet = dynamic(() => import('./MyMacrosSheet'), { ssr: false })
const BarcodeScanner = dynamic(() => import('./BarcodeScanner'), { ssr: false })
const SettingsPanel = dynamic(() => import('./SettingsPanel'), { ssr: false })
const FoodEditor = dynamic(() => import('./FoodEditor'), { ssr: false })
const FoodSearchPicker = dynamic(() => import('./FoodSearchPicker'), { ssr: false })
const DrinksLibrary = dynamic(() => import('./DrinksLibrary'), { ssr: false })
const ScanContextSheet = dynamic(() => import('./ScanContextSheet'), { ssr: false })

const TYPE_LABEL: Record<MealType, string> = {
  auto: 'Logged',
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
  restaurant: 'Restaurant',
  other: 'Logged',
}

const round = (n: number) => Math.round(n || 0)

// Meal-type → Vitality icon (sunrise / noon sun / moon+star / cookie; plate for the rest).
const MEAL_ICON: Record<MealType, IconName> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  snack: 'snack',
  restaurant: 'plate',
  other: 'plate',
  auto: 'plate',
}

function dayLabel(dayKey: string, todayKey: string): string {
  if (dayKey === todayKey) return 'Today'
  if (dayKey === shiftDayKey(todayKey, -1)) return 'Yesterday'
  const [y, m, d] = dayKey.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

// `initialCheckin` is accepted at the boundary now (computed on Fuel load) so the
// nudge-card work (Plan 4) is a rendering-only step; it harmlessly flows through
// `props` and is ignored by useMacros until then.
export default function Macros({ extraSections, coachSlot, foodStoryDone = false, ...props }: MacrosInit & { extraSections?: ReactNode; coachSlot?: ReactNode; foodStoryDone?: boolean; initialCheckin?: import('@/lib/nutrition/adaptive').Checkin | null }) {
  const m = useMacros(props)
  const fileRef = useRef<HTMLInputElement>(null)
  const [showManual, setShowManual] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showDrinks, setShowDrinks] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  // The picked photo waits here while the scan-context sheet collects a quick
  // food summary + meal type + source, then fires analyzePhoto with that context.
  const [scanFile, setScanFile] = useState<File | null>(null)
  const [scanUrl, setScanUrl] = useState<string | null>(null)

  function closeScanSheet() {
    setScanFile(null)
    setScanUrl((url) => {
      if (url) URL.revokeObjectURL(url)
      return null
    })
  }

  const kcalPct = m.currentTarget.kcal > 0 ? Math.min(m.totals.kcal / m.currentTarget.kcal, 1) : 0

  // Auto-dismiss toasts so a stale "Logged" / error doesn't sit on screen.
  // Skip "working" (it's transient progress, replaced by the next status).
  useEffect(() => {
    if (!m.status || m.status.tone === 'working') return
    const ms = m.status.tone === 'error' ? 7000 : m.status.action ? 6000 : 3500
    const t = setTimeout(() => m.clearStatus(), ms)
    return () => clearTimeout(t)
  }, [m.status, m.clearStatus])

  const grouped = useMemo(() => {
    const order: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack', 'restaurant', 'other', 'auto']
    const buckets = new Map<MealType, Meal[]>()
    for (const meal of m.dayMeals) {
      const key = (meal.mealType || 'auto') as MealType
      const bucket = buckets.get(key) || []
      bucket.push(meal)
      buckets.set(key, bucket)
    }
    return order.filter((k) => buckets.has(k)).map((k) => ({ type: k, meals: buckets.get(k)! }))
  }, [m.dayMeals])

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setScanFile(file)
      setScanUrl(URL.createObjectURL(file))
    }
    e.target.value = ''
  }

  const overKcal = m.currentTarget.kcal > 0 && m.totals.kcal > m.currentTarget.kcal
  // The status pill was misleading: anything not-over read as "On track", so an
  // empty day claimed you were on track. Be honest — nothing logged is its own
  // neutral state, "On track" only once there's real intake under the goal.
  const noneLogged = m.totals.kcal <= 0
  const statusLabel = overKcal ? 'Over today' : noneLogged ? (m.isToday ? 'Nothing logged yet' : 'Nothing logged') : 'On track'
  const statusClass = overKcal ? styles.statusOver : noneLogged ? styles.statusIdle : ''
  const [yy, mm, dd] = m.currentDayKey.split('-').map(Number)
  const dateStr = new Date(yy, mm - 1, dd).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })

  return (
    <main className={`${styles.page} grain-overlay`}>
      <WelcomeBackdrop />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />

      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.topRow}>
            <Link href="/app" className={styles.back}>
              ← Dashboard
            </Link>
            <button className={styles.adjustBtn} onClick={() => setShowSettings(true)} aria-label="Targets and settings">
              <VitalityIcon name="gear" size={15} /> Adjust targets
            </button>
          </div>
          <div className={styles.headline}>
            <div className={styles.eyebrowTop}>Fuel · Macros</div>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>{m.isToday ? "Today's fuel" : dayLabel(m.currentDayKey, m.todayKey)}</h1>
              <FuelInfo />
              {m.currentTarget.kcal > 0 && (
                <span className={`${styles.statusPill} ${statusClass}`}>
                  {statusLabel}
                </span>
              )}
            </div>
            <div className={styles.subRow}>
              <span className={styles.date}>{dateStr}</span>
              <span className={styles.dayNav}>
                <button className={styles.dayArrow} onClick={() => m.goToDay(shiftDayKey(m.currentDayKey, -1))} aria-label="Previous day">
                  ‹
                </button>
                <button className={styles.dayArrow} onClick={() => m.goToDay(shiftDayKey(m.currentDayKey, 1))} disabled={m.isToday} aria-label="Next day">
                  ›
                </button>
              </span>
              {m.goals.cycleEnabled && (
                <span className={styles.dayToggle} role="group" aria-label="Gym day or rest day">
                  <button
                    type="button"
                    className={m.currentDayType === 'gym' ? styles.dayToggleOn : ''}
                    aria-pressed={m.currentDayType === 'gym'}
                    onClick={() => m.setDayType('gym')}
                  >
                    <span className={styles.dayToggleDot} /> Gym day
                  </button>
                  <button
                    type="button"
                    className={m.currentDayType === 'rest' ? styles.dayToggleOn : ''}
                    aria-pressed={m.currentDayType === 'rest'}
                    onClick={() => m.setDayType('rest')}
                  >
                    <span className={styles.dayToggleDot} /> Rest day
                  </button>
                </span>
              )}
              {m.streak > 1 && (
                <span className={styles.streak}><span className={styles.streakDot} />{m.streak} day streak</span>
              )}
            </div>
          </div>
        </header>

        {!m.tipsSeen && (
          <div className={styles.onboard}>
            <ol className={styles.onboardSteps}>
              <li><strong>Snap a photo.</strong> Vitality finds the foods and estimates the portions.</li>
              <li><strong>Or add by name.</strong> Search foods, then set the amount.</li>
              <li><strong>Or skip the photo.</strong> Use Quick drinks, add by name, or scan a barcode.</li>
            </ol>
            <button className={styles.onboardDismiss} onClick={m.dismissOnboarding}>
              Got it
            </button>
          </div>
        )}

        {/* ·01 Today — calories tile + macro bars */}
        <section className={styles.section}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowNum}>·01</span>
            <span className={styles.eyebrowLbl}>Today</span>
            <span className={styles.eyebrowRule} />
          </div>
          <div className={styles.fuelGrid}>
            <div className={styles.calTile}>
              <div className={styles.tileTop}>
                <span className={styles.tileIc}><VitalityIcon name="kcal" size={22} /></span>
                <span className={styles.tileLbl}>Calories</span>
              </div>
              <div className={styles.calBig}>
                <span className={styles.calNum}>{round(m.remaining.kcal.remaining)}</span>
                <span className={styles.calLeft}>kcal<br />{m.remaining.kcal.over ? 'over' : 'left'}</span>
              </div>
              <div className={styles.fuelMeter}>
                <div className={styles.fuelFill} style={{ width: `${kcalPct * 100}%`, ...(overKcal ? { background: 'linear-gradient(90deg, var(--amber-warm), var(--amber))' } : {}) }} />
                <div className={styles.fuelSeg} />
              </div>
              <div className={styles.calFoot}>
                <span><b>{round(m.totals.kcal)}</b> eaten</span>
                <span><b>{round(m.currentTarget.kcal)}</b> goal</span>
              </div>
            </div>

            <div className={styles.macroTile}>
              <MacroRow kind="protein" label="Protein" value={m.totals.protein} target={m.currentTarget.protein} />
              <MacroRow kind="carbs" label="Carbs" value={m.totals.carbs} target={m.currentTarget.carbs} />
              <MacroRow kind="fat" label="Fat" value={m.totals.fat} target={m.currentTarget.fat} />
            </div>
          </div>
        </section>

        {/* fastest re-log paths, surfaced right under the reading */}
        {m.recents.length > 0 && (
          <div className={styles.recents}>
            <span className={styles.recentsLabel}>Recent</span>
            {m.recents.map((r) => (
              <button key={r.name} className={styles.recentChip} onClick={() => m.logBuilt(buildRecentMeal(r, m.currentDayKey))}>
                {r.name} · {round(r.macros.kcal)}
              </button>
            ))}
          </div>
        )}

        {m.templates.length > 0 && (
          <div className={styles.recents}>
            <span className={styles.recentsLabel}>Favorites</span>
            {m.templates.slice(0, 8).map((t) => (
              <button key={t.id} className={styles.recentChip} onClick={() => m.logBuilt(buildTemplateMeal(t, m.currentDayKey))}>
                {t.name} · {round(t.totals.kcal)}
              </button>
            ))}
          </div>
        )}

        {/* primary actions — Photo hero + a trio of icon-tiles (Concept A) */}
        <div className={styles.actions}>
          <button className={styles.snap} onClick={() => fileRef.current?.click()}>
            <span className={styles.snapInner}>
              <VitalityIcon name="camera" size={20} /> Snap a meal
            </span>
          </button>
          <div className={styles.actionTrio}>
            <button className={styles.actionCell} onClick={() => setShowManual(true)}>
              <span className={styles.actionIc}><VitalityIcon name="search" size={20} /></span>
              <span className={styles.actionLabel}>Add food</span>
            </button>
            <button className={styles.actionCell} onClick={() => setShowDrinks((s) => !s)}>
              <span className={`${styles.actionIc} ${styles.actionIcIris}`}><VitalityIcon name="coffee" size={20} /></span>
              <span className={styles.actionLabel}>Quick drink</span>
            </button>
            <button className={styles.actionCell} onClick={() => setShowScanner(true)}>
              <span className={`${styles.actionIc} ${styles.actionIcAmber}`}><VitalityIcon name="barcode" size={20} /></span>
              <span className={styles.actionLabel}>Scan</span>
            </button>
          </div>
        </div>

        {showDrinks && (
          <DrinksLibrary
            onClose={() => setShowDrinks(false)}
            onLogWater={() => {
              // Water isn't a drink here — bounce to its own section (·04).
              setShowDrinks(false)
              window.dispatchEvent(new CustomEvent('vitality:goto-water'))
            }}
            onLog={(r: DrinkLogResult) => {
              // Every drink logs as a meal — calories, or a 0-kcal entry like
              // Coke Zero. (Water has its own section, so it's not a drink.)
              m.logBuilt(
                buildDrinkMeal({ id: 'catalog-drink', name: r.name, grams: r.ml, macros: r.macros }, m.currentDayKey, r.ml),
              )
              setShowDrinks(false)
            }}
          />
        )}

        {/* meals */}
        <section className={styles.meals}>
          {m.dayMeals.length === 0 ? (
            <p className={styles.empty}>
              <em>Nothing logged {m.isToday ? 'yet today' : 'this day'}.</em>
            </p>
          ) : (
            grouped.map((g) => (
              <div key={g.type} className={styles.group}>
                <h2 className={styles.groupTitle}>
        <VitalityIcon name={MEAL_ICON[g.type]} size={14} className={styles.groupTitleIc} />
        {TYPE_LABEL[g.type]}
      </h2>
                {g.meals.map((meal) =>
                  meal.pending ? (
                    <PendingMealCard key={meal.id} meal={meal} onCancel={() => m.cancelAnalysis(meal.id)} />
                  ) : (
                  <MealCard
                    key={meal.id}
                    meal={meal}
                    onDelete={() => m.removeMeal(meal.id)}
                    onAnswer={(qid, label) => m.answerQuestion(meal.id, qid, label)}
                    onSkip={(qid) => m.skipQuestion(meal.id, qid)}
                    onChange={(qid) => m.changeAnswer(meal.id, qid)}
                    onResolveQuestion={(qid, candidate, grams) => m.resolveQuestionWithFood(meal.id, qid, candidate, grams)}
                    onFavorite={() =>
                      m.addFavorite(meal.whatISee.replace(/^\(.*?:\s*/, '').replace(/\)$/, '') || 'Meal', {
                        foods: meal.foods,
                        totals: meal.totals,
                        thumbnail: meal.thumbnail,
                        mealType: meal.mealType,
                      })
                    }
                    onPatchFood={(foodIdx, next) => m.patchFood(meal.id, foodIdx, next)}
                    onReidentify={(foodIdx, candidate, grams) => m.reidentifyFood(meal.id, foodIdx, candidate, grams)}
                    onRemoveFood={(foodIdx) => m.removeFood(meal.id, foodIdx)}
                    onAddFood={(candidate, grams) => m.addFoodToMeal(meal.id, candidate, grams)}
                    onResolveUnmatched={(unmatchedIdx, candidate, grams) => m.resolveUnmatched(meal.id, unmatchedIdx, candidate, grams)}
                    onDismissUnmatched={(unmatchedIdx) => m.dismissUnmatched(meal.id, unmatchedIdx)}
                    onNote={(mealId, note) => m.setMealNote(mealId, note)}
                    onRedoScan={() => m.redoScan(meal.id)}
                    isRescanning={m.rescanningId === meal.id}
                    searchMode={m.goals.searchMode ?? 'basic'}
                    onSearchMode={m.setSearchMode}
                  />
                  )
                )}
              </div>
            ))
          )}
        </section>

        {/* AI Food Coach — high-visibility slot, right under the day's meals */}
        {coachSlot}

        {/* week summary strip */}
        <WeekSummaryStrip macros={m} />

        {/* past-week day list */}
        <PastWeekList macros={m} />

        {/* Water + Supplements sections, folded into the Fuel page */}
        {extraSections}
      </div>

      {/* status toast */}
      {m.status && (
        <div className={`${styles.toast} ${styles[`toast_${m.status.tone}`]}`} onClick={m.clearStatus}>
          <span>{m.status.text}</span>
          {m.status.action && (
            <button
              className={styles.toastAction}
              onClick={(e) => {
                e.stopPropagation()
                m.status!.action!.run()
                m.clearStatus()
              }}
            >
              {m.status.action.label}
            </button>
          )}
        </div>
      )}

      {showManual && (
        <MyMacrosSheet
          macros={m}
          onClose={() => setShowManual(false)}
        />
      )}

      {showSettings && (
        <SettingsPanel macros={m} onClose={() => setShowSettings(false)} foodStoryDone={foodStoryDone} />
      )}

      {showScanner && (
        <BarcodeScanner
          dayKey={m.currentDayKey}
          onClose={() => setShowScanner(false)}
          onLog={async (input) => {
            const ok = await m.logBuilt(input)
            if (ok !== false) setShowScanner(false)
          }}
        />
      )}

      {scanFile && (
        <ScanContextSheet
          photoUrl={scanUrl}
          defaultMealType={m.selectedMealType}
          onCancel={closeScanSheet}
          onScan={(ctx) => {
            const file = scanFile
            closeScanSheet()
            if (file) m.analyzePhoto(file, ctx)
          }}
        />
      )}

    </main>
  )
}

function WeekSummaryStrip({ macros }: { macros: ReturnType<typeof useMacros> }) {
  const m = macros
  const delta = weightDelta(m.weights, m.todayKey, 7)
  const u = unitLabel(m.units)
  const deltaDisplay = delta !== null ? kgToDisplay(Math.abs(delta), m.units) : null
  const deltaPositive = delta !== null && delta > 0

  return (
    <div className={styles.weekStrip}>
      <div className={styles.weekStat}>
        <strong>{m.week.daysLogged}</strong>
        <span>days logged</span>
      </div>
      <div className={styles.weekStat}>
        <strong>{round(m.week.avgKcal)}</strong>
        <span>avg kcal</span>
      </div>
      <div className={styles.weekStat}>
        <strong>{round(m.week.avgProtein)}g</strong>
        <span>avg protein</span>
      </div>
      <div className={styles.weekStat}>
        <strong>{m.week.proteinTargetHits}</strong>
        <span>protein hits</span>
      </div>
      {deltaDisplay !== null && (
        <div
          className={styles.weightTrend}
          style={{ color: deltaPositive ? 'var(--amber)' : 'var(--mint)' }}
        >
          <strong>{deltaPositive ? '+' : '-'}{deltaDisplay} {u}</strong>
          <span>7-day weight</span>
        </div>
      )}
    </div>
  )
}

function PastWeekList({ macros }: { macros: ReturnType<typeof useMacros> }) {
  const m = macros
  const days = getRecentDayKeys(m.todayKey, 7)

  return (
    <div className={styles.pastWeek}>
      <span className={`${styles.recentsLabel} ${styles.iconLabel}`}>
        <VitalityIcon name="week" size={14} />Past week
      </span>
      {days.map((key) => {
        const t = dayTotals(m.meals, key)
        const target = m.targetForDayKey(key)
        const isActive = key === m.currentDayKey
        // Prefer the AI coach's read; otherwise a deterministic adherence score,
        // so EVERY logged day shows a food rating, not only coach-read days.
        const coachScore = m.scores[key]?.score
        const score = typeof coachScore === 'number' ? coachScore : dailyFoodScore(t, target)
        const toneClass =
          typeof score === 'number'
            ? foodScoreTone(score) === 'good'
              ? styles.pwScoreGood
              : foodScoreTone(score) === 'low'
                ? styles.pwScoreLow
                : styles.pwScoreOk
            : ''
        const pct = target.kcal > 0 ? Math.min(1, t.kcal / target.kcal) : 0
        const over = target.kcal > 0 && t.kcal > target.kcal
        return (
          <button
            key={key}
            className={`${styles.pastWeekRow} ${styles.pwHasScore} ${isActive ? styles.pastWeekRowOn : ''}`}
            onClick={() => m.goToDay(key)}
          >
            <span className={styles.pwDay}>{dayLabel(key, m.todayKey)}</span>
            <span className={styles.pwBar} aria-hidden>
              <i style={{ width: `${pct * 100}%`, ...(over ? { background: 'var(--amber)' } : {}) }} />
            </span>
            <span className={styles.pwKcal}><b>{round(t.kcal)}</b><small>kcal</small></span>
            <span className={styles.pwProtein}>{round(t.protein)}<small>P</small></span>
            <span className={`${styles.pwScore} ${toneClass}`} title="Daily food rating (protein + calorie target)">
              {typeof score === 'number' ? <>{score}<small>/10</small></> : <i className={styles.pwScoreNone}>–</i>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function MacroRow({ kind, label, value, target }: { kind: 'protein' | 'carbs' | 'fat'; label: string; value: number; target: number }) {
  const pct = target > 0 ? Math.min(value / target, 1) : 0
  const over = target > 0 && value > target
  return (
    <div className={`${styles.mrow} ${styles[kind]}`}>
      <span className={styles.mIc}><VitalityIcon name={kind} size={20} /></span>
      <div className={styles.mMid}>
        <div className={styles.mTop}>
          <span className={styles.mName}>{label}</span>
          <span className={styles.mVal}>
            <b>{round(value)}</b>{target > 0 ? ` / ${round(target)} g` : ' g'}
          </span>
        </div>
        <div className={styles.mTrack}>
          <i style={{ width: `${pct * 100}%`, ...(over ? { background: 'var(--amber)' } : {}) }} />
        </div>
      </div>
      <span className={styles.mPct}>{target > 0 ? `${Math.round(pct * 100)}%` : '—'}</span>
    </div>
  )
}

function PendingMealCard({ meal, onCancel }: { meal: Meal; onCancel: () => void }) {
  // Rotate a fun food fact (playful tag + a color-matched highlight) while the
  // photo analyzes, so the wait is a treat. The whole card tints to the fact's
  // macro. `tick` re-keys the tag + fact so the pop animation replays.
  const [tick, setTick] = useState(0)
  const [fact, setFact] = useState(() => FOOD_FACTS[Math.floor(Math.random() * FOOD_FACTS.length)])
  const [tag, setTag] = useState(() => FACT_TAGS[Math.floor(Math.random() * FACT_TAGS.length)])
  useEffect(() => {
    const t = setInterval(() => {
      setFact(FOOD_FACTS[Math.floor(Math.random() * FOOD_FACTS.length)])
      setTag(FACT_TAGS[Math.floor(Math.random() * FACT_TAGS.length)])
      setTick((n) => n + 1)
    }, 3200)
    return () => clearInterval(t)
  }, [])

  const hlIdx = fact.text.indexOf(fact.highlight)

  return (
    <article className={`${styles.card} ${styles.cardPending}`} data-tone={fact.macro}>
      {meal.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={meal.thumbnail} alt="" className={styles.cardThumb} />
      ) : (
        <div className={styles.cardThumbPlaceholder} aria-hidden />
      )}
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <span className={styles.pendingTitle}>Analyzing your photo…</span>
          <button className={styles.pendingCancel} onClick={onCancel} aria-label="Cancel analysis">
            ×
          </button>
        </div>
        <div className={styles.pendingBar} aria-hidden>
          <span />
        </div>
        <div className={styles.pendingFact}>
          <span key={`tag${tick}`} className={styles.factTag}>{tag}</span>
          <p key={`fact${tick}`} className={styles.factText}>
            {hlIdx < 0 ? (
              fact.text
            ) : (
              <>
                {fact.text.slice(0, hlIdx)}
                <span className={styles.factHl}>{fact.highlight}</span>
                {fact.text.slice(hlIdx + fact.highlight.length)}
              </>
            )}
          </p>
          <div className={styles.factDots} aria-hidden><i /><i /><i /></div>
        </div>
      </div>
    </article>
  )
}

function MealCard({
  meal,
  onDelete,
  onAnswer,
  onSkip,
  onChange,
  onResolveQuestion,
  onFavorite,
  onPatchFood,
  onReidentify,
  onRemoveFood,
  onAddFood,
  onResolveUnmatched,
  onDismissUnmatched,
  onNote,
  onRedoScan,
  isRescanning,
  searchMode,
  onSearchMode,
}: {
  meal: Meal
  onDelete: () => void
  onAnswer: (questionId: string, optionLabel: string) => void
  onSkip: (questionId: string) => void
  onChange: (questionId: string) => void
  onResolveQuestion: (questionId: string, candidate: UsdaCandidate, grams: number) => void
  onFavorite: () => void
  onPatchFood: (foodIdx: number, next: { name: string; grams: number }) => void
  onReidentify: (foodIdx: number, candidate: UsdaCandidate, grams: number) => void
  onRemoveFood: (foodIdx: number) => void
  onAddFood: (candidate: UsdaCandidate, grams: number) => void
  onResolveUnmatched: (unmatchedIdx: number, candidate: UsdaCandidate, grams: number) => void
  onDismissUnmatched: (unmatchedIdx: number) => void
  onNote: (mealId: string, note: string) => void
  onRedoScan?: () => void
  isRescanning?: boolean
  searchMode?: SearchMode
  onSearchMode?: (mode: SearchMode) => void
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [confirmRemoveIdx, setConfirmRemoveIdx] = useState<number | null>(null)
  const [addingFood, setAddingFood] = useState(false)
  const [resolvingIdx, setResolvingIdx] = useState<number | null>(null)
  const [somethingElseQid, setSomethingElseQid] = useState<string | null>(null)
  const [noteEditing, setNoteEditing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const escapeRef = useRef(false)

  // A short, single-line title. The full food list lives in the foods drawer, so
  // the headline never becomes a wall of names on a 6-item plate.
  // Drop the parenthetical qualifier so the headline reads "canned tuna", not
  // "canned tuna (in water, drained)" cut off to "canned..." in a narrow card.
  const stripParen = (s: string) => s.replace(/\s*\([^)]*\)/g, '').trim() || s

  // The AI now writes a short fun meal name into whatISee ("tuna salad",
  // "healthy breakfast"). Use it as the headline when it reads like a name.
  // Older meals stored a long sentence there, so anything wordy falls back to
  // the food-based title below. Quick drinks / manual entries use a "(...)" tag.
  const looksLikeName = (s: string) =>
    !!s && !s.startsWith('(') && s.trim().split(/\s+/).length <= 5 && s.length <= 34

  // Keep a clarifying question to its calm subject. Older meals stored a verbose
  // "Subject — is this A, B, or C? Long explanation." string; the option chips
  // below already carry the choice, so we show only the subject (and never an
  // em-dash). New meals are already short, so this is mostly a no-op for them.
  const cleanQuestion = (s: string) => {
    const dash = s.search(/\s[—–]\s/)
    if (dash > 0) return s.slice(0, dash).trim()
    const q = s.indexOf('?')
    return (q >= 0 ? s.slice(0, q + 1) : s).trim()
  }
  const shortTitle =
    looksLikeName(meal.whatISee)
      ? meal.whatISee
      : meal.foods.length === 0
        ? meal.whatISee || 'Meal'
        : meal.foods.length === 1
          ? stripParen(meal.foods[0].name)
          : `${stripParen(meal.foods[0].name)} +${meal.foods.length - 1} more`

  // One slim stacked bar split by each macro's share of the meal's calories.
  const proteinG = meal.totals.protein
  const carbsG = meal.totals.carbs
  const fatG = meal.totals.fat
  const macroCals = proteinG * 4 + carbsG * 4 + fatG * 9 || 1
  const share = (cals: number) => `${Math.round((cals / macroCals) * 100)}%`
  const openQuestions = meal.clarifyingQuestions.filter((q) => !q.answer)
  const checkSwing = openQuestions.reduce((a, q) => a + (q.estimated_kcal_swing || 0), 0)
  // Stepper: show one open check at a time; answered ones drop to a compact list.
  const activeQuestion = openQuestions[0]
  const answeredQuestions = meal.clarifyingQuestions.filter((q) => q.answer)
  // Draw the eye to the noun being asked about: highlight the last word in mint.
  const highlightLast = (s: string): ReactNode => {
    const words = s.trim().split(/\s+/)
    if (words.length < 2) return <span className={styles.kw}>{s}</span>
    const last = words.pop()
    return (<>{words.join(' ')} <span className={styles.kw}>{last}</span></>)
  }
  // The macro legend appears in the row on desktop, and inside the body on mobile.
  const legend = (
    <>
      <span className={styles.legendItem}><i className={`${styles.legendDot} ${styles.legendP}`} /><b>{round(proteinG)}g</b> protein</span>
      <span className={styles.legendItem}><i className={`${styles.legendDot} ${styles.legendC}`} /><b>{round(carbsG)}g</b> carbs</span>
      <span className={styles.legendItem}><i className={`${styles.legendDot} ${styles.legendF}`} /><b>{round(fatG)}g</b> fat</span>
    </>
  )

  return (
    <article className={`${styles.card} ${styles.cardResult}`} data-open={expanded ? 'true' : undefined}>
      <button
        type="button"
        className={styles.cardRow}
        aria-expanded={expanded}
        onClick={() => setExpanded((o) => !o)}
      >
        {meal.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={meal.thumbnail}
            alt=""
            className={`${styles.cardThumb} ${styles.cardThumbTap}`}
            title="Tap to view photo"
            onClick={(e) => { e.stopPropagation(); setLightbox(true) }}
          />
        )}
        <div className={styles.cardTitleLine}>
          <span className={styles.cardTitle}>{shortTitle}</span>
          {meal.mealType && meal.mealType !== 'auto' && (
            <span className={styles.cardSub}>{meal.mealType}</span>
          )}
          {meal.state === 'uncertain' && (
            <span className={styles.estimateBadge} title="The AI wasn't fully sure here. Open the foods to check or fix anything.">
              estimate
            </span>
          )}
        </div>
        <div className={styles.cardBarWrap}>
          <div className={styles.macroStack}>
            <span className={`${styles.macroSeg} ${styles.macroSegP}`} style={{ width: share(proteinG * 4) }} />
            <span className={`${styles.macroSeg} ${styles.macroSegC}`} style={{ width: share(carbsG * 4) }} />
            <span className={`${styles.macroSeg} ${styles.macroSegF}`} style={{ width: share(fatG * 9) }} />
          </div>
          <div className={styles.macroLegend}>{legend}</div>
        </div>
        <span className={styles.cardKcal}>
          <b>{round(meal.totals.kcal)}</b>
          <i>kcal</i>
        </span>
        <svg className={styles.cardChev} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="m6 9 6 6 6-6" /></svg>
      </button>

      <div className={`${styles.cardDetail} ${expanded ? styles.cardDetailOpen : ''}`}>
        <div className={styles.cardDetailInner}>

        {meal.foods.length > 0 && (
          <div className={styles.foodList}>
            {meal.foods.map((f, i) => (
              <div key={i} className={styles.foodItem}>
                {confirmRemoveIdx === i ? (
                  <div className={styles.removeConfirm} role="alertdialog" aria-label={`Delete ${f.name}?`}>
                    <div className={styles.removeConfirmHead}>
                      <span className={styles.removeConfirmIcon}><VitalityIcon name="trash" size={15} /></span>
                      <div className={styles.removeConfirmText}>
                        <b>Delete “{stripParen(f.name)}”?</b>
                        <span>This takes it off your log. You can’t undo it — you’d have to re-scan or add it back by hand.</span>
                      </div>
                    </div>
                    <div className={styles.removeConfirmActions}>
                      <button className={styles.removeKeep} onClick={() => setConfirmRemoveIdx(null)}>Keep it</button>
                      <button className={styles.removeGo} onClick={() => { onRemoveFood(i); setConfirmRemoveIdx(null) }}>
                        <VitalityIcon name="trash" size={13} /> Delete
                      </button>
                    </div>
                  </div>
                ) : editingIdx === i ? (
                  <FoodEditor
                    key={editingIdx}
                    food={f}
                    onSave={(next) => {
                      onPatchFood(i, next)
                      setEditingIdx(null)
                    }}
                    onCancel={() => setEditingIdx(null)}
                    onReidentify={(candidate, grams) => {
                      onReidentify(i, candidate, grams)
                      setEditingIdx(null)
                    }}
                    onRemove={() => {
                      // Route the editor's Remove through the same warning card.
                      setEditingIdx(null)
                      setConfirmRemoveIdx(i)
                    }}
                    searchMode={searchMode}
                    onSearchMode={onSearchMode}
                  />
                ) : (
                  <div className={styles.foodRow}>
                    <button
                      className={styles.foodRowBtn}
                      onClick={() => setEditingIdx(i)}
                      aria-label={`Edit ${f.name}`}
                    >
                      <span className={styles.foodRowLeft}>
                        <span className={styles.foodRowName}>{f.name}</span>
                        <span className={styles.foodRowMacros}>
                          {round(f.macros.protein)}<i>P</i> · {round(f.macros.carbs)}<i>C</i> · {round(f.macros.fat)}<i>F</i>
                        </span>
                      </span>
                      <span className={styles.foodRowMeta}>
                        {round(f.grams)}g · {round(f.macros.kcal)} kcal
                        <svg className={styles.foodChev} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="m9 18 6-6-6-6" /></svg>
                      </span>
                    </button>
                    <button
                      className={styles.foodRemove}
                      onClick={() => setConfirmRemoveIdx(i)}
                      aria-label={`Remove ${f.name}`}
                      title={`Remove ${f.name}`}
                    >
                      <VitalityIcon name="close" size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* fix a swap the scan got wrong: add whatever it missed */}
        {meal.foods.length > 0 && (
          addingFood ? (
            <div className={styles.addMissedPicker}>
              <FoodSearchPicker
                onPick={(candidate, grams) => {
                  onAddFood(candidate, grams)
                  setAddingFood(false)
                }}
                onCancel={() => setAddingFood(false)}
                searchMode={searchMode}
                onSearchMode={onSearchMode}
              />
            </div>
          ) : (
            <button className={styles.addMissed} onClick={() => setAddingFood(true)}>
              <VitalityIcon name="plus" size={14} /> Add a missed food
            </button>
          )
        )}

        {meal.clarifyingQuestions.length > 0 && (
          <div className={styles.checkSection}>
            <div className={styles.checkLabel}>
              <span className={styles.checkHi}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M9.5 9a2.5 2.5 0 1 1 3 2.45c-.8.2-1 .8-1 1.55" /><circle cx="12" cy="17" r=".7" fill="currentColor" stroke="none" /></svg>
              </span>
              <span>
                {openQuestions.length > 0
                  ? `${openQuestions.length} quick check${openQuestions.length === 1 ? '' : 's'}`
                  : 'All checked'}
              </span>
              {checkSwing > 0 && <span className={styles.checkSwing}>up to {round(checkSwing)} kcal</span>}
            </div>
            {meal.clarifyingQuestions.length > 1 && (
              <div className={styles.stepDots} aria-hidden="true">
                {meal.clarifyingQuestions.map((q) => (
                  <span
                    key={q.id}
                    className={`${styles.stepDot} ${q.answer ? styles.stepDotDone : ''} ${
                      activeQuestion && q.id === activeQuestion.id ? styles.stepDotOn : ''
                    }`}
                  />
                ))}
              </div>
            )}

            {activeQuestion && (
              <div key={activeQuestion.id} className={styles.stepQ}>
                <p className={styles.stepSubj}>{highlightLast(cleanQuestion(activeQuestion.question))}</p>
                {activeQuestion.estimated_kcal_swing > 0 && (
                  <p className={styles.stepHint}>
                    this one swings{' '}
                    <span className={styles.stepHintVal}>{round(activeQuestion.estimated_kcal_swing)} kcal</span>
                  </p>
                )}
                <div className={styles.stepOpts}>
                  {activeQuestion.options.map((o) => (
                    <button key={o.label} className={styles.stepOpt} onClick={() => onAnswer(activeQuestion.id, o.label)}>
                      <span className={styles.stepOptDot} />
                      {stripParen(o.label)}
                    </button>
                  ))}
                  <button
                    className={`${styles.stepOpt} ${styles.stepOptGhost}`}
                    onClick={() => setSomethingElseQid(activeQuestion.id)}
                  >
                    <span className={styles.stepOptDot} />
                    Something else
                  </button>
                </div>
                <button className={styles.stepSkip} onClick={() => onSkip(activeQuestion.id)}>
                  Not sure, skip
                </button>
                {somethingElseQid === activeQuestion.id && (
                  <div className={styles.pickerWrap}>
                    <FoodSearchPicker
                      initialQuery=""
                      searchMode={searchMode}
                      onSearchMode={onSearchMode}
                      onPick={(candidate, grams) => {
                        onResolveQuestion(activeQuestion.id, candidate, grams)
                        setSomethingElseQid(null)
                      }}
                      onCancel={() => setSomethingElseQid(null)}
                    />
                  </div>
                )}
              </div>
            )}

            {answeredQuestions.length > 0 && (
              <div className={styles.stepDone}>
                {answeredQuestions.map((q) => (
                  <div key={q.id} className={styles.qAnswered}>
                    <span className={styles.qAnsweredText}>{cleanQuestion(q.question)}</span>
                    {q.answer === SKIP_ANSWER ? (
                      <span className={styles.qSkippedLabel}>Skipped</span>
                    ) : (
                      <span className={styles.qAnsweredValue}>{stripParen(q.answer || '')}</span>
                    )}
                    <button className={styles.qChange} onClick={() => onChange(q.id)}>
                      Change
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {meal.unmatched.length > 0 && (
          <div className={styles.unmatchedList}>
            {meal.unmatched.map((u, idx) => (
              <div key={idx} className={styles.unmatchedItem}>
                {resolvingIdx === idx ? (
                  <div className={styles.pickerWrap}>
                    <FoodSearchPicker
                      initialQuery={u.name}
                      onPick={(candidate, grams) => {
                        onResolveUnmatched(idx, candidate, grams)
                        setResolvingIdx(null)
                      }}
                      onCancel={() => setResolvingIdx(null)}
                      searchMode={searchMode}
                      onSearchMode={onSearchMode}
                    />
                  </div>
                ) : (
                  <div className={styles.unmatchedRow}>
                    <button
                      className={styles.unmatchedBtn}
                      onClick={() => setResolvingIdx(idx)}
                    >
                      <span className={styles.unmatchedName}>{u.name}{u.grams > 0 ? ` · ${round(u.grams)}g` : ''}</span>
                      <span className={styles.unmatchedHint}>tap to find macros</span>
                    </button>
                    <button
                      className={styles.unmatchedSkip}
                      onClick={() => onDismissUnmatched(idx)}
                      aria-label={`Skip ${u.name}`}
                    >
                      skip
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {noteEditing ? (
          <input
            type="text"
            className={styles.noteInput}
            defaultValue={meal.notes ?? ''}
            maxLength={200}
            autoFocus
            placeholder="e.g. only ate the whites, post workout, split with a friend"
            onBlur={(e) => {
              if (escapeRef.current) { escapeRef.current = false; return }
              onNote(meal.id, e.target.value)
              setNoteEditing(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onNote(meal.id, (e.target as HTMLInputElement).value)
                setNoteEditing(false)
              } else if (e.key === 'Escape') {
                escapeRef.current = true
                setNoteEditing(false)
              }
            }}
          />
        ) : meal.notes ? (
          <button className={styles.noteBadge} onClick={() => setNoteEditing(true)}>
            {meal.notes}
          </button>
        ) : (
          <button className={styles.noteAdd} onClick={() => setNoteEditing(true)}>
            + add a note
          </button>
        )}

        <div className={styles.cardActions}>
          {onRedoScan && meal.source === 'photo' && meal.thumbnail && (
            <button
              className={`${styles.cardAction} ${styles.cardActionRedo} ${isRescanning ? styles.cardActionBusy : ''}`}
              onClick={onRedoScan}
              disabled={isRescanning}
              title="Re-scan this photo with our smartest model"
            >
              <VitalityIcon name="sparkles" size={14} />
              {isRescanning ? 'Looking again…' : 'Redo scan'}
            </button>
          )}
          <button className={`${styles.cardAction} ${styles.cardActionFav}`} onClick={onFavorite}>
            <VitalityIcon name="star" size={14} /> Favorite
          </button>
          <button className={`${styles.cardAction} ${styles.cardDelete}`} onClick={onDelete}>
            <VitalityIcon name="trash" size={14} /> Delete
          </button>
        </div>
        </div>
      </div>

      {lightbox && meal.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <div
          className={styles.lightbox}
          role="dialog"
          aria-label="Meal photo"
          onClick={() => setLightbox(false)}
        >
          <img src={meal.thumbnail} alt={shortTitle} className={styles.lightboxImg} />
          <button className={styles.lightboxClose} aria-label="Close" onClick={() => setLightbox(false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      )}
    </article>
  )
}

'use client'

import { useMemo, useState } from 'react'
import styles from './supplements.module.css'
import { SIGNAL_LABELS, recommend } from './signals'
import type { WhoopSnapshot } from './signals'
import InfoPopover from './InfoPopover'
import { WINDOWS } from './supplements'
import type { DbSupplement, Recommendation, Signal } from './types'

interface Props {
  age: number | null
  sex: 'M' | 'F' | null
  goal: 'recomp' | 'cut' | 'bulk' | 'maintain' | 'general_health' | null
  gymLevel: 'beginner' | 'intermediate' | 'advanced' | null
  caffeineMgPerDay: number
  hasStims: boolean
  hasNicotine: boolean
  hasAlcohol: boolean
  whoop?: WhoopSnapshot | null
  alreadyTakingIds: Set<string>
  onAdd: (s: DbSupplement) => void
}

const BUDGET_DEFAULT = 75 // US$ / month

/**
 * Amazon affiliate tag — set NEXT_PUBLIC_AMAZON_AFFILIATE_TAG in env to
 * earn commission on supplement purchases driven from these recommendations.
 * When unset, links still work, we just don't get the kickback.
 */
const AMAZON_TAG = process.env.NEXT_PUBLIC_AMAZON_AFFILIATE_TAG || ''

/**
 * Pick the best buy URL for a supplement: curated override if present,
 * otherwise a generated Amazon search. The brand string often contains
 * two suggestions joined by "or" — we use only the first half for the
 * search so results stay focused.
 */
function buyUrlFor(s: DbSupplement): string {
  if (s.buyUrl) return s.buyUrl
  const primaryBrand = (s.brand || '').split(/\s+or\s+/i)[0].trim()
  const query = `${primaryBrand} ${s.name}`.trim()
  const tagSuffix = AMAZON_TAG ? `&tag=${encodeURIComponent(AMAZON_TAG)}` : ''
  return `https://www.amazon.com/s?k=${encodeURIComponent(query)}${tagSuffix}`
}

/**
 * Personalized recommender. Pulls signals from the user's profile +
 * training level + water-module stimulants + current stack, scores
 * each supplement 1–10, and ranks the top picks.
 *
 * Two views:
 *   - Compact list of ranked picks, each with score chip, brand,
 *     monthly price, and "Add" button. (i) opens the full InfoPopover.
 *   - Budget summary at the bottom: total cost of the picks within
 *     budget, and a slider to adjust the budget.
 *
 * Honest disclaimer baked in. Brand picks are mid-range and well-
 * regarded but not endorsements; user should verify with their own
 * doc before starting anything new.
 */
interface TickerItem { tone: 'mild' | 'urgent'; text: string }

/**
 * Build the unified ticker items: live data (WHOOP, water) up front so the
 * eye lands on the numbers that move per session, then static profile
 * signals (training load, goal, sex/age) at the tail. Replaces the
 * separate "Based on [chip] [chip] [chip]" row — everything driving the
 * recommendations is in one place.
 */
function buildTickerItems(
  whoop: WhoopSnapshot | null | undefined,
  caffeine: number,
  hasStims: boolean,
  hasNicotine: boolean,
  hasAlcohol: boolean,
  signals: Signal[],
): TickerItem[] {
  const items: TickerItem[] = []

  if (whoop) {
    if (typeof whoop.recovery === 'number') {
      const urgent = whoop.recovery < 50
      const tier = whoop.recovery >= 67 ? 'recovered' : whoop.recovery >= 34 ? 'watch' : 'low'
      items.push({ tone: urgent ? 'urgent' : 'mild', text: `Recovery ${whoop.recovery}% · ${tier}` })
    }
    if (typeof whoop.hrv === 'number') {
      if (typeof whoop.hrvBaseline === 'number') {
        const delta = whoop.hrv - whoop.hrvBaseline
        const sign = delta > 0 ? '↑' : '↓'
        const abs = Math.abs(delta).toFixed(0)
        const urgent = delta <= -10
        items.push({ tone: urgent ? 'urgent' : 'mild', text: `HRV ${sign} ${abs}ms vs baseline` })
      } else {
        items.push({ tone: 'mild', text: `HRV ${Math.round(whoop.hrv)}ms` })
      }
    }
    if (typeof whoop.sleepHours === 'number') {
      const h = Math.floor(whoop.sleepHours)
      const m = Math.round((whoop.sleepHours - h) * 60)
      const urgent = whoop.sleepHours < 6.5
      items.push({ tone: urgent ? 'urgent' : 'mild', text: `Sleep ${h}h ${String(m).padStart(2, '0')}m last night` })
    }
    if (typeof whoop.sleepDeficitMin === 'number' && whoop.sleepDeficitMin > 0) {
      const urgent = whoop.sleepDeficitMin > 120
      const h = Math.floor(whoop.sleepDeficitMin / 60)
      const m = whoop.sleepDeficitMin % 60
      items.push({ tone: urgent ? 'urgent' : 'mild', text: `Sleep debt −${h}h ${String(m).padStart(2, '0')}m` })
    }
    if (typeof whoop.strain === 'number') {
      const avg = whoop.strainWeeklyAvg
      const urgent = typeof avg === 'number' && whoop.strain - avg > 2
      items.push({
        tone: urgent ? 'urgent' : 'mild',
        text: typeof avg === 'number'
          ? `Strain ${whoop.strain.toFixed(1)} · wk avg ${avg.toFixed(1)}`
          : `Strain ${whoop.strain.toFixed(1)}`,
      })
    }
  }

  if (caffeine > 0) {
    const urgent = caffeine > 400
    items.push({ tone: urgent ? 'urgent' : 'mild', text: `Caffeine ${caffeine}mg/day` })
  }
  if (hasStims)    items.push({ tone: 'mild', text: 'Stimulants logged · magnesium + L-theanine help' })
  if (hasNicotine) items.push({ tone: 'mild', text: 'Nicotine use · B-complex depletion likely' })
  if (hasAlcohol)  items.push({ tone: 'mild', text: 'Alcohol logged · zinc + B-complex help' })

  // Static profile signals — render last because they don't change session to
  // session and the eye should land on the numeric, time-sensitive items
  // first. We skip the per-source signals already represented as numbers
  // (caffeine, stims) and skip 'general-health-goal' default.
  const STATIC_SKIP: Signal[] = ['high-caffeine', 'very-high-caffeine', 'has-stims', 'has-nicotine', 'has-alcohol', 'poor-sleep', 'low-recovery', 'general-health-goal']
  signals
    .filter(s => !STATIC_SKIP.includes(s))
    .forEach(s => items.push({ tone: 'mild', text: SIGNAL_LABELS[s] }))

  return items
}

function RecTicker({ items }: { items: TickerItem[] }) {
  if (items.length < 2) return null
  // Double the array so the translateX(-50%) loop seams cleanly.
  const rolled = [...items, ...items]
  return (
    <div className={styles.recTicker} role="status" aria-label="Live inputs driving these picks">
      <div className={styles.recTickerEyebrow}>
        <span className={styles.recTickerPulse} aria-hidden />
        Vitality · live
      </div>
      <div className={styles.recTickerScroll}>
        <div className={styles.recTickerTrack}>
          {rolled.map((item, i) => (
            <span key={i} className={styles.recTickerItem} data-tone={item.tone}>
              {item.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function RecommendationsCard({
  age, sex, goal, gymLevel,
  caffeineMgPerDay, hasStims, hasNicotine, hasAlcohol,
  whoop,
  alreadyTakingIds, onAdd,
}: Props) {
  const [budget, setBudget] = useState(BUDGET_DEFAULT)
  // (i) popover state — one open at a time. Anchored inline below the
  // tapped row instead of floating, so the layout stays predictable.
  const [openInfoFor, setOpenInfoFor] = useState<string | null>(null)

  const { signals, recommendations } = useMemo(() => recommend({
    age, sex, goal, gymLevel,
    caffeineMgPerDay, hasStims, hasNicotine, hasAlcohol,
    whoop,
    alreadyTakingIds,
  }, { limit: 8 }), [
    age, sex, goal, gymLevel,
    caffeineMgPerDay, hasStims, hasNicotine, hasAlcohol,
    whoop,
    alreadyTakingIds,
  ])

  // Pack picks into the budget greedy-style by score (top picks first).
  // Picks that fit get marked "in budget"; the rest are shown but
  // visually muted with an "over budget" chip.
  const packed = useMemo(() => packToBudget(recommendations, budget), [recommendations, budget])

  const tickerItems = useMemo(
    () => buildTickerItems(whoop, caffeineMgPerDay, hasStims, hasNicotine, hasAlcohol, signals),
    [whoop, caffeineMgPerDay, hasStims, hasNicotine, hasAlcohol, signals],
  )

  if (recommendations.length === 0) {
    return (
      <section className={styles.recCard}>
        <Header tickerItems={tickerItems} />
        <p className={styles.recEmpty}>
          Nothing strongly indicated yet. Add more stack items and we’ll
          tune the recommendations as your profile fills in.
        </p>
      </section>
    )
  }

  const totalInBudget = packed.inBudget.reduce((sum, r) => sum + r.supplement.priceUsdMonthly, 0)
  const totalIfAll = recommendations.reduce((sum, r) => sum + r.supplement.priceUsdMonthly, 0)

  return (
    <section className={styles.recCard}>
      <Header tickerItems={tickerItems} />

      <ul className={styles.recList}>
        {packed.all.map(({ rec, fits }) => (
          <RecRow
            key={rec.supplement.id}
            rec={rec}
            fits={fits}
            isInfoOpen={openInfoFor === rec.supplement.id}
            onToggleInfo={() => setOpenInfoFor(prev => prev === rec.supplement.id ? null : rec.supplement.id)}
            onAdd={() => onAdd(rec.supplement)}
          />
        ))}
      </ul>

      <BudgetBar
        budget={budget}
        setBudget={setBudget}
        totalInBudget={totalInBudget}
        totalIfAll={totalIfAll}
        countInBudget={packed.inBudget.length}
        countTotal={recommendations.length}
      />

      <p className={styles.recDisclaimer}>
        Scores are based on the data you’ve given Vitality. Brand picks are
        well-regarded mid-range options, not endorsements. Check with your
        doctor before starting anything new. Some links are affiliate; we may
        earn a small commission at no cost to you.
      </p>
    </section>
  )
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

function Header({ tickerItems }: { tickerItems: TickerItem[] }) {
  return (
    <header className={styles.recHead}>
      <span className={styles.heroEyebrow}>
        <span className={styles.heroEyebrowMark}>·03</span>
        <span className={styles.heroEyebrowRule} />
        Recommended for you
      </span>

      {tickerItems.length >= 2 ? (
        <RecTicker items={tickerItems} />
      ) : (
        <p className={styles.recSignalsEmpty}>
          Connect more of your stack (workouts, caffeine, wearables) to
          unlock personalised picks.
        </p>
      )}
    </header>
  )
}

interface RecRowProps {
  rec: Recommendation
  fits: boolean
  isInfoOpen: boolean
  onToggleInfo: () => void
  onAdd: () => void
}

function RecRow({ rec, fits, isInfoOpen, onToggleInfo, onAdd }: RecRowProps) {
  const { supplement: s, score, reasons } = rec
  const win = WINDOWS.find(w => w.key === s.window)

  return (
    <li className={`${styles.recRow} ${!fits ? styles.recRowOver : ''}`}>
      <div className={styles.recRowMain}>
        <ScorePill score={score} />

        <div className={styles.recBody}>
          <div className={styles.recNameRow}>
            <span className={styles.recIcon} aria-hidden>{s.icon}</span>
            <span className={styles.recName}>{s.name}</span>
            <button
              type="button"
              className={styles.infoBtnInline}
              onClick={onToggleInfo}
              aria-label={`What does ${s.name} do?`}
              aria-pressed={isInfoOpen}
            >
              i
            </button>
          </div>
          <div className={styles.recMeta}>
            <span className={styles.recDose}>{s.dose}</span>
            <span className={styles.recMetaSep}>·</span>
            <span className={styles.recWindow}>
              {win?.icon} {win?.title.toLowerCase()}
            </span>
            <span className={styles.recMetaSep}>·</span>
            <a
              className={styles.recBrandLink}
              href={buyUrlFor(s)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Find ${s.brand.split(/\s+or\s+/i)[0]} ${s.name}`}
            >
              {s.brand}
              <span className={styles.recBrandIcon} aria-hidden>↗</span>
            </a>
          </div>
          {reasons.length > 0 && (
            <div className={styles.recWhy}>
              <span className={styles.recWhyLabel}>Why</span>
              {reasons.slice(0, 3).map(sig => (
                <span key={sig} className={styles.recWhyChip}>{SIGNAL_LABELS[sig]}</span>
              ))}
            </div>
          )}
        </div>

        <div className={styles.recRight}>
          <span className={styles.recPrice}>~${s.priceUsdMonthly}<span className={styles.recPriceUnit}>/mo</span></span>
          {!fits && <span className={styles.recOverChip}>over budget</span>}
          <button
            type="button"
            className={styles.recAddBtn}
            onClick={onAdd}
            title="Add to your orders in Finance. Moves to your stack once it arrives"
          >
            Order →
          </button>
        </div>
      </div>

      {isInfoOpen && (
        <div className={styles.recInfoSlot}>
          <InfoPopover
            supplement={s}
            onClose={() => onToggleInfo()}
            onAdd={() => { onAdd(); onToggleInfo() }}
          />
        </div>
      )}
    </li>
  )
}

function ScorePill({ score }: { score: number }) {
  const tier = score >= 8 ? 'high' : score >= 6 ? 'mid' : 'low'
  return (
    <div className={`${styles.scorePill} ${styles[`scorePill_${tier}`]}`} aria-label={`Score ${score} of 10`}>
      <span className={styles.scoreNum}>{score}</span>
      <span className={styles.scoreOutOf}>/10</span>
    </div>
  )
}

interface BudgetBarProps {
  budget: number
  setBudget: (n: number) => void
  totalInBudget: number
  totalIfAll: number
  countInBudget: number
  countTotal: number
}

function BudgetBar({ budget, setBudget, totalInBudget, totalIfAll, countInBudget, countTotal }: BudgetBarProps) {
  const ratio = budget > 0 ? Math.min(1, totalInBudget / budget) : 0

  return (
    <div className={styles.budgetWrap}>
      <div className={styles.budgetRow}>
        <label className={styles.budgetLabel} htmlFor="rec-budget">Budget</label>
        <input
          id="rec-budget"
          type="range"
          min={20}
          max={250}
          step={5}
          value={budget}
          onChange={e => setBudget(parseInt(e.target.value, 10) || 0)}
          className={styles.budgetSlider}
        />
        <span className={styles.budgetAmount}>${budget}/mo</span>
      </div>

      <div className={styles.budgetTrack} aria-hidden>
        <div
          className={styles.budgetTrackFill}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>

      <div className={styles.budgetSummary}>
        <span>
          <strong>${totalInBudget}</strong>/mo for top {countInBudget} of {countTotal} picks
        </span>
        {totalIfAll > totalInBudget && (
          <span className={styles.budgetSecondary}>
            ${totalIfAll}/mo to take all {countTotal}
          </span>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

interface PackedItem { rec: Recommendation; fits: boolean }
interface Packed { all: PackedItem[]; inBudget: Recommendation[] }

/**
 * Greedy pack — walk picks in rank order, marking each "fits" until
 * the running cost would blow the budget. After that, remaining picks
 * still render but with an "over budget" chip + dimmed style.
 */
function packToBudget(recs: Recommendation[], budget: number): Packed {
  let running = 0
  const inBudget: Recommendation[] = []
  const all: PackedItem[] = recs.map(rec => {
    const next = running + rec.supplement.priceUsdMonthly
    const fits = next <= budget
    if (fits) {
      running = next
      inBudget.push(rec)
    }
    return { rec, fits }
  })
  return { all, inBudget }
}

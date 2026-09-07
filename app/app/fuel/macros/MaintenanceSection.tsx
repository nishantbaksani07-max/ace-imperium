'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import VitalityIcon from '@/components/VitalityIcon'
import { getLocalDateKey } from '@/lib/dates'
import { computeTrendRate, type Checkin } from '@/lib/nutrition/adaptive'
import type { GoalBand, WeighIn, DailyKcal } from '@/lib/nutrition/adaptive'
import type { Units } from '@/lib/units'
import type { CheckinDecision } from './serialize'
import { decideCheckin, setAdaptiveEnabled } from './checkinActions'
import { updateAccountProfile } from '../water/actions'
import TrendCard from './TrendCard'
import HowItWorks from './HowItWorks'
import styles from '../fuelSections.module.css'

interface Props {
  initialCheckin: Checkin | null
  band: GoalBand
  adaptiveEnabled: boolean
  weekStart: string
  decision: CheckinDecision
  units: Units
  feelFirst: boolean
  weighIns: WeighIn[]
  dailyKcal: DailyKcal[]
  /** Gym/rest cycle context, so a nudge shows both day targets, not one number. */
  cycleEnabled: boolean
  trainingKcal: number | null
  restKcal: number | null
  /** Formula-based maintenance from setup, shown as the starting estimate while
   *  calibrating (so day 1 has a real number, not a blank wait). */
  startingMaintenanceKcal: number
  /** When the WeightLogger above already renders the ·03 Maintenance eyebrow,
   *  suppress this section's own so the block has a single shared header. */
  hideEyebrow?: boolean
}

const Eyebrow = (
  <div className={styles.eyebrow}>
    <span className={styles.eyebrowNum}>·03</span>
    <span className={styles.eyebrowLbl}>Maintenance</span>
    <span className={styles.eyebrowRule} />
  </div>
)

const Caret = ({ up = false }: { up?: boolean }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={up ? { transform: 'rotate(180deg)' } : undefined}>
    <path d="M6 9l6 6 6-6" />
  </svg>
)

// Glyphs for the "I can only see half your picture" nudge.
const ForkGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 3v6a2 2 0 0 0 4 0V3M8 9v12M16 3c-1.5 0-2.4 1.9-2.4 4.4 0 1.9.9 3.1 1.8 3.4V21" />
  </svg>
)
const ScaleGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 19a8 8 0 0 1 16 0z" /><path d="M12 11l3.5-3.5" />
  </svg>
)

export default function MaintenanceSection({
  initialCheckin,
  band,
  adaptiveEnabled: initialEnabled,
  weekStart,
  decision,
  units: initialUnits,
  feelFirst,
  weighIns,
  dailyKcal,
  cycleEnabled,
  trainingKcal,
  restKcal,
  startingMaintenanceKcal,
  hideEyebrow = false,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [units, setUnits] = useState<Units>(initialUnits)
  const [gear, setGear] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [decided, setDecided] = useState<CheckinDecision>(decision)
  const [gateDismissed, setGateDismissed] = useState(false)
  const [howOpen, setHowOpen] = useState(false)

  const smoothed = useMemo(() => computeTrendRate(weighIns).smoothed, [weighIns])

  const c = initialCheckin
  const isNudge = !!c && (c.status === 'too_fast' || c.status === 'too_slow') && decided === 'pending'
  const isCalibrating = !c || c.status === 'calibrating'
  const pendingDot = isNudge

  // ── tiny gear popover: master toggle + lb/kg ──
  function toggleEnabled() {
    const next = !enabled
    setEnabled(next)
    startTransition(async () => {
      await setAdaptiveEnabled(next)
      router.refresh()
    })
  }
  function pickUnits(u: Units) {
    setUnits(u)
    startTransition(async () => {
      await updateAccountProfile({ units: u })
      router.refresh()
    })
  }

  function decide(d: 'accepted' | 'dismissed' | 'grace') {
    setDecided(d)
    startTransition(async () => {
      await decideCheckin(weekStart, d)
      router.refresh()
    })
  }

  const Header = (
    <div className={styles.tileTop}>
      <span className={styles.tileIc}>
        <VitalityIcon name="scale" size={20} />
      </span>
      <span className={styles.tileLbl}>Maintenance</span>
      {pendingDot && <span className={styles.mDot} aria-label="new read" />}
      {isCalibrating && enabled && (
        <span className={styles.mLearn}>
          <span className={styles.mLearnDot} />
          learning
        </span>
      )}
      <span className={styles.mHeadActions}>
        <button className={styles.info} onClick={() => setHowOpen(true)} aria-label="How it works">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
        </button>
        <button className={styles.gear} onClick={() => setGear((v) => !v)} aria-label="Maintenance settings">
          <VitalityIcon name="gear" size={16} />
        </button>
      </span>
      {howOpen && <HowItWorks onClose={() => setHowOpen(false)} />}
      {gear && (
        <div className={styles.mPop} role="dialog">
          <div className={styles.mPopRow}>
            <span className={styles.mPopLbl}>Maintenance coach</span>
            <button className={`${styles.mSwitch} ${enabled ? styles.mSwitchOn : ''}`} onClick={toggleEnabled} aria-label="Toggle maintenance" />
          </div>
          <div className={styles.mPopRow}>
            <span className={styles.mPopLbl}>Weight units</span>
            <span className={styles.mSeg}>
              <button className={units === 'imperial' ? styles.mSegOn : ''} onClick={() => pickUnits('imperial')}>LB</button>
              <button className={units === 'metric' ? styles.mSegOn : ''} onClick={() => pickUnits('metric')}>KG</button>
            </span>
          </div>
        </div>
      )}
    </div>
  )

  // The coach sharpens off morning weigh-ins, so remind the user to log one
  // right here. Pulses with a + when today's weight isn't in yet; settles to a
  // calm check once it is. Either way it scrolls up to (and opens) the logger.
  const loggedWeightToday = weighIns.some((w) => w.date === getLocalDateKey())
  function goLogWeight() {
    document.getElementById('weight-logger')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (!loggedWeightToday) window.dispatchEvent(new Event('vitality:log-weight'))
  }
  // The coach also needs a few days of food. Scroll up to the macro logger
  // (Snap a meal / Add food) so a missing-food nudge has somewhere to land.
  function goLogMeal() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const logWeightCta = (
    <button
      type="button"
      className={`${styles.mWeighCta} ${loggedWeightToday ? styles.mWeighDone : styles.mWeighPulse}`}
      onClick={goLogWeight}
    >
      <span className={styles.mWeighIc} aria-hidden>
        {loggedWeightToday ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        )}
      </span>
      <span className={styles.mWeighLbl}>{loggedWeightToday ? "Today's weight is in" : "Log today's weight"}</span>
      <span className={styles.mWeighArrow} aria-hidden>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
      </span>
    </button>
  )

  // ── numbers-off gate (feel_first, not opted in) ──
  if (feelFirst && !enabled) {
    if (gateDismissed) return null
    return (
      <section className={styles.section}>
        {!hideEyebrow && Eyebrow}
        <div className={styles.card}>
          <div className={styles.mGate}>
            <span className={styles.mGateGlyph}>
              <VitalityIcon name="scale" size={22} />
            </span>
            <span className={styles.mGateTitle}>Want your plan to adjust itself?</span>
            <p className={styles.mGateText}>
              You picked the no-numbers way, and that is perfectly fine. If you would like Vitality to quietly learn your real
              maintenance and gently nudge your calories, turn on macro counting whenever you are ready.
            </p>
            <button className={styles.mPrimary} onClick={toggleEnabled}>Turn on macro counting</button>
            <button className={styles.mGrace} onClick={() => setGateDismissed(true)}>Not now</button>
          </div>
        </div>
      </section>
    )
  }

  // ── master toggle off ──
  if (!enabled) {
    return (
      <section className={styles.section}>
        {!hideEyebrow && Eyebrow}
        <div className={styles.card}>
          <div className={styles.mOff}>
            <span className={styles.mOffText}>Maintenance coach is off.</span>
            <button className={styles.mTurnOn} onClick={toggleEnabled}>Turn on</button>
          </div>
        </div>
      </section>
    )
  }

  const trend = (
    <TrendCard
      smoothed={smoothed}
      dailyKcal={dailyKcal}
      band={band}
      units={units}
      maintenanceKcal={c?.maintenanceKcal ?? null}
      weeklyRateKg={c?.trendRateKgPerWeek ?? null}
    />
  )

  // ── "just a number" pieces, shared by the calibrating + calm cards ──
  // The card leads with one number: what Vitality currently thinks your real
  // maintenance is. A small Stocks-style delta shows how far that has moved from
  // your setup estimate (mint up, amber down, never red — a falling number is
  // your body, not a failure). The graph is tucked behind a button and only
  // offered once there are enough weigh-ins to draw an honest line.
  const baseKcal = Math.round(startingMaintenanceKcal)
  const realKcal = c?.maintenanceKcal ?? null
  const displayKcal = realKcal ?? baseKcal
  const deltaPct = realKcal != null && baseKcal > 0 ? ((realKcal - baseKcal) / baseKcal) * 100 : null
  const showDelta = deltaPct != null && Math.abs(deltaPct) >= 0.5
  const enoughForGraph = smoothed.length >= 14

  const DeltaPill = showDelta ? (
    <span className={`${styles.mDeltaPill} ${deltaPct! < 0 ? styles.mDeltaEase : ''}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {deltaPct! >= 0 ? <path d="M12 19V5M6 11l6-6 6 6" /> : <path d="M12 5v14M6 13l6 6 6-6" />}
      </svg>
      <span className={styles.mDeltaPct}>{deltaPct! >= 0 ? '+' : ''}{deltaPct!.toFixed(1)}%</span>
      <span className={styles.mDeltaSince}>since setup</span>
    </span>
  ) : null

  const GraphReveal = enoughForGraph ? (
    <>
      <button className={styles.mGraphBtn} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
        {expanded ? 'Hide graph' : 'View graph'}
        <Caret up={expanded} />
      </button>
      {expanded && trend}
    </>
  ) : null

  // The hero number, on a soft mint aurora (amber when it has eased down). One
  // serif figure, big enough to be the whole point of the card.
  const NumberBlock = (
    <div className={styles.mHero}>
      <span className={`${styles.mGlow} ${showDelta && deltaPct! < 0 ? styles.mGlowDown : ''}`} aria-hidden />
      <div className={styles.mCount}>
        <span className={styles.mCountNum}>
          {realKcal == null && <span className={styles.mCountTilde}>~</span>}
          {displayKcal.toLocaleString()}
        </span>
        <span className={styles.countUnit}>kcal / day</span>
      </div>
    </div>
  )

  // ── calibrating: useful from day 1 (real starting number + zone filling) ──
  if (isCalibrating) {
    const count = weighIns.length
    const mealDays = dailyKcal.filter((d) => d.kcal > 0).length
    // One stream going, the other essentially empty → say which half to log
    // next, instead of sitting quietly in "calibrating" with no explanation.
    const missingHalf: 'food' | 'weight' | null =
      count >= 2 && mealDays <= 1 ? 'food' : mealDays >= 2 && count <= 1 ? 'weight' : null
    return (
      <section className={styles.section}>
        {!hideEyebrow && Eyebrow}
        <div className={styles.card}>
          {Header}
          {logWeightCta}
          <div className={styles.mEstLbl}>{realKcal != null ? 'Your real maintenance' : 'Your maintenance'}</div>
          {NumberBlock}
          {DeltaPill}
          {missingHalf ? (
            <div className={styles.mHalf}>
              <span className={styles.mHalfIc}>{missingHalf === 'food' ? <ForkGlyph /> : <ScaleGlyph />}</span>
              <div className={styles.mHalfTxt}>
                <b>
                  {missingHalf === 'food'
                    ? "I can see your weight. Now log a few meals."
                    : "I can see your meals. Now weigh in a few mornings."}
                </b>
                <span>
                  {missingHalf === 'food'
                    ? 'With a few days of food, I can find your real maintenance calories. Right now I only have half the picture.'
                    : 'Your weight trend is the other half I need. A few mornings on the scale and your real number appears.'}
                </span>
              </div>
              <button className={styles.mHalfCta} onClick={missingHalf === 'food' ? goLogMeal : goLogWeight}>
                {missingHalf === 'food' ? 'Log a meal' : 'Weigh in'}
              </button>
            </div>
          ) : (
            <p className={styles.mBody}>
              {count <= 1 ? (
                <>
                  My first read of you, from your setup. <b>I am already learning you.</b> Weigh in each morning and this
                  number quietly sharpens into your real one.
                </>
              ) : realKcal != null ? (
                <>
                  Turns out your body runs its own way. <b>This is your real number</b>, and I keep it honest as you go.
                </>
              ) : (
                <>
                  Your real model is forming, and <b>your number is settling in.</b>
                </>
              )}
            </p>
          )}
          {GraphReveal}
        </div>
      </section>
    )
  }

  // ── nudge week — "see your lane": the chart leads, advice underneath ──
  if (isNudge && c) {
    const tooFast = c.status === 'too_fast'
    const from = c.suggestedKcal != null && c.deltaKcal != null ? c.suggestedKcal - c.deltaKcal : null
    const trendHero = (
      <TrendCard
        smoothed={smoothed}
        dailyKcal={dailyKcal}
        band={band}
        units={units}
        maintenanceKcal={c.maintenanceKcal}
        weeklyRateKg={c.trendRateKgPerWeek}
        variant="hero"
      />
    )
    const inline =
      c.deltaKcal != null && cycleEnabled && trainingKcal != null && restKcal != null ? (
        <div className={styles.mInline}>
          <span>
            Gym day <b>{Math.round(trainingKcal).toLocaleString()} → {Math.round(trainingKcal + c.deltaKcal).toLocaleString()}</b>
          </span>
          <span>
            Rest day <b>{Math.round(restKcal).toLocaleString()} → {Math.round(restKcal + c.deltaKcal).toLocaleString()}</b>
          </span>
        </div>
      ) : from != null && c.suggestedKcal != null ? (
        <div className={styles.mInline}>
          <span>
            Daily target <b>{from.toLocaleString()} → {c.suggestedKcal.toLocaleString()}</b>
          </span>
        </div>
      ) : null

    return (
      <section className={styles.section}>
        {!hideEyebrow && Eyebrow}
        <div className={styles.card}>
          {Header}
          {logWeightCta}
          {trendHero}
          <div className={styles.mRead}>
            <div className={styles.mTitle}>
              {tooFast ? <>A little <em>quick</em> this week.</> : <>Things have <em>settled.</em></>}
            </div>
            <p className={styles.mBody}>
              {tooFast
                ? 'Your line is dipping below your lane, so let us ease up just a touch.'
                : 'Your line has flattened just shy of your lane, so let us give it a gentle push.'}
            </p>
            {inline}
            <div className={styles.mBtns}>
              <button className={styles.mPrimary} onClick={() => decide('accepted')}>Yes, update my targets</button>
              <button className={styles.mGhost} onClick={() => decide('dismissed')}>Keep current</button>
              <button className={styles.mGrace} onClick={() => decide('grace')}>Give me grace this week</button>
            </div>
          </div>
        </div>
      </section>
    )
  }

  // ── calm week: the number leads, one calm line, graph tucked behind a button ──
  const calmLine = (() => {
    if (decided === 'grace') return <>Grace this week. <b>Back next week</b>, no harm done.</>
    if (decided === 'accepted') return <>Updated. <b>Holding your new lane.</b></>
    if (decided === 'dismissed') return <>Kept your current plan. <b>Holding steady.</b></>
    return (
      <>
        You&apos;re <b>holding your lane.</b> I keep this number honest as you go.
      </>
    )
  })()

  return (
    <section className={styles.section}>
      {!hideEyebrow && Eyebrow}
      <div className={styles.card}>
        {Header}
        {logWeightCta}
        <div className={styles.mEstLbl}>Your real maintenance</div>
        {NumberBlock}
        {DeltaPill}
        <p className={styles.mBody}>{calmLine}</p>
        {GraphReveal}
      </div>
    </section>
  )
}

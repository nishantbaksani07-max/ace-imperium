'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

import styles from './pricing.module.css'

/**
 * InputSources — the Vitality AI avatar (the gem) watching a live screen
 * that auto-cycles through the real app modules: workout logger, water,
 * fuel, sleep, weight, supplements, subscriptions, holdings, goals,
 * business. It shows, animated, that the gem reads your whole life — the
 * input that flows into Claude.
 *
 * Screens are representative mocks (swap for real screenshots later).
 */

const HeroCrystal = dynamic(() => import('@/components/HeroCrystal'), {
  ssr: false,
})

type Row = { l: string; v: string; tone?: 'mint' | 'amber' | 'iris' }
// `img` is an optional real screenshot (path under /public). When set, the
// avatar shows the real Vitality screen instead of the mock. Drop a file in
// public/pricing-shots/ and point img at it — e.g. '/pricing-shots/water.png'.
type Screen = { title: string; tag: string; rows: Row[]; note: string; img?: string }
type Module = { key: string; name: string; screen: Screen }

const MODULES: Module[] = [
  {
    key: 'workouts',
    name: 'Workouts',
    screen: {
      title: 'Bench press',
      tag: 'Push day · week 3',
      rows: [
        { l: 'Set 1', v: '80 kg × 5', tone: 'mint' },
        { l: 'Set 2', v: '80 kg × 5', tone: 'mint' },
        { l: 'Set 3', v: '82.5 kg × 4  ★', tone: 'mint' },
      ],
      note: '1RM est · 95 kg',
    },
  },
  {
    key: 'water',
    name: 'Water',
    screen: {
      title: 'Today',
      tag: 'Hydration',
      rows: [
        { l: 'Glasses', v: '5 of 8' },
        { l: 'Volume', v: '1.25 L' },
        { l: 'Goal', v: '2.0 L', tone: 'amber' },
      ],
      note: 'Tap + to log a glass',
    },
  },
  {
    key: 'macros',
    name: 'Fuel',
    screen: {
      title: 'Today’s fuel',
      tag: 'Nutrition',
      rows: [
        { l: 'Calories', v: '1,840 / 2,200' },
        { l: 'Protein', v: '138 / 180 g', tone: 'amber' },
        { l: 'Carbs · Fat', v: 'on target', tone: 'mint' },
      ],
      note: 'One more protein meal closes it',
    },
  },
  {
    key: 'sleep',
    name: 'Sleep',
    screen: {
      title: 'Last night',
      tag: 'From WHOOP',
      rows: [
        { l: 'Time asleep', v: '7h 12m' },
        { l: 'Recovery', v: '72%', tone: 'mint' },
        { l: 'HRV', v: '68 ms' },
      ],
      note: 'Recommended bed · 10:40pm',
    },
  },
  {
    key: 'weight',
    name: 'Weight',
    screen: {
      title: 'Weight trend',
      tag: '7-day average',
      rows: [
        { l: 'Today', v: '81.4 kg' },
        { l: '7-day avg', v: '81.6 kg' },
        { l: 'Rate', v: '−0.3 kg / wk', tone: 'mint' },
      ],
      note: 'On track for your goal',
    },
  },
  {
    key: 'supplements',
    name: 'Supplements',
    screen: {
      title: 'Your stack',
      tag: '2 of 3 taken',
      rows: [
        { l: 'Creatine', v: 'taken', tone: 'mint' },
        { l: 'Vitamin D', v: 'taken', tone: 'mint' },
        { l: 'Magnesium', v: 'running low', tone: 'amber' },
      ],
      note: 'Tick them off as you go',
    },
  },
  {
    key: 'subscriptions',
    name: 'Subscriptions',
    screen: {
      title: 'Subscriptions',
      tag: 'Renewals tracked',
      rows: [
        { l: 'CapCut', v: 'CHF 9.99 · Thu', tone: 'amber' },
        { l: 'Spotify', v: 'CHF 12 · 14th' },
        { l: 'Monthly burn', v: 'CHF 95 / mo' },
      ],
      note: 'Heads-up before each bill',
    },
  },
  {
    key: 'holdings',
    name: 'Holdings',
    screen: {
      title: 'Portfolio',
      tag: 'Live prices',
      rows: [
        { l: 'DIS', v: '100 sh · $1,890' },
        { l: 'MO', v: '50 sh · $2,420' },
        { l: 'BTC', v: '0.2 · live', tone: 'mint' },
      ],
      note: 'Net worth, kept current',
    },
  },
  {
    key: 'goals',
    name: 'Goals',
    screen: {
      title: 'Your goals',
      tag: '127 days of data',
      rows: [
        { l: 'Get lean', v: '▾ 8% drifting', tone: 'amber' },
        { l: 'Launch business', v: '▴ 12% ahead', tone: 'mint' },
        { l: 'Stop feeling behind', v: '▴ 5% rising', tone: 'mint' },
      ],
      note: 'Each tied to your real stats',
    },
  },
  {
    key: 'business',
    name: 'Business',
    screen: {
      title: 'This week',
      tag: 'Stripe · YouTube · Patreon',
      rows: [
        { l: 'Stripe MRR', v: '$4.2k  ▴', tone: 'mint' },
        { l: 'YouTube', v: '+1.2k subs', tone: 'mint' },
        { l: 'Patreon', v: '312 patrons' },
      ],
      note: 'Pulled from your connectors',
    },
  },
]

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// One mini app screen — a real screenshot when provided, else the mock.
function AppScreen({ screen }: { screen: Screen }) {
  if (screen.img) {
    return (
      <div className={styles.appScreen}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.appShot} src={screen.img} alt="" />
      </div>
    )
  }
  return (
    <div className={styles.appScreen}>
      <div className={styles.appScreenHead}>
        <span className={styles.appScreenTitle}>{screen.title}</span>
        <span className={styles.appScreenTag}>{screen.tag}</span>
      </div>
      <div className={styles.appScreenRows}>
        {screen.rows.map((r, i) => (
          <div key={i} className={styles.appRow}>
            <span className={styles.appRowLabel}>{r.l}</span>
            <span
              className={`${styles.appRowVal} ${
                r.tone ? styles[`tone_${r.tone}`] : ''
              }`}
            >
              {r.v}
            </span>
          </div>
        ))}
      </div>
      <div className={styles.appScreenNote}>{screen.note}</div>
    </div>
  )
}

export default function InputSources() {
  const [cycle, setCycle] = useState(0)

  // Auto-cycle the avatar's live screen through every module.
  useEffect(() => {
    if (prefersReduced()) return
    const id = setInterval(
      () => setCycle((c) => (c + 1) % MODULES.length),
      2400,
    )
    return () => clearInterval(id)
  }, [])

  const live = MODULES[cycle]

  return (
    <div className={styles.sources}>
      <div className={styles.aiShowcase}>
        <div className={styles.aiGem} aria-hidden>
          <HeroCrystal shape="dodecahedron" mode="character" />
        </div>
        <div className={styles.aiScreenWrap}>
          <div key={cycle} className={styles.aiScreen}>
            <AppScreen screen={live.screen} />
          </div>
          <div className={styles.aiScreenLabel}>
            <span className={styles.aiScreenDot} aria-hidden /> reading your{' '}
            {live.name.toLowerCase()}
          </div>
        </div>
      </div>
    </div>
  )
}

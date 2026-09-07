'use client'

import SectionGem from '@/components/SectionGem'
import styles from './vitals.module.css'

/**
 * Vitals page — visual prototype (sample data) built from the real Vitality
 * design system. Public preview route so it renders without auth; once the
 * look is locked we wire it to the real wearable_data + move it into place.
 */

const recovery = 68
const RING_C = 2 * Math.PI * 44

const metrics = [
  { name: 'Sleep', val: '81', unit: '%', tag: 'ok', reason: '7h12m, efficiency strong. Just short on deep.' },
  { name: 'HRV', val: '88', unit: 'ms', tag: 'ok', reason: 'Above baseline. Nervous system ready to push.' },
  { name: 'Resting HR', val: '52', unit: 'bpm', tag: 'ok', reason: 'Trending down. Aerobic base improving.' },
  { name: 'Strain', val: '11.2', unit: '', tag: 'ok', reason: 'In your sweet spot vs weekly load.' },
  { name: 'Deep sleep', val: '1.0', unit: 'h', tag: 'watch', reason: 'Vs 1.5h norm. The strength window.' },
  { name: 'Resp rate', val: '14.5', unit: 'br', tag: 'ok', reason: 'Steady. No illness signal today.' },
] as const

const week = [
  { day: 'Mon', score: 61, watch: true },
  { day: 'Tue', score: 70, watch: false },
  { day: 'Wed', score: 66, watch: false },
  { day: 'Thu', score: 74, watch: false },
  { day: 'Fri', score: 59, watch: true },
  { day: 'Sat', score: 72, watch: false },
  { day: 'Sun', score: 68, watch: false },
]

export default function VitalsPreview() {
  return (
    <main className={`${styles.page} grain-overlay`}>
      <div className={styles.atmosphere} aria-hidden />
      <SectionGem glyph="PULSE" className={styles.heroGem} />

      <div className={styles.shell}>
        {/* header */}
        <header className={styles.header}>
          <div className={styles.topRow}>
            <a href="/app" className={styles.back}>← Vitality</a>
            <button className={styles.adjustBtn}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></svg>
              Reconnect
            </button>
          </div>
          <div className={styles.headline}>
            <div className={styles.eyebrowTop}>Vitals · WHOOP</div>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>Today&rsquo;s reading</h1>
              <span className={styles.statusPill}>Recovered</span>
            </div>
            <div className={styles.subRow}>
              <span className={styles.date}>Sun Jun 7 · WHOOP synced 12m ago</span>
            </div>
          </div>
        </header>

        {/* ·01 Today */}
        <section className={styles.section}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowNum}>·01</span>
            <span className={styles.eyebrowLbl}>Today</span>
            <span className={styles.eyebrowRule} />
          </div>
          <div className={styles.heroCard}>
            <div className={styles.ring}>
              <svg width="132" height="132">
                <circle cx="66" cy="66" r="44" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="9" />
                <circle cx="66" cy="66" r="44" fill="none" stroke="var(--mint)" strokeWidth="9" strokeLinecap="round"
                  strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - recovery / 100)} />
              </svg>
              <div className={styles.ringInner}>
                <span className={styles.ringVal}>{recovery}</span>
                <span className={styles.ringLbl}>Recovery</span>
              </div>
            </div>
            <div className={styles.heroBody}>
              <h2 className={styles.heroLine}>Your deep sleep ran short last night.</h2>
              <p className={styles.heroP}>1h00m of deep sleep, under your 1h30m average. Deep sleep is when your body locks in strength. It is the one lever worth pulling tonight.</p>
              <span className={styles.reasonChip}>
                <span className={styles.reasonDot} />
                <span className={styles.reasonTxt}>Why this matters for <b>your bench PR goal</b></span>
              </span>
              <div className={styles.actions}>
                <div className={styles.actionRow}><span className={styles.actionArrow}>→</span> Lights out 30 minutes earlier tonight.</div>
                <div className={styles.actionRow}><span className={styles.actionArrow}>→</span> Recovery is still green, so today&rsquo;s session is a go.</div>
              </div>
            </div>
          </div>
        </section>

        {/* ·02 Vitality Score */}
        <section className={styles.section}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowNum}>·02</span>
            <span className={styles.eyebrowLbl}>Vitality Score</span>
            <span className={styles.eyebrowRule} />
          </div>
          <div className={styles.scoreCard}>
            <div className={styles.scoreTop}>
              <div className={styles.scoreLeft}>
                <div className={styles.bigScore}>74<span>/100</span></div>
                <div className={styles.scoreTier}>
                  <div className={styles.tierName}>Solid, and climbing</div>
                  <div className={styles.tierDelta}>↑ 6 this week</div>
                </div>
              </div>
              <div className={styles.toggle}>
                <button className={styles.on}>14D</button>
                <button>30D</button>
                <button>90D</button>
              </div>
            </div>
            <div className={styles.chart}>
              <svg viewBox="0 0 680 130" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="vtrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6EE7B7" stopOpacity="0.26" />
                    <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0,96 C70,92 95,100 135,90 C185,78 215,84 270,64 C330,46 360,62 410,50 C470,36 510,44 570,26 C615,14 645,16 680,8 L680,130 L0,130 Z" fill="url(#vtrend)" />
                <path d="M0,96 C70,92 95,100 135,90 C185,78 215,84 270,64 C330,46 360,62 410,50 C470,36 510,44 570,26 C615,14 645,16 680,8" fill="none" stroke="#6EE7B7" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="680" cy="8" r="4.2" fill="#6EE7B7" />
              </svg>
            </div>
            <div className={styles.axis}><span>14 days ago</span><span>last week</span><span>today</span></div>
          </div>
        </section>

        {/* ·03 Today's numbers */}
        <section className={styles.section}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowNum}>·03</span>
            <span className={styles.eyebrowLbl}>Today&rsquo;s numbers</span>
            <span className={styles.eyebrowRule} />
          </div>
          <div className={styles.numsGrid}>
            {metrics.map((m) => (
              <div key={m.name} className={styles.metric}>
                <div className={styles.metricTop}>
                  <span className={styles.metricName}>{m.name}</span>
                  <span className={`${styles.metricTag} ${m.tag === 'watch' ? styles.tagWatch : styles.tagOk}`}>{m.tag === 'watch' ? 'Low' : 'Good'}</span>
                </div>
                <div className={styles.metricVal}>{m.val}{m.unit && <small>{m.unit}</small>}</div>
                <div className={styles.metricReason}>{m.reason}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ·04 Last 7 days */}
        <section className={styles.section}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowNum}>·04</span>
            <span className={styles.eyebrowLbl}>Last 7 days</span>
            <span className={styles.eyebrowRule} />
          </div>
          <div className={styles.stripCard}>
            <div className={styles.strip}>
              {week.map((d) => (
                <div key={d.day} className={styles.stripCol}>
                  <div className={styles.stripBarWrap}>
                    <div className={`${styles.stripBar} ${d.watch ? styles.stripBarWatch : ''}`} style={{ height: `${d.score}%` }} />
                  </div>
                  <span className={styles.stripScore}>{d.score}</span>
                  <span className={styles.stripDay}>{d.day}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

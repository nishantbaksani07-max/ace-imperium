import styles from './pricing.module.css'

/**
 * VeeNotice — the in-app "Vee notice" exactly as it appears in Vitality,
 * shown inside a laptop/browser frame on the pricing page. This is the
 * INPUT side of the story: the app holds your goals + history + live stats
 * and surfaces the one move, then hands the deep version to Claude
 * ("talk deeper in Claude"). Presentational only; copy/numbers are samples.
 *
 * Mirrors design from public/vee-card-library.html — iris = the AI layer,
 * mint = your data / wins, amber = heads-up.
 */

// Tiny goal sparkline. `dir` picks a falling (amber) or rising (mint) trace.
function Spark({ tone }: { tone: 'amber' | 'mint' }) {
  const points =
    tone === 'amber' ? '0,5 18,6 36,9 54,11 72,15' : '0,15 18,12 36,11 54,7 72,5'
  const color = tone === 'amber' ? '#f59e0b' : '#6ee7b7'
  const end = points.split(' ').pop()!.split(',')
  return (
    <svg className={styles.vnSpark} viewBox="0 0 72 20" fill="none" aria-hidden>
      <polyline
        points={points}
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={end[0]} cy={end[1]} r="2.1" fill={color} />
    </svg>
  )
}

export default function VeeNotice() {
  return (
    <div className={styles.laptop} aria-hidden>
      <div className={styles.laptopBar}>
        <span className={styles.laptopDots}>
          <span />
          <span />
          <span />
        </span>
        <span className={styles.laptopUrl}>vitality.app/today</span>
      </div>

      <div className={styles.laptopScreen}>
        <div className={styles.vnEyebrow}>
          <span className={styles.vnEyebrowDot} /> Vitality · Vee — this afternoon
        </div>
        <h3 className={styles.vnTitle}>Howdy, Alex.</h3>
        <p className={styles.vnIntro}>
          the one thing that falls out when something holds{' '}
          <b>your goals, your history, and your live stats</b> at once, and
          actually <span className={styles.vnIris}>thinks about you</span>.
        </p>

        {/* Live goals card */}
        <div className={styles.vnCard}>
          <div className={styles.vnCardHead}>
            Your goals, live · <b>127 days</b> of data
          </div>

          <div className={styles.vnGoal}>
            <span className={styles.vnGoalName}>
              get lean
              <span className={styles.vnGoalSub}>12% body fat</span>
            </span>
            <Spark tone="amber" />
            <span className={`${styles.vnDelta} ${styles.vnDown}`}>
              ▾ 8%<span>drifting</span>
            </span>
          </div>

          <div className={styles.vnGoal}>
            <span className={styles.vnGoalName}>
              launch the business
              <span className={styles.vnGoalSub}>by fall</span>
            </span>
            <Spark tone="mint" />
            <span className={`${styles.vnDelta} ${styles.vnUp}`}>
              ▴ 12%<span>ahead</span>
            </span>
          </div>

          <div className={styles.vnGoal}>
            <span className={styles.vnGoalName}>
              stop feeling behind
              <span className={styles.vnGoalSub}>feel on top of it</span>
            </span>
            <Spark tone="mint" />
            <span className={`${styles.vnDelta} ${styles.vnUp}`}>
              ▴ 5%<span>rising</span>
            </span>
          </div>

          <div className={styles.vnChips}>
            <span className={styles.vnChip}>train 5×/wk</span>
            <span className={styles.vnChip}>sleep 5.6h work nights</span>
            <span className={styles.vnChip}>protein often short</span>
            <span className={styles.vnChip}>runway ~2 mo</span>
          </div>
        </div>

        {/* What Vitality noticed — the iris insight card */}
        <div className={styles.vnNotice}>
          <div className={styles.vnNoticeTop}>
            <span className={styles.vnVmark}>V</span>
            <span className={styles.vnNoticeTag}>Vitality noticed</span>
            <span className={styles.vnNoticeSrc}>goals + sleep + fuel · 21d</span>
          </div>
          <p className={styles.vnNoticeBody}>
            you want to <span className={styles.vnIris}>get lean</span> and{' '}
            <span className={styles.vnIris}>launch by fall</span>. your{' '}
            <span className={styles.vnAmber}>1am work nights</span> quietly block
            both — they wreck recovery so you skip the gym, and drive the late
            snacking holding your body fat. one move fixes both:{' '}
            <span className={styles.vnMint}>a hard stop at 11.</span>
          </p>
          <div className={styles.vnActs}>
            <span className={styles.vnActIris}>✦ talk deeper in Claude</span>
            <span className={styles.vnActAmber}>set an 11pm wind-down</span>
          </div>
        </div>
      </div>
    </div>
  )
}

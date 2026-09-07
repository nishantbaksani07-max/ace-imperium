'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SectionGem from '@/components/SectionGem'
import { goalCopy } from '@/lib/vitals/goalCopy'
import { evaluateGoalProgress } from '@/lib/vitals/goals'
import { markGoalAchieved } from '@/app/app/vitals/goalActions'
import type { VitalsGoal } from '@/lib/vitals/goals'
import type { WearableRow } from '@/app/app/vitals/VitalsDashboard'
import styles from './goalCard.module.css'

function fmt(n: number | null, dp = 0): string {
  if (n == null) return '—'
  return dp ? n.toFixed(dp) : Math.round(n).toString()
}

export default function GoalCard({ goal, week }: { goal: VitalsGoal; week: WearableRow[] }) {
  const router = useRouter()
  const copy = goalCopy(goal)
  const progress = evaluateGoalProgress(goal, week)
  const [pending, setPending] = useState(false)

  async function handleNextGoal() {
    setPending(true)
    try {
      await markGoalAchieved()
    } catch {
      // best-effort; server guards idempotency
    }
    router.push('/app/vitals/quiz')
  }

  const pctInt = Math.round((progress.pct ?? 0) * 100)

  // ── Provisional / not ready — no hard numbers, just warmth ──
  if (goal.isProvisional || !progress.ready) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.dot} aria-hidden />
          <span className={styles.cardLabel}>your goal</span>
        </div>
        <div className={styles.softState}>
          <p className={styles.softTitle}>
            getting to know your normal {copy.metricLabel}. give it a few more days and your goal will sharpen.
          </p>
          <div className={styles.indeterminateBar} aria-hidden />
        </div>
      </div>
    )
  }

  // ── Achievement state ────────────────────────────────────────
  if (progress.achieved) {
    return (
      <div className={`${styles.card} ${styles.cardActive}`}>
        <div className={styles.cardHeader}>
          <span className={styles.dot} aria-hidden />
          <span className={styles.cardLabel}>goal reached</span>
        </div>
        <div className={styles.achieved}>
          <div className={styles.achievedGem}>
            <SectionGem glyph="PULSE" size={240} position="inline" complete staticPose />
          </div>
          <h3 className={styles.achievedTitle}>
            you reached your {copy.metricLabel} goal
          </h3>
          <p className={styles.achievedSub}>
            that is a real change, not a fluke. ready to set a new one?
          </p>
          <button
            className={styles.achievedBtn}
            onClick={handleNextGoal}
            disabled={pending}
          >
            {pending ? 'starting...' : 'start your next goal'}
          </button>
        </div>
      </div>
    )
  }

  // ── Progress state ───────────────────────────────────────────
  const baseline = goal.baselineValue
  const target = goal.targetValue
  const nowVal = progress.currentAvg
  const unit = copy.unit

  return (
    <div className={`${styles.card} ${styles.cardActive}`}>
      <div className={styles.cardHeader}>
        <span className={styles.dot} aria-hidden />
        <span className={styles.cardLabel}>your goal</span>
      </div>

      <h3 className={styles.goalTitle}>{copy.title}</h3>

      <div className={styles.progressWrap}>
        <p className={styles.progressLine}>
          <strong>{pctInt}%</strong> of the way there
        </p>
        <div className={styles.bar} role="progressbar" aria-valuenow={pctInt} aria-valuemin={0} aria-valuemax={100}>
          <div className={styles.barFill} style={{ width: `${pctInt}%` }} />
        </div>
      </div>

      <div className={styles.scaleRow}>
        <div className={styles.scaleMark}>
          <span className={styles.scaleVal}>{fmt(baseline, copy.unit === 'h' ? 1 : 0)}{unit}</span>
          <span className={styles.scaleKey}>start</span>
        </div>
        <span className={styles.scaleSep}>→</span>
        <div className={styles.scaleMark}>
          <span className={`${styles.scaleVal} ${styles.scaleValNow}`}>{fmt(nowVal, copy.unit === 'h' ? 1 : 0)}{unit}</span>
          <span className={styles.scaleKey}>now</span>
        </div>
        <span className={styles.scaleSep}>→</span>
        <div className={styles.scaleMark}>
          <span className={styles.scaleVal}>{fmt(target, copy.unit === 'h' ? 1 : 0)}{unit}</span>
          <span className={styles.scaleKey}>target</span>
        </div>
      </div>
    </div>
  )
}

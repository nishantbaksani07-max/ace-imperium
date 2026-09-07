'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import CelebrationScreen from '@/components/CelebrationScreen'
import { goalCopy } from '@/lib/vitals/goalCopy'
import { setActiveGoalMetric } from '@/app/app/vitals/goalActions'
import type { VitalsGoal } from '@/lib/vitals/goals'
import type { VitalsGoalMetric } from '@/lib/vitals/healthContext'
import styles from './goalSet.module.css'

const ALL_METRICS: { metric: VitalsGoalMetric; label: string }[] = [
  { metric: 'recovery', label: 'recovery' },
  { metric: 'sleep',    label: 'sleep' },
  { metric: 'hrv',      label: 'hrv' },
  { metric: 'strain',   label: 'strain' },
]

export default function GoalSetCelebration({ goal }: { goal: VitalsGoal }) {
  const router = useRouter()
  const [showSwap, setShowSwap] = useState(false)
  const [pending, startTransition] = useTransition()
  const copy = goalCopy(goal)

  function handleSwap(metric: VitalsGoalMetric) {
    startTransition(async () => {
      await setActiveGoalMetric(metric)
      router.refresh()
    })
  }

  return (
    <CelebrationScreen
      // The quiz-complete mark: the RADIAL ring sweeps to full and confirms.
      gemGlyph="RADIAL"
      backHref="/app/vitals"
      eyebrow="your goal is set"
      title={copy.title}
      sub={copy.why}
      card={{
        key: 'working toward',
        value: copy.badgeLabel,
        chip: `tracking your ${copy.metricLabel}${copy.unit ? ` (${copy.unit})` : ''}`,
      }}
      // Connect-first: device is already paired by now. Route through the front
      // door so the user lands on whichever band they connected.
      primary={{ label: pending ? 'updating...' : "let's do it", onClick: () => router.push('/app/vitals'), disabled: pending }}
      secondary={{ label: showSwap ? 'hide options' : 'pick a different focus', onClick: () => setShowSwap(s => !s), disabled: pending }}
    >
      {showSwap && (
        <>
          <div className={styles.swapLabel}>switch to</div>
          <div className={styles.swapRow}>
            {ALL_METRICS.filter(m => m.metric !== goal.metric).map(({ metric, label }) => (
              <button
                key={metric}
                className={styles.swapChip}
                onClick={() => handleSwap(metric)}
                disabled={pending}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </CelebrationScreen>
  )
}

import { goalCopy } from '@/lib/vitals/goalCopy'
import type { VitalsGoal } from '@/lib/vitals/goals'
import styles from './goalBadge.module.css'

interface GoalBadgeProps {
  goal: VitalsGoal | null
  href?: string
}

/**
 * Always-on goal pill in the wearables header.
 * A pulsing mint dot + "working on: <badgeLabel>" text.
 * Renders nothing if no active goal.
 */
export default function GoalBadge({ goal, href }: GoalBadgeProps) {
  if (!goal) return null
  const copy = goalCopy(goal)
  return (
    <a className={styles.badge} href={href ?? '/app/vitals/whoop'}>
      <span className={styles.dot} aria-hidden />
      <span className={styles.label}>working on:&nbsp;</span>
      <span className={styles.value}>{copy.badgeLabel}</span>
      {goal.isProvisional && (
        <span className={styles.settling}>&nbsp;· settling in</span>
      )}
    </a>
  )
}

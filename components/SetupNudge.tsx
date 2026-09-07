'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { OnboardingTask, TaskId } from '@/lib/onboardingTasks'
import { dismissedKeyForUser } from '@/lib/onboardingDismissed'
import styles from './SetupNudge.module.css'

interface SetupNudgeProps {
  tasks: OnboardingTask[]
  /** Current user id — scopes the localStorage dismiss-set so a second
   *  account on the same browser doesn't inherit the first account's
   *  dismissals. Required: passing undefined would re-introduce the
   *  cross-user pollution bug. */
  userId: string
}

/**
 * Floating "Finish setup · N left" pill that lives at the top of the
 * gated dashboard. Whenever any onboarding quiz is still unsettled
 * (not done, not dismissed) we surface it as a quiet nudge — one tap
 * routes the user back to /welcome where the full checklist lives.
 *
 * Hides itself the moment all tasks are settled, so power users never
 * see it. Reads the same per-user localStorage dismissed-set the
 * checklist writes to, so dismissing a quiz on /welcome immediately
 * removes it from this counter on next render.
 */
export default function SetupNudge({ tasks, userId }: SetupNudgeProps) {
  const pathname = usePathname()
  const [dismissed, setDismissed] = useState<Set<TaskId>>(new Set())
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(dismissedKeyForUser(userId))
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setDismissed(new Set(parsed as TaskId[]))
      }
    } catch {
      // localStorage unavailable — fall through to empty set.
    }
    setHydrated(true)
  }, [userId])

  if (!hydrated) return null

  // Hide the pill while the user is actually inside a quiz or the
  // fitness setup wizard. The pill links to /welcome to "go finish
  // setup" — telling them to do that *while they're already doing it*
  // is redundant and visually pollutes the shielded onboarding surface
  // launched from /welcome (atmosphere should look like one space, no
  // dashboard chrome on top).
  if (pathname?.startsWith('/app/quiz/') || pathname?.startsWith('/app/fitness/setup')) {
    return null
  }

  // Coming-soon tasks (supplements, peak) are roadmap previews — their
  // quizzes don't exist yet, so users can't "complete" them. Excluding
  // them from the count means the pill hides once the live tasks are
  // done, even if the user never explicitly dismissed the placeholders.
  const remaining = tasks.filter(t => !t.comingSoon && !t.done && !dismissed.has(t.id)).length
  if (remaining === 0) return null

  return (
    <Link href="/welcome" className={styles.nudge} aria-label={`Finish setup. ${remaining} item${remaining === 1 ? '' : 's'} left`}>
      <span className={styles.dot} aria-hidden />
      <span className={styles.label}>
        <span className={styles.labelText}>Finish setup</span>
        <span className={styles.sep} aria-hidden>·</span>
        <span className={styles.count}>{remaining} left</span>
      </span>
      <span className={styles.arrow} aria-hidden>→</span>
    </Link>
  )
}

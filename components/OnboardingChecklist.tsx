'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { OnboardingTask, TaskId } from '@/lib/onboardingTasks'
import { dismissedKeyForUser } from '@/lib/onboardingDismissed'
import styles from './OnboardingChecklist.module.css'

interface OnboardingChecklistProps {
  tasks: OnboardingTask[]
  /** Current user id — scopes the dismiss-set per account so two users
   *  on the same browser don't share dismissals. */
  userId: string
  /** When provided, render this content (instead of returning null) once
   *  every task is done or dismissed. Used by the welcome screen so the
   *  checklist panel never collapses into an empty slot. */
  emptyState?: React.ReactNode
  /** 'pending' (default) is the original onboarding context — hide the
   *  list once every task is settled, show "N more to go" copy.
   *  'edit' is the Settings re-entry context — always render every row
   *  so the user can re-open any quiz to update their answers, and swap
   *  the gem prompt for a tap-to-edit hint. */
  mode?: 'pending' | 'edit'
  /** When true, the card plays its cozy spring-in entrance (header,
   *  progress, then rows dealing in). Used by the welcome screen so the
   *  "your setup" card materializes warmly on the take-me-in handoff.
   *  Omitted elsewhere (dashboard / settings keep the plain fade). */
  appear?: boolean
}

function readDismissed(userId: string): Set<TaskId> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(dismissedKeyForUser(userId))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return new Set(parsed as TaskId[])
  } catch {
    // bad JSON / localStorage unavailable — fall through to empty set.
  }
  return new Set()
}

function writeDismissed(userId: string, set: Set<TaskId>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(dismissedKeyForUser(userId), JSON.stringify(Array.from(set)))
  } catch {
    // ignore quota / private-mode failures
  }
}

/**
 * Vitality gem's voice greets the user above the checklist. Short, warm,
 * game-flavored — never a "set up your account" form vibe. Picks a copy
 * line based on how much of the checklist is left so it feels reactive
 * rather than canned.
 */
function GemPrompt({ remaining, total }: { remaining: number; total: number }) {
  let line: string
  if (remaining === total) {
    // Phrase the count up front so the user knows the scope. Two
    // "things" reads warmer than "two tasks" — keep it conversational.
    const word = remaining === 1 ? 'thing' : 'things'
    line = `${capWord(remaining)} quick ${word} and I have your back the whole way.`
  } else if (remaining === 1) {
    line = 'One more and we’re rolling.'
  } else {
    line = `${remaining} more to go.`
  }
  return (
    <div className={styles.gemPrompt}>
      <span className={styles.gemDot} aria-hidden />
      <p className={styles.gemLine}>
        <em>{line}</em>
      </p>
    </div>
  )
}

function capWord(n: number): string {
  // Spell out small counts so the headline reads like prose, not a UI
  // string. Fallback to the numeral past five.
  switch (n) {
    case 1: return 'One'
    case 2: return 'Two'
    case 3: return 'Three'
    case 4: return 'Four'
    case 5: return 'Five'
    default: return String(n)
  }
}

export default function OnboardingChecklist({ tasks, userId, emptyState, mode = 'pending', appear }: OnboardingChecklistProps) {
  // Hydrate dismissed-set from localStorage on mount. Until then the
  // checklist renders with everything visible — avoids a flash of
  // "no checklist" on initial paint.
  const [dismissed, setDismissed] = useState<Set<TaskId>>(new Set())
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    setDismissed(readDismissed(userId))
    setHydrated(true)
  }, [userId])

  function dismiss(id: TaskId) {
    setDismissed(prev => {
      const next = new Set(prev)
      next.add(id)
      writeDismissed(userId, next)
      return next
    })
  }

  function restore(id: TaskId) {
    setDismissed(prev => {
      const next = new Set(prev)
      next.delete(id)
      writeDismissed(userId, next)
      return next
    })
  }

  // A task is "settled" when the user has either completed it OR
  // dismissed it. The progress bar fills against settled count.
  const total = tasks.length
  const settled = useMemo(
    () => tasks.filter(t => t.done || dismissed.has(t.id)).length,
    [tasks, dismissed],
  )
  const remaining = total - settled

  // When everything's settled, behavior depends on `mode`:
  //   - 'pending' (dashboard / welcome): hide the component entirely or
  //     render the supplied emptyState. The list has done its job.
  //   - 'edit' (settings re-entry): keep rendering every row so the user
  //     can tap any task to revisit + change the answer they saved.
  //     Suppresses the progress bar / counter — they'd both read 100%
  //     and add no signal in this context.
  const allSettled = hydrated && remaining === 0
  if (allSettled && mode === 'pending') {
    return emptyState ? <>{emptyState}</> : null
  }

  return (
    <section className={`${styles.shell} ${appear ? styles.shellCozy : ''}`} aria-label="Onboarding checklist">
      {mode === 'pending' && (
        <div className={styles.head}>
          <GemPrompt remaining={remaining} total={total} />
          <span className={styles.counter}>
            <span className={styles.counterDone}>{settled}</span>
            <span className={styles.counterSep}>/</span>
            <span className={styles.counterTotal}>{total}</span>
          </span>
        </div>
      )}

      {mode === 'pending' && (
        <div className={styles.progressTrack} aria-hidden>
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className={`${styles.progressSeg} ${i < settled ? styles.progressSegDone : ''} ${i === settled ? styles.progressSegCurrent : ''}`}
            />
          ))}
        </div>
      )}

      <ul className={styles.list}>
        {tasks.map(task => {
          const isDismissed = dismissed.has(task.id)
          const isDone = task.done
          const state: 'done' | 'dismissed' | 'pending' =
            isDone ? 'done' : isDismissed ? 'dismissed' : 'pending'
          const rowClass = [
            styles.row,
            styles[`row-${state}`],
            state === 'pending' && task.comingSoon ? styles['row-soon'] : '',
          ].filter(Boolean).join(' ')
          return (
            <li
              key={task.id}
              className={rowClass}
            >
              <span className={styles.stateIcon} aria-hidden>
                {state === 'done' && (
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M 3 8.5 L 7 12 L 13 4.5" />
                  </svg>
                )}
                {state === 'dismissed' && (
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M 4 4 L 12 12" />
                    <path d="M 12 4 L 4 12" />
                  </svg>
                )}
                {state === 'pending' && (
                  <span className={styles.pendingDot} />
                )}
              </span>

              <div className={styles.copy}>
                {(task.eyebrow || task.forYou) && (
                  <span className={styles.eyebrow}>
                    {task.forYou && state === 'pending' && (
                      <>
                        <span className={styles.eyebrowForYou}>for you</span>
                        {task.eyebrow && <span className={styles.eyebrowSep} aria-hidden> · </span>}
                      </>
                    )}
                    {task.eyebrow}
                  </span>
                )}
                <span className={styles.titleRow}>
                  <span className={styles.title}>
                    <em>{task.title}</em>
                  </span>
                  {task.note && state === 'pending' && (
                    <span className={styles.privateTag} title="Only you see this">
                      {task.note}
                    </span>
                  )}
                </span>
                <span className={styles.desc}>{task.description}</span>
              </div>

              {state === 'pending' && !task.comingSoon && (
                <>
                  <Link href={task.href} className={styles.actionBtn}>
                    start <span aria-hidden>→</span>
                  </Link>
                  <button
                    type="button"
                    className={styles.dismissBtn}
                    onClick={() => dismiss(task.id)}
                    aria-label={`Dismiss ${task.title}`}
                    title="Skip this for now"
                  >
                    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M 4 4 L 12 12" />
                      <path d="M 12 4 L 4 12" />
                    </svg>
                  </button>
                </>
              )}
              {state === 'pending' && task.comingSoon && (
                <>
                  <span className={styles.comingSoonTag} title="Quiz launching soon">
                    soon
                  </span>
                  <button
                    type="button"
                    className={styles.dismissBtn}
                    onClick={() => dismiss(task.id)}
                    aria-label={`Hide ${task.title}`}
                    title="Hide this for now"
                  >
                    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M 4 4 L 12 12" />
                      <path d="M 12 4 L 4 12" />
                    </svg>
                  </button>
                </>
              )}
              {state === 'dismissed' && (
                <button
                  type="button"
                  className={styles.restoreBtn}
                  onClick={() => restore(task.id)}
                >
                  put it back
                </button>
              )}
              {state === 'done' && mode === 'pending' && (
                <div className={styles.doneActions}>
                  {/* "Visit" pill: a quiz produced something the user
                      can actually go look at — the workout logger,
                      mentor chat, water page, etc. Show this on the
                      done row so a user who just answered the
                      questions can immediately see where the answers
                      went, instead of guessing. Tasks without a
                      visible result page (personal info) skip it. */}
                  {task.destination && !task.comingSoon && (
                    <Link href={task.destination.href} className={styles.actionBtn}>
                      {task.destination.label} <span aria-hidden>→</span>
                    </Link>
                  )}
                  {/* Status + edit: when there's NO destination pill,
                      show the "done" tag so the row reads as complete.
                      When there IS a pill, the checkmark + pill carry
                      the status — adding "done" would just clutter. */}
                  {!task.destination && <span className={styles.doneTag}>done</span>}
                  {/* Edit affordance — only when there's NO "open" pill. The
                      pill already re-opens the questionnaire (it links to the
                      quiz), so an "edit" link beside it would be a redundant
                      second route to the same place. Rows without a pill (e.g.
                      personal info → /account) keep "edit" so they stay
                      revisitable. comingSoon tasks have no quiz, so skip. */}
                  {!task.destination && !task.comingSoon && (
                    <Link href={task.href} className={styles.editBtn}>
                      edit
                    </Link>
                  )}
                </div>
              )}
              {/* Edit-mode: a done task is the user's saved answer — make
                  it clickable so they can re-open the quiz/page and
                  update what they wrote. The quiz routes pre-fill from
                  user_profile.preferences (or wherever the slice lives)
                  so revisiting feels like editing, not re-doing. */}
              {state === 'done' && mode === 'edit' && !task.comingSoon && (
                <Link href={task.href} className={styles.actionBtn}>
                  edit <span aria-hidden>→</span>
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

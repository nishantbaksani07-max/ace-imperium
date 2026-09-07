'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { QUIZZES, type QuizId } from '@/lib/quizzes/registry'
import { markQuizzesSeen } from '@/app/app/quiz/actions'
import styles from './NewQuizGreeting.module.css'

// Same dynamic import as /welcome — Three.js client-only.
const HeroCrystal = dynamic(() => import('@/components/HeroCrystal'), {
  ssr: false,
  loading: () => <div className={styles.gemFallback} aria-hidden />,
})

interface NewQuizGreetingProps {
  /** Quiz ids the user hasn't been notified about yet. The modal
   *  renders nothing if this is empty. Server-computed in
   *  app/app/layout.tsx via computeNewQuizzes(). */
  newIds: QuizId[]
}

/**
 * Gem-led "new quiz available" modal. Fires on first dashboard load
 * after we ship a new tailoring quiz the user hasn't been told about.
 * Pulsing mint outline on the new quiz card draws the eye; two
 * options — "take it now" goes straight to the quiz, "maybe later"
 * marks the quiz as seen without taking.
 *
 * Either action calls markQuizzesSeen() so the modal won't pop again
 * for these ids on subsequent loads — true "once per new quiz" behavior.
 *
 * Bug-proofing:
 *   - Returns null instantly if newIds is empty (zero overhead for
 *     the common case where nothing's new).
 *   - Hidden during /welcome (would compete with the onboarding gem).
 *   - Dismiss is optimistic — local state hides the modal immediately,
 *     server write fires after. A failed server write means the modal
 *     re-pops on next load, which is the safest failure mode.
 *   - Esc key closes the same as "maybe later" so power users can
 *     dismiss it instantly.
 */
export default function NewQuizGreeting({ newIds }: NewQuizGreetingProps) {
  // Local "dismissed this session" — the server write happens in
  // parallel, but the modal closes the moment the user clicks.
  const [dismissed, setDismissed] = useState(false)
  const router = useRouter()

  // Hide on /welcome so the onboarding gem owns that screen exclusively.
  // (Server can't always know what route we're on at this layout level
  //  reliably, so guard client-side too.)
  const [hideOnWelcome, setHideOnWelcome] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.pathname === '/welcome') {
      setHideOnWelcome(true)
    }
  }, [])

  // Esc closes (counts as "maybe later").
  useEffect(() => {
    if (!newIds.length || dismissed) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleMaybeLater()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newIds.length, dismissed])

  if (newIds.length === 0) return null
  if (dismissed) return null
  if (hideOnWelcome) return null

  // Show only the FIRST new quiz at a time — if multiple ship at once
  // we'd rather give each its moment than dump a list on the user.
  // The rest will pop on subsequent dashboard loads as they get marked
  // seen one by one.
  const id = newIds[0]
  const quiz = QUIZZES[id]
  if (!quiz) return null

  async function handleTakeNow() {
    setDismissed(true)
    // Fire-and-forget the seen-write — don't block the navigation.
    void markQuizzesSeen([id]).catch(err => {
      console.warn('[NewQuizGreeting] markQuizzesSeen failed (take):', err)
    })
    router.push(`/app/quiz/${id}`)
  }

  async function handleMaybeLater() {
    setDismissed(true)
    void markQuizzesSeen([id]).catch(err => {
      console.warn('[NewQuizGreeting] markQuizzesSeen failed (later):', err)
    })
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="new-quiz-title">
      <div className={styles.dialog}>
        <div className={styles.atmosphere} aria-hidden />

        <button
          type="button"
          className={styles.closeIcon}
          onClick={handleMaybeLater}
          aria-label="Maybe later"
        >×</button>

        <div className={styles.gemStage}>
          <HeroCrystal mode="character" />
        </div>

        <div className={styles.copyStack}>
          <span className={styles.eyebrow}>
            <span className={styles.eyebrowRule} aria-hidden />
            new for you
          </span>
          <h2 id="new-quiz-title" className={styles.line}>
            <em>I added a new quiz.</em> Want to take it?
          </h2>
          <p className={styles.lineSub}>
            Quick, painless. Once you finish, I&apos;ll start tailoring
            the rest of the app to your answers.
          </p>
        </div>

        {/* Pulsing quiz card — draws the eye to what's new. */}
        <div className={styles.quizCard} aria-label={quiz.title}>
          <div className={styles.quizCardGlow} aria-hidden />
          <div className={styles.quizCardInner}>
            <span className={styles.quizCardEyebrow}>
              <span className={styles.quizCardEyebrowRule} aria-hidden />
              tailoring quiz
            </span>
            <span className={styles.quizCardTitle}><em>{quiz.title}</em></span>
            <span className={styles.quizCardMeta}>
              {quiz.questions.length} {quiz.questions.length === 1 ? 'question' : 'questions'} ·
              about a minute
            </span>
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.maybeBtn}
            onClick={handleMaybeLater}
          >
            maybe later
          </button>
          <button
            type="button"
            className={styles.takeBtn}
            onClick={handleTakeNow}
          >
            take it now <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </div>
  )
}

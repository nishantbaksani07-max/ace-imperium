'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Quiz, { type QuizAnswers } from '@/components/Quiz'
import QuizComplete from '@/components/QuizComplete'
import WelcomeBackdrop from '@/components/WelcomeBackdrop'
import CozyLoader from '@/components/CozyLoader'
import { FUEL_SET } from '@/lib/cozy'
import { getQuiz, type QuizId } from '@/lib/quizzes/registry'
import { saveQuizSlice } from '../actions'
import styles from './quizPage.module.css'

interface QuizPageProps {
  quizId: QuizId
  initialAnswers?: QuizAnswers
  /** Where to go after the user completes (or cancels) the quiz. Set
   *  via the `?return=...` query string when the quiz is invoked from
   *  a module gate; defaults to /welcome for the standalone entry. */
  returnPath: string
  /** When true, render over a WelcomeBackdrop instead of the default
   *  dashboard surface. Set by the /welcome onboarding checklist so
   *  the user never sees dashboard chrome leaking behind the quiz
   *  dialog before they've actually entered the app. */
  shielded?: boolean
}

/**
 * Client-side quiz host. Mounts the generic Quiz engine with the
 * manifest for this quiz id, saves the answers via the server action
 * on complete, shows the tailored celebration screen, then routes to
 * `returnPath` once the user dismisses it.
 */
export default function QuizPage({ quizId, initialAnswers, returnPath, shielded = false }: QuizPageProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [reading, setReading] = useState(false)
  const [continuing, setContinuing] = useState(false)
  const manifest = getQuiz(quizId)

  async function handleComplete(answers: QuizAnswers) {
    setError(null)
    // The food-story quiz gets a short cozy "reading your food story" beat
    // before the celebration, so the answers land as a warm moment (the same
    // pattern as the macro setup's "Building your plan"). Skipped under
    // reduced motion so it never feels like a forced wait.
    const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const cozy = quizId === 'nutrition' && !reduce
    if (cozy) setReading(true)
    const startedAt = Date.now()
    try {
      const payload = manifest.toPayload(answers)
      // Type assertion fine here — saveQuizSlice's generic narrows
      // on the slice key at the call site.
      const res = await saveQuizSlice(quizId, payload as never)
      if (!res.ok) {
        setReading(false)
        setError(res.error ?? 'Failed to save your answers.')
        return
      }
      if (cozy) await new Promise((r) => setTimeout(r, Math.max(0, 1700 - (Date.now() - startedAt))))
      setReading(false)
      setDone(true)
    } catch (e) {
      setReading(false)
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    }
  }

  function handleCancel() {
    router.push(returnPath)
  }

  function handleContinue() {
    setContinuing(true)
    // Prefer the per-quiz destination — the module the answers now
    // power (mentor, water, goals) — so the user lands on the result
    // of what they just did instead of bouncing back to the welcome
    // checklist. Falls back to returnPath when the manifest doesn't
    // declare a destination.
    router.push(manifest.completion.destinationHref ?? returnPath)
  }

  function handleBackToChecklist() {
    setContinuing(true)
    // Brand-new shielded-mode users may want to keep working through
    // remaining onboarding tasks before exploring the dashboard. Push
    // back to /welcome instead of the destination.
    router.push('/welcome')
  }

  const body = (
    <>
      {reading ? (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 'var(--space-6)' }}>
          <div style={{ width: '100%', maxWidth: 460, position: 'relative', zIndex: 1 }}>
            <CozyLoader items={FUEL_SET.items} tags={FUEL_SET.tags} title="Reading your food story" />
          </div>
        </div>
      ) : done ? (
        <QuizComplete
          eyebrow={manifest.completion.eyebrow}
          headline={manifest.completion.headline}
          sub={manifest.completion.sub}
          ctaLabel={manifest.completion.ctaLabel}
          glyph={manifest.completion.glyph}
          onContinue={handleContinue}
          submitting={continuing}
          // Shielded (first-time onboarding) users get a second path
          // back to their welcome checklist so they can keep working
          // through remaining to-dos instead of being forced into the
          // destination module. Returning users (non-shielded) skip
          // this — they already finished onboarding.
          secondaryCtaLabel={shielded ? 'back to my to-dos' : undefined}
          onSecondary={shielded ? handleBackToChecklist : undefined}
        />
      ) : (
        <Quiz
          chapters={manifest.chapters}
          questions={manifest.questions}
          initialAnswers={initialAnswers}
          onComplete={handleComplete}
          onCancel={handleCancel}
          onSkip={handleCancel}
          skipLabel="skip for now, the coach stays general"
          finishLabel={manifest.finishLabel}
        />
      )}
      {error && (
        <div role="alert" style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 200, padding: '10px 18px',
          background: 'rgba(248, 113, 113, 0.16)',
          border: '1px solid rgba(248, 113, 113, 0.5)',
          color: '#f87171', borderRadius: 999,
          fontSize: 13,
        }}>
          {error}
        </div>
      )}
    </>
  )

  if (shielded) {
    return (
      <main className={`${styles.shieldedPage} grain-overlay`}>
        <WelcomeBackdrop />
        {body}
      </main>
    )
  }

  return body
}

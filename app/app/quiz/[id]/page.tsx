import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserPreferences } from '@/lib/preferences'
import { isQuizId, getQuiz } from '@/lib/quizzes/registry'
import QuizPage from './QuizPage'

/**
 * /app/quiz/[id] — dynamic route for every tailoring quiz registered
 * in lib/quizzes/registry.ts. Server-side: gate on auth, look up the
 * manifest, hydrate any previously-saved answers (retake support),
 * hand off to the client component.
 */
export default async function QuizRoute({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { return?: string; shielded?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!isQuizId(params.id)) notFound()

  const manifest = getQuiz(params.id)
  const prefs = await getUserPreferences(supabase, user.id)
  const existing = prefs[params.id]
  const initialAnswers = existing ? manifest.fromPayload(existing as never) : undefined

  // Allow-list return paths to internal routes only — never let the
  // query string redirect us off-site. Defaults to /welcome so the
  // standalone (no-gate) entry point still works as before.
  const safeReturn = typeof searchParams.return === 'string' && searchParams.return.startsWith('/')
    ? searchParams.return
    : '/welcome'

  // Shielded mode (?shielded=1) — set by the /welcome onboarding
  // checklist so the quiz renders over a clean welcome atmosphere
  // instead of letting the dashboard layout leak through behind the
  // dialog. The user hasn't seen the dashboard yet; the onboarding
  // surface should feel like one continuous space until they actively
  // continue past it.
  const shielded = searchParams.shielded === '1'

  return (
    <QuizPage
      quizId={params.id}
      initialAnswers={initialAnswers}
      returnPath={safeReturn}
      shielded={shielded}
    />
  )
}

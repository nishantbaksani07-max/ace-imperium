import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SplitLog from '../SplitLog'
import { parseRotationDays } from '../splitData'
import { getLocalDateKey } from '@/lib/dates'
import { getExerciseHistory, getWorkoutForDay, getRecentDayStatuses, getDeloadedDayNamesSince, type SavedExercise, type CardioEntry, type OffDayLevel } from '@/lib/workouts/queries'
import type { CustomExercise } from '../actions'

interface DayPageProps {
  params: { day: string }
  searchParams?: { resume?: string | string[] }
}

/**
 * Dynamic day route. Validates the [day] segment, loads the user's
 * customized rotation + recommended weights, *and* hydrates any
 * already-logged sets for today/this-day from the workouts table —
 * so refreshing the page or returning later picks up exactly where
 * the user left off.
 *
 * Auth + onboarded gating already handled by app/app/layout.tsx; fitness
 * atmosphere by app/app/fitness/layout.tsx. If the user hasn't completed
 * setup yet, we bounce them to the wizard.
 */
export default async function DayLogPage({ params, searchParams }: DayPageProps) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // All four per-user reads only need user.id, so they run in one round trip
  // instead of four serial ones. The three training_settings selects stay
  // separate (not one combined select) for migration safety: a missing column
  // errors only its own query, never the critical rotation read.
  const [{ data: settings }, restRes, customRes, { data: profile }] = await Promise.all([
    supabase
      .from('training_settings')
      .select('rotation_days, recommended_weights, setup_complete, intake_rec')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('training_settings')
      .select('rest_overrides')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('training_settings')
      .select('custom_exercises')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('user_profile')
      .select('units')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  if (!settings || !settings.setup_complete) {
    redirect('/app/fitness/setup')
  }

  const split = parseRotationDays(settings.rotation_days)
  if (!split) {
    redirect('/app/fitness/setup')
  }

  const dayNum = parseInt(params.day, 10)
  if (Number.isNaN(dayNum) || dayNum < 1 || dayNum > split.length) {
    notFound()
  }

  const recommendedWeights = (settings.recommended_weights ?? {}) as Record<string, number>

  // Per-lift rest overrides — error-tolerant so the logger still loads if the
  // `rest_overrides` column hasn't been migrated yet.
  let restOverrides: Record<string, number> = {}
  if (!restRes.error && restRes.data?.rest_overrides) {
    restOverrides = restRes.data.rest_overrides as Record<string, number>
  }

  // The user's own custom lifts — same error-tolerant pattern so the logger
  // still loads if the `custom_exercises` column hasn't been migrated yet.
  let customExercises: CustomExercise[] = []
  if (!customRes.error && Array.isArray(customRes.data?.custom_exercises)) {
    customExercises = customRes.data.custom_exercises as CustomExercise[]
  }

  // The user's unit preference (kg vs lbs). Storage stays in kg; SplitLog
  // converts at the UI boundary via lib/units.ts.
  const units = (profile?.units === 'imperial' ? 'imperial' : 'metric') as 'metric' | 'imperial'

  // The user's local date for "today". `getLocalDateKey()` on the server
  // returns Vercel's date (UTC), which silently rolls over for non-UTC users.
  // <LocalDateSync /> (mounted in app/app/layout.tsx) writes the browser's
  // real local date to the `vitality_local_date` cookie; read it here so
  // every workouts read + write keys against the user's actual day.
  // First-visit fallback (no cookie yet) uses server-local — LocalDateSync
  // refreshes the page once the cookie is set if it diverges.
  const cookieDate = cookies().get('vitality_local_date')?.value
  const actualToday = cookieDate && /^\d{4}-\d{2}-\d{2}$/.test(cookieDate)
    ? cookieDate
    : getLocalDateKey()
  // Resume an unfinished PAST session: the schedule board links a "Not finished"
  // tile with ?resume=<that row's date>, so opening it loads AND saves that
  // day's session (logged sets intact) - letting the user add what they missed
  // (e.g. forgotten cardio) and finish it, instead of a blank today-session.
  // Only honor a well-formed date that isn't in the future; anything else falls
  // back to today. `today` is therefore "the date this session is for".
  const resume = typeof searchParams?.resume === 'string' ? searchParams.resume : undefined
  const today = resume && /^\d{4}-\d{2}-\d{2}$/.test(resume) && resume <= actualToday
    ? resume
    : actualToday

  const dayName = split[dayNum - 1].name
  const dayExerciseIds = split[dayNum - 1].exercises.map(e => e.id)

  // Kick off the non-critical chrome reads now so they resolve alongside the
  // hydration/history batch below instead of as extra serial round trips.
  // Both are error-tolerant: failures resolve to null (handled where consumed).
  const lookbackDays = Math.max(split.length * 2, 14)
  const since = new Date()
  since.setDate(since.getDate() - lookbackDays)
  const statusesPromise = getRecentDayStatuses(supabase, user.id, getLocalDateKey(since)).catch((e) => {
    console.error('[/app/fitness/log/[day]] getRecentDayStatuses error:', e)
    return null
  })
  const deloadPromise = Promise.resolve(
    supabase
      .from('training_settings')
      .select('deload_started_on')
      .eq('user_id', user.id)
      .maybeSingle(),
  ).catch(() => null) // column not migrated yet — treat as no deload

  // Parallelize the today-hydration query with one history query per
  // exercise on this day. Server-side prefetch keeps the per-pill history
  // dots + PR detection working without N client round-trips.
  const [savedResult, ...historyResults] = await Promise.allSettled([
    getWorkoutForDay(supabase, { userId: user.id, date: today, dayName }),
    ...dayExerciseIds.map(exId => getExerciseHistory(supabase, exId, user.id, 6)),
  ])

  let initialExercises: SavedExercise[] | null = null
  let initialCardio: CardioEntry[] = []
  let submittedAt: string | null = null
  let initialOffDay: OffDayLevel | null = null
  if (savedResult.status === 'fulfilled' && savedResult.value) {
    initialExercises = savedResult.value.exercises
    initialCardio = savedResult.value.cardio ?? []
    submittedAt = savedResult.value.submitted_at
    initialOffDay = savedResult.value.off_day ?? null
  } else if (savedResult.status === 'rejected') {
    console.error('[/app/fitness/log/[day]] hydration query failed:', savedResult.reason)
  }

  const exerciseHistory: Record<string, number[]> = {}
  // The lift's PREVIOUS-session best (top set), EXCLUDING today's row. Drives
  // the progressive-overload celebration in SplitLog: a logged set beats this
  // when it's heavier, or the same weight at more reps. We exclude today so the
  // comparison is always against a prior session, never against a set the user
  // just logged this session (which would otherwise sit in the same history).
  const prevBest: Record<string, { weight: number; reps: number } | null> = {}
  // The MOST RECENT genuinely-logged session (today + off-days excluded). Drives
  // the overload card's "last session" readout — it must come from real logged
  // history, never the live (possibly just-tuned) prescription, so a tune can't
  // masquerade as a past session.
  const prevSession: Record<string, { sets: number; reps: number; weight: number } | null> = {}
  for (let i = 0; i < dayExerciseIds.length; i++) {
    const exId = dayExerciseIds[i]
    const result = historyResults[i]
    if (result.status === 'fulfilled') {
      // ExerciseHistoryPoint[] is oldest → newest. HistoryDots and the PR
      // check expect a flat number[] of top weights, same order. Off-day
      // sessions are skipped — an eased sick-day set must never read as a dot
      // or a PR target to beat.
      exerciseHistory[exId] = result.value.filter(p => !p.offDay).map(p => p.topWeight)
      // Previous best = the heaviest top set across all prior sessions (today
      // and off-days excluded), tie-broken by reps. null when there's no prior
      // real session.
      let best: { weight: number; reps: number } | null = null
      for (const p of result.value) {
        if (p.date === today) continue
        if (p.offDay) continue
        if (p.topWeight <= 0) continue
        if (!best || p.topWeight > best.weight || (p.topWeight === best.weight && p.topReps > best.reps)) {
          best = { weight: p.topWeight, reps: p.topReps }
        }
      }
      prevBest[exId] = best
      // result.value is oldest → newest, so the last qualifying point is the
      // most recent real session.
      let recent: { sets: number; reps: number; weight: number } | null = null
      for (const p of result.value) {
        if (p.date === today) continue
        if (p.offDay) continue
        if (p.topWeight <= 0) continue
        recent = { sets: p.setCount, reps: p.topReps, weight: p.topWeight }
      }
      prevSession[exId] = recent
    } else {
      console.error('[/app/fitness/log/[day]] history fetch failed for', exId, result.reason)
      exerciseHistory[exId] = []
      prevBest[exId] = null
      prevSession[exId] = null
    }
  }

  const intakeCompleted = !!settings.intake_rec

  // Per-day completion for the split rail: which days this cycle are done
  // (submitted) or in progress (logged but not submitted). Look back ~one
  // rotation so a long-ago session doesn't keep a segment lit forever. Keyed
  // by day_name; non-critical chrome (fetched above), so never block on it.
  const dayStatuses: Record<string, { completed: boolean; inProgress: boolean }> = {}
  const rawStatuses = await statusesPromise
  if (rawStatuses) {
    for (const [name, st] of Object.entries(rawStatuses)) {
      // Today-scoped, mirroring the schedule board (SessionMenu): a day's
      // strip segment shows the green check ONLY if it was finished TODAY, so a
      // Pull/Legs finished on a previous day no longer lingers as "done".
      dayStatuses[name] = { completed: !!st.submittedAt && st.date === today, inProgress: !st.submittedAt && st.setCount > 0 }
    }
  }

  // Deload week: when a deload is active (started within ~3 weeks and not every
  // training day has been eased yet), the current day auto-eases as a 'deload'
  // session. The workouts rows stamped off_day='deload' are the source of truth
  // for which days are still owed an easy session, so there's no counter to
  // drift. Error-tolerant: a missing deload_started_on column (pre-migration)
  // just means no deload is active. (Fetched above, in parallel with history.)
  let deloadStartedOn: string | null = null
  const deloadRes = await deloadPromise
  if (deloadRes && !deloadRes.error && deloadRes.data?.deload_started_on) {
    deloadStartedOn = deloadRes.data.deload_started_on as string
  }

  let isDeloadToday = false
  let deloadRemaining = 0
  let deloadTotal = 0
  if (deloadStartedOn) {
    const startMs = new Date(`${deloadStartedOn}T00:00:00`).getTime()
    const todayMs = new Date(`${today}T00:00:00`).getTime()
    const daysSince = Math.floor((todayMs - startMs) / 86_400_000)
    // Safety window: a stale start (abandoned mid-pass) stops easing after ~3 weeks.
    if (daysSince >= 0 && daysSince <= 21) {
      const trainingDayNames = Array.from(new Set(split.filter(d => d.exercises.length > 0).map(d => d.name)))
      deloadTotal = trainingDayNames.length
      const easedAlready = await getDeloadedDayNamesSince(supabase, user.id, deloadStartedOn)
      const remaining = trainingDayNames.filter(n => !easedAlready.includes(n))
      deloadRemaining = remaining.length
      isDeloadToday = remaining.includes(dayName)
    }
  }
  // A deload day forces the eased 'deload' level; otherwise honor any saved
  // off-day level for today's row.
  const effectiveOffDay: OffDayLevel | null = isDeloadToday ? 'deload' : initialOffDay

  return (
    <SplitLog
      day={dayNum}
      split={split}
      recommendedWeights={recommendedWeights}
      restOverrides={restOverrides}
      userId={user.id}
      todayKey={today}
      initialExercises={initialExercises}
      initialCardio={initialCardio}
      initialSubmittedAt={submittedAt}
      initialOffDay={effectiveOffDay}
      deloadRemaining={deloadRemaining}
      deloadTotal={deloadTotal}
      exerciseHistory={exerciseHistory}
      prevBest={prevBest}
      prevSession={prevSession}
      units={units}
      intakeCompleted={intakeCompleted}
      customExercises={customExercises}
      dayStatuses={dayStatuses}
    />
  )
}

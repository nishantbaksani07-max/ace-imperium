/**
 * Onboarding checklist source-of-truth.
 *
 * The dashboard's first-mile to-do — a short list of setup items the
 * Vitality gem nudges every new account through. Each task knows:
 *   - whether it's done (computed server-side from Supabase data)
 *   - whether it's been dismissed by the user (client-side, localStorage
 *     for v1 — durable across reloads on the same device, regenerated
 *     if cleared. Future: persist on `user_profile.dismissed_tasks`).
 *
 * Tasks are deliberately few. Long checklists feel like work; the
 * point is "two or three quick things and you're set." Add new tasks
 * here only when the work has real product value beyond data hygiene.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getUserPreferences, hasCompleted } from './preferences'
import type { FocusArea } from './supabase/types'

/**
 * Map of tailoring quiz id → the focus areas it's relevant to.
 *
 * Each tailoring quiz is fitness/mind/peak/etc.-coded; surfacing them
 * to every user (regardless of what they care about) makes the
 * checklist feel like irrelevant homework. We only show a quiz when
 * the user's onboarding focus_areas overlap with the quiz's domains.
 *
 * Mentor is the one we surface universally — even a brand-focused user
 * can benefit from tuning the AI mentor's tone.
 */
const QUIZ_FOCUS_GATE: Record<'goal' | 'mentor' | 'hydration' | 'nutrition' | 'supplements' | 'peak', FocusArea[] | 'all'> = {
  goal:        ['body'],
  mentor:      'all',
  hydration:   ['body'],
  nutrition:   ['body'],
  supplements: ['body'],
  peak:        ['peak', 'body'],
}

function isRelevantToFocus(quizId: keyof typeof QUIZ_FOCUS_GATE, focusAreas: FocusArea[]): boolean {
  const gate = QUIZ_FOCUS_GATE[quizId]
  if (gate === 'all') return true
  return gate.some(area => focusAreas.includes(area))
}

export type TaskId =
  | 'personal'
  | 'training'
  | 'goal'
  | 'mentor'
  | 'hydration'
  | 'nutrition'
  | 'supplements'
  | 'peak'

export interface OnboardingTask {
  id: TaskId
  title: string
  description: string
  /** Where the "do this" button takes the user. Ignored when comingSoon
   *  is true (we render a "soon" badge instead of the start pill). */
  href: string
  /** True when the user has provided the data this task asks for. */
  done: boolean
  /** Short label rendered next to the title (e.g. "private"). */
  note?: string
  /** Eyebrow text rendered above the title for category context. */
  eyebrow?: string
  /** When true: the underlying quiz isn't built yet. The row shows a
   *  muted "soon" badge instead of the start pill so the user sees
   *  the roadmap without being able to click into a dead end. They can
   *  still dismiss it if they don't care. */
  comingSoon?: boolean
  /** True when this task is on the checklist *because* of the user's
   *  focus_areas pick (i.e. it would be hidden if the user hadn't
   *  selected the matching area). Drives the "FOR YOU" eyebrow tag —
   *  makes the personalization legible instead of invisible. Universal
   *  tasks (personal, mentor) stay clean. */
  forYou?: boolean
  /** Where the user can go to *see* the result of completing this task
   *  — the module their answers now power. Surfaces as a mint pill on
   *  done rows ("open workout logger →") so a user who finished a quiz
   *  can immediately go see what it produced instead of guessing where
   *  the answers went. Optional: tasks with no visible result page
   *  (e.g. personal info) leave this unset. */
  destination?: { label: string; href: string }
}

/**
 * Pull task statuses from Supabase. Reads two small tables — user_profile
 * for personal info, training_settings for the training setup. Failures
 * fall through to "not done" so the checklist never blocks the dashboard.
 */
export async function getOnboardingTasks(
  supabase: SupabaseClient,
  userId: string,
): Promise<OnboardingTask[]> {
  let personalDone = false
  let trainingDone = false
  let focusAreas: FocusArea[] = []

  try {
    const { data: profile } = await supabase
      .from('user_profile')
      .select('first_name, starting_weight_kg, focus_areas')
      .eq('user_id', userId)
      .maybeSingle()
    personalDone = !!(profile?.first_name && profile.first_name.trim() !== '' && profile.starting_weight_kg)
    if (Array.isArray(profile?.focus_areas)) {
      focusAreas = profile.focus_areas as FocusArea[]
    }
  } catch {
    // user_profile may not exist on fresh schemas — treat as not-done.
  }

  try {
    const { data: settings } = await supabase
      .from('training_settings')
      .select('setup_complete, intake_answers')
      .eq('user_id', userId)
      .maybeSingle()
    // Either signal counts as done. setup_complete is the full wizard
    // (split + exercises + weights); intake_answers is the 11-question
    // intake that produces a recommendation. The user's mental model is
    // "I finished the questionnaire" — and the /app/fitness/setup page
    // already badges the intake as COMPLETED, so the welcome checklist
    // matches that signal here. The wizard's later steps are refinement
    // they can do whenever.
    trainingDone = !!settings?.setup_complete || !!settings?.intake_answers
  } catch {
    // training_settings may not exist yet — treat as not-done.
  }

  // Read the tailoring-quiz preferences once. Each quiz's done-status
  // is "did this slice get saved?" — `hasCompleted` checks for the
  // `completed_at` timestamp the server action stamps.
  const prefs = await getUserPreferences(supabase, userId)

  // Tasks that are ALWAYS surfaced regardless of focus_areas — the
  // basics every account needs.
  const baseTasks: OnboardingTask[] = [
    {
      id: 'personal',
      title: 'Tell me about you',
      description: 'A quick intro so I can shape every suggestion around you.',
      href: '/account?from=/welcome',
      done: personalDone,
      note: 'private',
      eyebrow: 'one minute',
    },
  ]

  // ── Focus-gated tasks ──
  // Each tailoring quiz is only surfaced when the user picked at least
  // one matching focus area during onboarding. A user who only picked
  // "Master my money" never sees the Hydration or Training tasks.
  // Mentor is universal — its QUIZ_FOCUS_GATE entry is 'all'.
  const focusTasks: OnboardingTask[] = []

  // Training intake is body-focused, so gate it the same way.
  if (focusAreas.includes('body')) {
    focusTasks.push({
      id: 'training',
      title: 'Build your training',
      description: "Thirteen quick questions. I'll match you to a plan that actually fits.",
      href: '/app/fitness/setup?intake=open',
      done: trainingDone,
      eyebrow: 'two minutes',
      forYou: true,
      destination: { label: 'open', href: '/app/fitness/log' },
    })
  }

  // The standalone Goal quiz was retired — the goal is now set inside the
  // Macros/nutrition quiz — so /app/quiz/goal no longer exists. Task removed to
  // kill a 404 (and a checklist item that could never complete).

  if (isRelevantToFocus('mentor', focusAreas)) {
    // Mentor's gate is 'all' — surfaced to every user regardless of
    // focus_areas, so it's NOT a "for you" tailored item. Keep clean.
    focusTasks.push({
      id: 'mentor',
      title: 'Tune your Mentor',
      description: "Pick a tone and what to focus on. I'll show up the way you want.",
      href: '/app/quiz/mentor?shielded=1',
      done: hasCompleted(prefs, 'mentor'),
      eyebrow: 'one minute',
      destination: { label: 'open mentor', href: '/app/mentor' },
    })
  }

  // No standalone Hydration quiz exists (/app/quiz/hydration was never built);
  // the daily water target lives in the Water tracker. Task removed to kill a
  // 404 (and a checklist item that could never complete).

  if (isRelevantToFocus('nutrition', focusAreas)) {
    focusTasks.push({
      id: 'nutrition',
      title: 'Tell me your food story',
      description: 'A few warm questions so your coach knows what to steer you toward, and what to never suggest.',
      href: '/app/quiz/nutrition?shielded=1',
      done: hasCompleted(prefs, 'nutrition'),
      eyebrow: 'two minutes',
      forYou: true,
      destination: { label: 'back to my food', href: '/app/fuel' },
    })
  }

  if (isRelevantToFocus('supplements', focusAreas)) {
    focusTasks.push({
      id: 'supplements',
      title: 'Build your supplement stack',
      description: "Tell me what you take and what you avoid. I'll fill in the rest.",
      href: '/app/quiz/supplements',
      done: false,
      eyebrow: 'one minute',
      comingSoon: true,
      forYou: true,
    })
  }

  if (isRelevantToFocus('peak', focusAreas)) {
    focusTasks.push({
      id: 'peak',
      title: 'Map your Peak profile',
      description: "A quick profile of your sleep and what's coming up. I'll tune your peak window to fit.",
      href: '/app/quiz/peak',
      done: false,
      eyebrow: 'one minute',
      comingSoon: true,
      forYou: true,
    })
  }

  return [...baseTasks, ...focusTasks]
}

/**
 * True when every *live* (non-coming-soon) onboarding task is done.
 *
 * "Fully set up" is the trigger that:
 *   - hides the dashboard "Finish setup · N left" pill, and
 *   - reveals the "Vitality setup" entry inside the SettingsSheet so the
 *     user can still revisit + change any answer when life changes.
 *
 * Coming-soon tasks (supplements, peak) are roadmap previews — they can
 * never be "done" because their quizzes don't exist yet, so they're
 * excluded from the gate. Otherwise the gate would never fire.
 */
export function isFullySetUp(tasks: OnboardingTask[]): boolean {
  const live = tasks.filter(t => !t.comingSoon)
  if (live.length === 0) return false
  return live.every(t => t.done)
}

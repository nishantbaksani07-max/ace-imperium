import type { SupabaseClient } from '@supabase/supabase-js'
import { getOnboardingTasks, type OnboardingTask, type TaskId } from '@/lib/onboardingTasks'

/**
 * The welcome / dashboard checklist, with two adjustments applied here rather
 * than inside lib/onboardingTasks.ts — that file has in-flight work in another
 * window (Stripe), so we keep these out of it:
 *
 *   1. The retired "Set your Vitality goal" quiz row is filtered out (PATCH13).
 *   2. The Macros setup quiz is inserted as a body-focused row, right after
 *      "Build your training". It isn't in onboardingTasks.ts at all — the
 *      Macros quiz lives at /app/fuel/macros/setup and marks itself done via
 *      nutrition_goals.onboarded.
 *
 * Centralized so all three checklist consumers (welcome, dashboard page,
 * dashboard layout) stay in sync. Fold these back into onboardingTasks.ts once
 * the Stripe-window work lands.
 */
export async function getChecklistTasks(
  supabase: SupabaseClient,
  userId: string,
): Promise<OnboardingTask[]> {
  // Retired quizzes (PATCH13/PATCH14): Goal and Hydration. Their rows are
  // filtered here rather than in lib/onboardingTasks.ts (in-flight in another
  // window). The water target auto-computes from bodyweight, so Hydration has
  // no quiz anymore.
  const tasks = (await getOnboardingTasks(supabase, userId)).filter(
    t => t.id !== 'goal' && t.id !== 'hydration',
  )

  // Macros is body-focused like the other Fuel quizzes. The 'training' row is
  // present iff the user picked "Get in shape" during onboarding, so use its
  // presence as the body-focus signal (avoids re-querying focus_areas).
  const trainingIdx = tasks.findIndex(t => t.id === 'training')
  if (trainingIdx >= 0) {
    // Done = the user finished the Macros quiz (its summary sets `onboarded`).
    let macrosDone = false
    try {
      const { data } = await supabase
        .from('nutrition_goals')
        .select('onboarded')
        .eq('user_id', userId)
        .maybeSingle()
      macrosDone = !!data?.onboarded
    } catch {
      // nutrition_goals missing on fresh schemas — treat as not done.
    }

    const macroTask: OnboardingTask = {
      // 'macros' isn't in the TaskId union (that type lives in the in-flight
      // onboardingTasks.ts); it's only ever used as a React key + dismiss-set
      // entry, so the cast is safe here.
      id: 'macros' as unknown as TaskId,
      title: 'Set your macros',
      description: 'A few quick questions to set your daily calories and macros.',
      href: '/app/fuel/macros/setup',
      done: macrosDone,
      eyebrow: 'two minutes',
      forYou: true,
      destination: { label: 'open', href: '/app/fuel' },
    }

    // Slot it right after "Build your training" so the two core body-setup
    // steps sit together.
    tasks.splice(trainingIdx + 1, 0, macroTask)
  }

  // Every finished-quiz row gets one "open" pill that re-opens the
  // questionnaire (t.href), not the module it feeds — "open Fuel → the Fuel
  // section" read as misleading. Point the destination at the quiz and label
  // it "open". Done here so onboardingTasks.ts (in-flight elsewhere) is
  // untouched. The redundant "edit" link is dropped in OnboardingChecklist.
  return tasks.map(t =>
    t.destination ? { ...t, destination: { label: 'open', href: t.href } } : t,
  )
}

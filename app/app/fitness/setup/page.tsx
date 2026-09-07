import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserPreferences } from '@/lib/preferences'
import SetupWizard from './SetupWizard'
import { hydrateIntakeAnswers } from './presets'
import type { PresetDay, IntakeRecommendation } from './presets'

interface SearchParams {
  intake?: string
  /** Deep-link straight into one day's exercise editor (the swipe-left
   *  affordance on a SessionMenu day tile). Value is the 0-based index of
   *  the day in the saved rotation. */
  editDay?: string
}

/**
 * Fitness setup wizard server page.
 *
 * Tolerates a missing user_profile row — passes null to the wizard which
 * then shows editable inputs in step 3 instead of read-only display. This
 * heals stale data (a user with profiles.onboarded=true but no
 * user_profile row) automatically — wizard collects the missing stats and
 * the server action upserts user_profile on completion.
 */
export default async function FitnessSetupPage({
  searchParams,
}: {
  searchParams?: SearchParams
}) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const [profileRes, settingsRes, prefs] = await Promise.all([
    supabase
      .from('user_profile')
      .select('first_name, sex, height_cm, starting_weight_kg, units')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('training_settings')
      .select('rotation_days, setup_complete, intake_answers, intake_rec')
      .eq('user_id', user.id)
      .maybeSingle(),
    // Goal preferences feed the recommendation engine as a strategic
    // overlay (Goal = intent, intake = capacity). Null when the user
    // hasn't taken the Goal quiz yet — wizard degrades gracefully.
    getUserPreferences(supabase, user.id),
  ])

  if (profileRes.error) {
    console.error('[/app/fitness/setup] user_profile error:', profileRes.error.message, profileRes.error.code)
  }
  if (settingsRes.error) {
    console.error('[/app/fitness/setup] training_settings error:', settingsRes.error.message, settingsRes.error.code)
  }

  const profile = profileRes.data
  const settings = settingsRes.data

  // Focused per-day edit (swipe-left on a day tile). Only a clean integer
  // index is honored; anything else falls through to the normal wizard.
  const editDayRaw = searchParams?.editDay
  const focusDayIdx =
    editDayRaw != null && /^\d+$/.test(editDayRaw) ? parseInt(editDayRaw, 10) : null

  return (
    <SetupWizard
      initialProfile={profile ? {
        firstName: profile.first_name,
        sex: profile.sex as 'M' | 'F',
        heightCm: profile.height_cm,
        startingWeightKg: profile.starting_weight_kg,
        units: profile.units as 'metric' | 'imperial',
      } : null}
      existingDays={(settings?.rotation_days as PresetDay[] | null) ?? null}
      existingIntakeAnswers={hydrateIntakeAnswers(settings?.intake_answers)}
      existingIntakeRec={(settings?.intake_rec as IntakeRecommendation | null) ?? null}
      isEditing={!!settings?.setup_complete}
      autoOpenIntake={searchParams?.intake === 'open'}
      focusDayIdx={focusDayIdx}
      goal={prefs.goal ?? null}
    />
  )
}

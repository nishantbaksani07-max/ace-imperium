'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Units, Sex, FocusArea } from '@/lib/supabase/types'

interface ProfileData {
  firstName: string
  birthday: string
  sex: Sex
  heightCm: number
  startingWeightKg: number
  units: Units
  focusAreas: FocusArea[]
}

// Called after step 4 — all required fields are available, safe to upsert.
export async function saveOnboardingProfile(data: ProfileData): Promise<string | null> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 'Not authenticated'

  const { error } = await supabase.from('user_profile').upsert({
    user_id: user.id,
    first_name: data.firstName.trim(),
    birthday: data.birthday,
    sex: data.sex,
    height_cm: data.heightCm,
    starting_weight_kg: data.startingWeightKg,
    units: data.units,
    focus_areas: data.focusAreas,
    onboarding_step: 4,
    updated_at: new Date().toISOString(),
  })

  if (error) return error.message
  return null
}

// Called when user clicks "let's go" on the done screen. Defense-in-depth:
// re-verifies that all required onboarding fields are present in
// user_profile before flipping the `onboarded` flag, so a client that
// calls this action directly (or that retries after a partial failure)
// can't escape the onboarding gate without actual data behind it. If
// anything is missing, bounce back to /onboarding so the user finishes.
export async function completeOnboarding(): Promise<void> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
    return
  }

  const { data: profile } = await supabase
    .from('user_profile')
    .select('first_name, birthday, sex, height_cm, starting_weight_kg, units, focus_areas')
    .eq('user_id', user.id)
    .maybeSingle()

  const isComplete = !!(
    profile &&
    profile.first_name?.trim() &&
    profile.birthday &&
    profile.sex &&
    profile.height_cm &&
    profile.starting_weight_kg &&
    profile.units &&
    Array.isArray(profile.focus_areas) &&
    profile.focus_areas.length > 0
  )

  if (!isComplete) {
    redirect('/onboarding')
    return
  }

  await Promise.all([
    supabase.from('profiles').update({ onboarded: true }).eq('id', user.id),
    supabase
      .from('user_profile')
      .update({ onboarding_step: 5, updated_at: new Date().toISOString() })
      .eq('user_id', user.id),
  ])

  // First-time experience: hand the new user to the Vitality gem
  // welcome screen instead of the bare dashboard. The /welcome route
  // greets them by name, then drops them at /app on the CTA.
  redirect('/welcome')
}

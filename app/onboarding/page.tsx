import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OnboardingGem } from './OnboardingGem'
import type { InitialData } from './OnboardingGem'

export default async function OnboardingPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarded')
    .eq('id', user.id)
    .single()

  if (profile?.onboarded) redirect('/app')

  // Read any partial profile for tab-close resume support.
  // Only exists if user previously completed step 4.
  const { data: userProfile } = await supabase
    .from('user_profile')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  // If step 4 was completed (all data saved), resume at done screen.
  // Steps 0–3 rely on client-side localStorage.
  const initialStep = userProfile && userProfile.onboarding_step >= 4 ? 5 : 0

  const initialData: InitialData = userProfile
    ? {
        firstName: userProfile.first_name,
        birthday: userProfile.birthday,
        sex: userProfile.sex,
        heightCm: userProfile.height_cm,
        startingWeightKg: userProfile.starting_weight_kg,
        units: userProfile.units,
        focusAreas: Array.isArray(userProfile.focus_areas) ? userProfile.focus_areas : [],
      }
    : {}

  return <OnboardingGem userId={user.id} initialStep={initialStep} initialData={initialData} />
}

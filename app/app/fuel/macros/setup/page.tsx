import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import MacroSetup, { type MacroSetupProfile } from '../MacroSetup'

export const dynamic = 'force-dynamic'

function ageFromBirthday(birthday: string | null | undefined): number {
  if (!birthday) return 25
  const [y, m, d] = birthday.split('-').map(Number)
  if (!y || !m || !d) return 25
  const today = new Date()
  let age = today.getFullYear() - y
  const md = today.getMonth() + 1 - m
  if (md < 0 || (md === 0 && today.getDate() < d)) age -= 1
  return age > 0 && age < 130 ? age : 25
}

/** /app/fuel/macros/setup — the goal + maintenance macro quiz. */
export default async function MacroSetupPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: p }, { data: goals }] = await Promise.all([
    supabase
      .from('user_profile')
      .select('sex, birthday, height_cm, starting_weight_kg, units')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('nutrition_goals')
      .select('onboarded')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const profile: MacroSetupProfile = {
    sex: p?.sex === 'F' ? 'F' : 'M',
    age: ageFromBirthday(p?.birthday),
    heightCm: Number(p?.height_cm) || 175,
    weightKg: Number(p?.starting_weight_kg) || 75,
    units: p?.units === 'imperial' ? 'imperial' : 'metric',
  }

  // Already has a plan? This is a redo, so cancelling returns to Fuel. A
  // first-timer (no plan yet) still exits to the dashboard, since the Fuel
  // tracker is hard-walled until setup is finished.
  return <MacroSetup profile={profile} configured={!!goals?.onboarded} />
}

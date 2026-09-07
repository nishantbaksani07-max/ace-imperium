import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAvatarUrl } from '@/lib/profiles/avatar'
import AccountPage from './AccountPage'

/**
 * /account — Personal settings (name / sex / height / weight / units).
 * Server reads user_profile, hands snapshot to the client component.
 * Saves go through actions.saveProfile and revalidate the same pages
 * that read these fields (setup wizard, splitlog header, dashboard).
 */
export default async function AccountRoute() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Three parallel reads: profile body data (user_profile), billing state
  // (profiles, columns added in BUILD22), and the public maker identity
  // (creator_profiles, Arts District v2).
  const [{ data: profile }, { data: billing }, { data: creator }, avatarUrl] = await Promise.all([
    supabase
      .from('user_profile')
      .select('first_name, sex, height_cm, starting_weight_kg, units')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('tier, subscription_status, current_period_end, stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('creator_profiles')
      .select('username, display_name, bio, link_url, instagram_url')
      .eq('user_id', user.id)
      .maybeSingle(),
    // Separate + guarded so a pre-migration DB (no avatar_url column) never
    // breaks the whole creator read — it just returns null.
    getAvatarUrl(supabase, user.id),
  ])

  // Fallback defaults if onboarding never finished — the page still
  // renders so the user can fill in the data here.
  const initial = {
    firstName: profile?.first_name ?? '',
    sex: (profile?.sex === 'F' ? 'F' : 'M') as 'M' | 'F',
    heightCm: Number(profile?.height_cm ?? 170),
    weightKg: Number(profile?.starting_weight_kg ?? 70),
    units: (profile?.units === 'imperial' ? 'imperial' : 'metric') as 'metric' | 'imperial',
    email: user.email ?? '',
    billing: {
      tier: (billing?.tier ?? 'free') as 'free' | 'plus' | 'pro',
      status: (billing?.subscription_status ?? null) as string | null,
      currentPeriodEnd: (billing?.current_period_end ?? null) as string | null,
      hasCustomer: Boolean(billing?.stripe_customer_id),
    },
    creator: {
      username: (creator?.username ?? null) as string | null,
      displayName: (creator?.display_name ?? '') as string,
      bio: (creator?.bio ?? '') as string,
      linkUrl: (creator?.link_url ?? '') as string,
      instagramUrl: (creator?.instagram_url ?? '') as string,
      avatarUrl: avatarUrl as string | null,
    },
  }

  return <AccountPage initial={initial} />
}

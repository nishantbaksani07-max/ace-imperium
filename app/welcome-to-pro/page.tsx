import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

import WelcomeToPro from './WelcomeToPro'

/**
 * /welcome-to-pro — post-checkout celebration screen.
 *
 * Stripe's success_url redirects here after a successful subscribe.
 * Auth-gated (a guest who bookmarks the URL gets sent to /login) but
 * NOT tier-gated: when Stripe lands the user here, the webhook may
 * still be in flight, so profiles.tier may still read 'free' for a
 * second or two. We trust the redirect — anyone who reached this
 * route via Checkout just paid. Re-running the route after the
 * webhook fires shows the same celebration, which is harmless.
 *
 * Reads first_name so Vitality (the character — see memory:
 * vitality-as-character) can greet the user by name.
 */
export default async function WelcomeToProRoute() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('first_name')
    .eq('user_id', user.id)
    .maybeSingle()

  return <WelcomeToPro firstName={profile?.first_name ?? null} />
}

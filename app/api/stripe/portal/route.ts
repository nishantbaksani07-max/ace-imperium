import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'

// POST /api/stripe/portal
//
// Opens a Stripe Billing Portal session for the authed user so they
// can manage their subscription (update card, cancel, view invoices).
// Returns the hosted portal URL.
//
// 404 if the user has never checked out (no stripe_customer_id) —
// the account page surfaces this as "Upgrade to Pro" instead of
// "Manage subscription" so we shouldn't see this in practice.
export async function POST() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (!profile?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'no_customer' },
      { status: 404 }
    )
  }

  const stripe = getStripe()
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${baseUrl}/account`,
  })

  return NextResponse.json({ url: session.url })
}

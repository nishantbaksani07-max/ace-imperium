import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { getPriceId, getStripe } from '@/lib/stripe/client'

// POST /api/stripe/checkout
//
// Authed users only. Get-or-creates the Stripe Customer for this
// Supabase user, persists customer_id on the profile, opens a
// Stripe Checkout Session for the Pro price, and returns the
// hosted-checkout URL. The client redirects window.location to it.
//
// Already-pro users are short-circuited with 409 so we don't open a
// second subscription on the same customer.
export async function POST() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('stripe_customer_id, tier')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'profile_not_found' }, { status: 404 })
  }

  if (profile.tier === 'pro') {
    return NextResponse.json({ error: 'already_pro' }, { status: 409 })
  }

  const stripe = getStripe()
  const priceId = getPriceId()

  // Get-or-create the Stripe Customer. The single source of truth for
  // the user→customer link is `profiles.stripe_customer_id`. If a
  // future checkout races with a webhook, the unique index on the
  // column keeps us from double-creating.
  let customerId = profile.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id

    const { error: saveError } = await supabase
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id)
    // Soft-fail — the webhook re-reads customer.metadata.supabase_user_id
    // and patches the row if this write didn't land. We log so the
    // failure shows up in Vercel logs.
    if (saveError) {
      console.error('[checkout] save stripe_customer_id failed', saveError)
    }
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    // Land on /welcome-to-pro — the high-emotion celebration screen
    // (confetti + warm welcome + feature ladder). Webhook may or may
    // not have processed by the time we redirect, but the page doesn't
    // depend on tier flipping yet — it trusts the redirect itself as
    // proof of purchase. See app/welcome-to-pro/page.tsx.
    success_url: `${baseUrl}/welcome-to-pro`,
    cancel_url: `${baseUrl}/pricing?checkout=cancelled`,
    // Stripe sends the same metadata back on the Subscription, which
    // is what we read in the webhook to look up the Supabase user.
    metadata: { supabase_user_id: user.id },
    subscription_data: {
      metadata: { supabase_user_id: user.id },
    },
    allow_promotion_codes: false,
  })

  if (!session.url) {
    return NextResponse.json({ error: 'no_session_url' }, { status: 500 })
  }

  return NextResponse.json({ url: session.url })
}

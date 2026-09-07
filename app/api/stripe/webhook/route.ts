import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'

import { getStripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SubscriptionStatus, Tier } from '@/lib/supabase/types'

// POST /api/stripe/webhook
//
// Stripe → Vitality state sync. The route is unauthenticated (Stripe
// signs the request; we verify the signature) and writes via the
// service-role Supabase client because the user has no session here.
//
// Events handled:
//   checkout.session.completed       — first activation; persist
//                                      customer + subscription state.
//   customer.subscription.updated    — renewal, cancel-at-period-end,
//                                      status flip (active → past_due,
//                                      etc.). Re-runs the mirror.
//   customer.subscription.deleted    — subscription fully ended (e.g.
//                                      cancel-at-period-end matured).
//                                      Drops the user back to free.
//   invoice.payment_failed           — Stripe will also fire
//                                      subscription.updated, but the
//                                      payment-failed event arrives
//                                      slightly sooner — we use it to
//                                      flip the status pill on /account
//                                      without waiting on retries.
//
// All handlers are idempotent: events can be re-delivered by Stripe at
// any time, and replaying the same event must converge to the same row.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 })
  }

  const signature = headers().get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 400 })
  }

  // `request.text()` returns the raw body untouched by Next — required
  // for HMAC verification. JSON.parse on the result will lose nothing.
  const rawBody = await request.text()

  const stripe = getStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret)
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed', err)
    return NextResponse.json({ error: 'bad_signature' }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.supabase_user_id ?? null
        const customerId = stringId(session.customer)
        const subscriptionId = stringId(session.subscription)

        if (!userId || !customerId || !subscriptionId) {
          console.error(
            '[stripe-webhook] checkout.session.completed missing fields',
            { sessionId: session.id, userId, customerId, subscriptionId }
          )
          return NextResponse.json({ received: true })
        }

        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        await mirrorSubscription(supabase, userId, customerId, subscription)
        break
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = stringId(subscription.customer)
        if (!customerId) {
          console.error('[stripe-webhook] subscription event missing customer')
          return NextResponse.json({ received: true })
        }

        const userId =
          subscription.metadata?.supabase_user_id ??
          (await lookupUserIdByCustomer(supabase, customerId))
        if (!userId) {
          console.error(
            '[stripe-webhook] no user for subscription',
            subscription.id
          )
          return NextResponse.json({ received: true })
        }

        await mirrorSubscription(supabase, userId, customerId, subscription)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = stringId(invoice.customer)
        if (!customerId) break

        const userId = await lookupUserIdByCustomer(supabase, customerId)
        if (!userId) break

        // Don't drop tier here — Stripe retries the payment. We just
        // surface `past_due` on the status pill. The subscription.updated
        // event that follows will set tier appropriately if Stripe gives
        // up on retries.
        await supabase
          .from('profiles')
          .update({ subscription_status: 'past_due' satisfies SubscriptionStatus })
          .eq('id', userId)
        break
      }

      default:
        // Stripe fires hundreds of event types — ignoring the rest is
        // correct and intentional. Adding cases here is how we'd react
        // to new state in the future.
        break
    }
  } catch (err) {
    console.error('[stripe-webhook] handler failed', err)
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

// ────────────────────────────────────────────────────────────────────

function stringId(
  ref: string | { id: string } | null | undefined
): string | null {
  if (!ref) return null
  return typeof ref === 'string' ? ref : ref.id
}

// In the dahlia API (2026-04-22) `current_period_end` moved from
// Subscription onto SubscriptionItem. We have a single-item
// subscription (the Pro price), so reading the first item is correct.
function periodEndFromSubscription(
  subscription: Stripe.Subscription
): string | null {
  const ts = subscription.items.data[0]?.current_period_end
  return typeof ts === 'number' ? new Date(ts * 1000).toISOString() : null
}

function tierFromStatus(status: Stripe.Subscription.Status): Tier {
  // 'active' and 'trialing' get pro features. Everything else
  // (canceled, unpaid, incomplete*, past_due, paused) drops to free
  // — we trust Stripe's status machine. cancel-at-period-end keeps
  // status === 'active' until the period actually ends, so users
  // who cancel still see Pro until the day Stripe stops billing.
  return status === 'active' || status === 'trialing' ? 'pro' : 'free'
}

async function mirrorSubscription(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  customerId: string,
  subscription: Stripe.Subscription
) {
  const { error } = await supabase
    .from('profiles')
    .update({
      stripe_customer_id: customerId,
      subscription_status: subscription.status,
      current_period_end: periodEndFromSubscription(subscription),
      tier: tierFromStatus(subscription.status),
    })
    .eq('id', userId)

  if (error) {
    // Throw so the top-level catch logs + returns 500 — Stripe will
    // retry, which is what we want.
    throw new Error(`mirror update failed: ${error.message}`)
  }
}

async function lookupUserIdByCustomer(
  supabase: ReturnType<typeof createAdminClient>,
  customerId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  return (data?.id as string | undefined) ?? null
}

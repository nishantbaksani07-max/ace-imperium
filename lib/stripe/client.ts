import 'server-only'

import Stripe from 'stripe'

// Lazy singleton — we don't construct the Stripe client at module-load
// because Next.js evaluates server modules during `next build`, and
// throwing there blocks deploys when STRIPE_SECRET_KEY isn't in the
// build environment. With a getter the throw only happens at first
// request time, which is what we want.

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (_stripe) return _stripe

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Add it to .env.local and Vercel.'
    )
  }

  _stripe = new Stripe(secret, {
    // Pin to the version that ships with stripe-node v22 so the
    // response types we code against match what Stripe sends back.
    // Bump in lock-step with `npm update stripe`.
    apiVersion: '2026-04-22.dahlia',
    typescript: true,
    appInfo: {
      name: 'Vitality',
      url: 'http://localhost:3000',
    },
  })

  return _stripe
}

// Price ID is server-only — checkout sessions are created server-side
// so the client never needs it. Kept in this file so every billing
// route reaches for it the same way.
export function getPriceId(): string {
  const id = process.env.STRIPE_PRICE_ID
  if (!id) {
    throw new Error(
      'STRIPE_PRICE_ID is not set. Run `npx tsx scripts/stripe-bootstrap.ts` ' +
        'to create the product + price, then paste the id into .env.local and Vercel.'
    )
  }
  return id
}

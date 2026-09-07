'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import styles from './pricing.module.css'

interface PricingCtaProps {
  // Server-rendered auth state. Branches the click:
  //   true  → POST /api/stripe/checkout, redirect to Stripe.
  //   false → /signup?next=/pricing so the user can come back here
  //           after creating an account.
  isAuthed: boolean
  // Already-pro users get a "Manage subscription" portal button
  // instead so they don't accidentally start a second sub.
  isPro: boolean
  // Body text — preserves the existing copy on each CTA placement.
  children: React.ReactNode
}

export default function PricingCta({ isAuthed, isPro, children }: PricingCtaProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (busy) return
    setBusy(true)

    if (!isAuthed) {
      // After signup → middleware routes to /onboarding (or /app
      // if already onboarded). Once on /app, the user clicks
      // "Upgrade to Pro" on /account to finish the checkout.
      router.push('/signup?next=/pricing')
      return
    }

    if (isPro) {
      // Already paying — open the portal so they don't double-sub.
      try {
        const res = await fetch('/api/stripe/portal', { method: 'POST' })
        const body = await res.json()
        if (res.ok && body.url) {
          window.location.href = body.url
          return
        }
      } catch {
        /* fall through to /account */
      }
      router.push('/account')
      return
    }

    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
      const body = await res.json()
      if (!res.ok || !body.url) {
        // Fall back to /account so the user can still upgrade from
        // the in-app surface — the error there will be more helpful.
        router.push('/account')
        return
      }
      window.location.href = body.url
    } catch {
      router.push('/account')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className={styles.priceCta}
      onClick={handleClick}
      disabled={busy}
    >
      {busy ? 'opening…' : children}
    </button>
  )
}

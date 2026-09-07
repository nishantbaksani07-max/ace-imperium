import 'server-only'

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import type { Tier } from '@/lib/supabase/types'

// Server-side tier gating. Implements CLAUDE.md hard rule #5:
// every paid feature checks `profiles.tier` against the server before
// responding. The client is never trusted.
//
// Usage in a route handler:
//
//   const gate = await requirePro()
//   if (!gate.ok) return gate.response
//   const { userId } = gate
//   // …pro-only work here, scoped to `userId`
//
// Returns a discriminated union so the route handler short-circuits
// with the correct 401/402/404 response without the helper having to
// know whether the caller is a route handler, action, or RSC.

export type TierGate =
  | { ok: true; userId: string; tier: Tier }
  | { ok: false; response: NextResponse }

// Hierarchy: free < plus < pro. A user with tier 'pro' satisfies a
// `plus` gate; a user with tier 'plus' does not satisfy a `pro` gate.
const TIER_ORDER: Record<Tier, number> = {
  free: 0,
  plus: 1,
  pro: 2,
}

function meetsMin(actual: Tier, min: Tier): boolean {
  return TIER_ORDER[actual] >= TIER_ORDER[min]
}

export async function requireTier(min: Exclude<Tier, 'free'>): Promise<TierGate> {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    }
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('tier')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'profile_not_found' },
        { status: 404 }
      ),
    }
  }

  const tier = profile.tier as Tier
  if (!meetsMin(tier, min)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `requires_${min}` },
        { status: 402 }
      ),
    }
  }

  return { ok: true, userId: user.id, tier }
}

export function requirePro() {
  return requireTier('pro')
}

// Auth-only gate: same shape as requireTier, but never blocks on tier. Use this
// to temporarily open a feature to every signed-in user while we decide what is
// actually Pro. User scoping (RLS) is preserved via the returned userId. To
// re-gate a route, swap this call back to requirePro().
export async function requireUser(): Promise<TierGate> {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('tier')
    .eq('id', user.id)
    .single()

  return { ok: true, userId: user.id, tier: (profile?.tier as Tier) ?? 'free' }
}

export function requirePlus() {
  return requireTier('plus')
}

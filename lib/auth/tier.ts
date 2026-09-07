import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { SubscriptionStatus, Tier } from '@/lib/supabase/types'

// Client-agnostic tier comparison + gate. The cookie-bound web wrapper lives in
// `require-tier.ts`; the headless MCP route uses `assertPro` directly with a
// per-request RLS client. Both share `meetsTier`, so the web and the MCP path
// can never drift on what "pro" means (CLAUDE.md #5: tier gating is server-side).

// Hierarchy: free < plus < pro. A `pro` user satisfies a `plus` gate.
const TIER_ORDER: Record<Tier, number> = { free: 0, plus: 1, pro: 2 }

export function meetsTier(actual: Tier, min: Exclude<Tier, 'free'>): boolean {
  return TIER_ORDER[actual] >= TIER_ORDER[min]
}

// Terminal Stripe states that must deny even if `tier` still reads 'pro'. This
// is the webhook-lag defence the MCP path needs: an MCP credential is long-lived
// relative to a web session, so a lapsed subscriber could otherwise keep reading
// data in the window between Stripe canceling and the webhook flipping `tier`.
// These columns are written by the Stripe webhook — reading them costs no Stripe
// call. The web gate skips this check (its sessions are short).
const TERMINAL: ReadonlySet<SubscriptionStatus> = new Set<SubscriptionStatus>([
  'canceled',
  'unpaid',
  'incomplete_expired',
  'past_due',
])

export type GateResult =
  | { ok: true; tier: Tier }
  | { ok: false; reason: 'tier' | 'subscription'; tier: Tier }
  // Infra failure (DB/RLS), NOT a genuine free user. Map to a retryable 503 so a
  // blip never tells a paying customer to pay again, and monitoring sees it.
  | { ok: false; reason: 'error' }

/**
 * Assert the user behind `db` meets the `pro` tier.
 *
 * `db` must already be scoped to `userId` (RLS via the user's own JWT, or a
 * cookie-bound server client). The read is `.eq('id', userId)` for defence in
 * depth — harmless under RLS, correct without it.
 *
 * With `opts.strict` (the MCP path) it additionally denies on a terminal
 * `subscription_status` or a past `current_period_end`.
 */
export async function assertPro(
  db: SupabaseClient,
  userId: string,
  opts: { strict?: boolean } = {},
): Promise<GateResult> {
  const { data, error } = await db
    .from('profiles')
    .select('tier, subscription_status, current_period_end')
    .eq('id', userId)
    .single()

  if (error) return { ok: false, reason: 'error' }
  if (!data) return { ok: false, reason: 'tier', tier: 'free' }

  const tier = (data.tier as Tier) ?? 'free'
  if (!meetsTier(tier, 'pro')) return { ok: false, reason: 'tier', tier }

  if (opts.strict) {
    const status = data.subscription_status as SubscriptionStatus | null
    const periodEnd = data.current_period_end
      ? Date.parse(data.current_period_end as string)
      : null
    const lapsed =
      (status != null && TERMINAL.has(status)) ||
      (periodEnd !== null && Number.isFinite(periodEnd) && periodEnd < Date.now())
    if (lapsed) return { ok: false, reason: 'subscription', tier }
  }

  return { ok: true, tier }
}

import type { Tier } from '@/lib/supabase/types'

// Whole-app paywall: free signup, pay (Pro) to actually use the app. Enforced
// once at the /app layout (CLAUDE.md #5 — server-side). Kept as PURE functions
// (no 'server-only', no env access) so the gate logic is unit-tested in isolation;
// `readPaywallConfig` is the only env touch.
//
// SAFE ROLLOUT: the gate is OFF unless PAYWALL_ENABLED === 'true'. So merging/
// deploying this changes nothing until it's deliberately switched on AND the comp
// list is set — no risk of locking out the team or testers on deploy.

export interface PaywallConfig {
  /** Master switch. When false, every signed-in user has full access. */
  enabled: boolean
  /** Lowercased emails that get Pro access without paying (you, Sam, testers). */
  compEmails: string[]
}

/** Read the paywall config from an env-like bag (process.env in production). */
export function readPaywallConfig(env: Record<string, string | undefined>): PaywallConfig {
  return {
    enabled: env.PAYWALL_ENABLED === 'true',
    compEmails: (env.PAYWALL_COMP_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  }
}

/**
 * May this signed-in user use the app? True when: the paywall is off; OR they're
 * Pro; OR their email is comped. A `free`/`plus` (non-comped) user is blocked
 * while the paywall is on — "Pro to enter".
 */
export function appAccessAllowed(args: {
  config: PaywallConfig
  tier: Tier | null
  email: string | null
}): boolean {
  if (!args.config.enabled) return true
  if (args.tier === 'pro') return true
  const email = (args.email ?? '').trim().toLowerCase()
  if (email && args.config.compEmails.includes(email)) return true
  return false
}

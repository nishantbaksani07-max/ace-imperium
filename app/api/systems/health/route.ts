/**
 * SYSTEMS HEALTH - "every system, and whether it's alive."
 *
 * Born the day a prod ANTHROPIC_API_KEY sat empty for weeks and the food
 * scanner + AI coach silently died because NO surface showed system health.
 * This route is the honest mirror: it reports presence of the env keys each
 * subsystem depends on. It NEVER calls an external API (slow + costly) and
 * NEVER prints a key value - only whether it is present and non-empty.
 *
 * Auth-gated by the same pattern as every other route handler: a logged-in
 * user, or 401.
 */
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type CheckStatus = 'ok' | 'degraded' | 'down' | 'unknown'

interface SystemCheck {
  label: string
  ok: boolean
  note?: string
}

interface SystemHealth {
  key: string
  name: string
  detail: string
  status: CheckStatus
  checks: SystemCheck[]
}

/** A key counts as present only when it exists AND is non-empty after trim.
 *  The whole reason this wing exists: an empty string is NOT a set key. */
function keyPresent(name: string): boolean {
  const v = process.env[name]
  return typeof v === 'string' && v.trim().length > 0
}

/** A single env-presence check, phrased for a human, never leaking the value. */
function envCheck(envName: string, label: string): SystemCheck {
  const ok = keyPresent(envName)
  return {
    label,
    ok,
    note: ok ? undefined : `${envName} is missing or empty in this environment`,
  }
}

/** Roll a system's checks into one status: all ok => ok, none ok => down,
 *  some ok => degraded. Env-presence only, so there is no 'unknown' path here. */
function rollup(checks: SystemCheck[]): CheckStatus {
  const okCount = checks.filter((c) => c.ok).length
  if (okCount === checks.length) return 'ok'
  if (okCount === 0) return 'down'
  return 'degraded'
}

function buildSystems(): SystemHealth[] {
  const anthropic = () => envCheck('ANTHROPIC_API_KEY', 'Claude reachable (ANTHROPIC_API_KEY present)')

  const systems: Omit<SystemHealth, 'status'>[] = [
    {
      key: 'food-scanner',
      name: 'Food scanner',
      detail: 'Reads a photo of a meal into macros. Needs Claude to see it and USDA to price it.',
      checks: [
        anthropic(),
        envCheck('USDA_API_KEY', 'USDA food database (USDA_API_KEY present)'),
      ],
    },
    {
      key: 'ai-food-coach',
      name: 'AI food coach',
      detail: 'Scores meals and coaches your macros. Runs on Claude.',
      checks: [anthropic()],
    },
    {
      key: 'vee-mentor',
      name: 'Vee mentor',
      detail: 'The chat mentor and daily triage. Runs on Claude.',
      checks: [anthropic()],
    },
    {
      key: 'wearable-sync',
      name: 'Wearable sync',
      detail: 'The nightly cron that pulls WHOOP, Oura and Fitbit. Needs its shared secret.',
      checks: [envCheck('CRON_SECRET', 'Nightly cron can authenticate (CRON_SECRET present)')],
    },
  ]

  return systems.map((sys) => ({ ...sys, status: rollup(sys.checks) }))
}

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  return Response.json({ systems: buildSystems() })
}

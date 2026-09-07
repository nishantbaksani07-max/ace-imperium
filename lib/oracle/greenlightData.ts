/**
 * The gather for the green-light oracle — the I/O shell around the pure engine.
 *
 * Same shape as lib/goals/driftData.ts and lib/vitals/signalData.ts: fetch a
 * compact slice of the user's data, run the pure detectors, return the one
 * thing to surface. NEVER throws — a missing signal yields no notice, never a
 * crash on the Vee surface.
 *
 * It reuses the MCP read layer by wrapping the app's RLS-scoped server client as
 * a VitalityDb (the same {db, userId} contract the MCP tools use), so there is
 * one query layer, not two.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { VitalityDb } from '@/mcp/src/supabase'
import { getLiftProgression, getWeights, getMoodDaily, getSleep } from '@/mcp/src/queries'
import { getBigGoals } from '@/lib/goals/repo'
import {
  liftStallConcerns,
  weightDriftConcern,
  moodLowConcern,
  recoveryDipConcern,
  type LiftProgressionInput,
} from './concerns'
import { greenLight, type ActiveGoal, type Convergence, type DomainConcern, type Push } from './greenlight'

/** Map the goal's stored push cadence to the engine's tone scale. */
function mapPush(pushLevel: string): Push {
  switch (pushLevel) {
    case 'silent': return 'silent'
    case 'push': return 'push'
    case 'gentle': return 'gentle'
    default: return 'normal' // 'balanced' and anything unexpected
  }
}

/**
 * Run the oracle for a user and return the single notice to surface, or null.
 *
 * v1 wires the train path (a goal-bearing lift that has plateaued). More domains
 * (fuel, recovery, mood, weight, finance) plug in as additional concerns; once
 * two converge, greenLight ranks that premium convergence above any single one.
 */
export async function gatherGreenLight(
  supabase: SupabaseClient,
  userId: string,
  todayKey: string,
): Promise<Convergence | null> {
  // The app and the mcp package each install @supabase/supabase-js, so their
  // SupabaseClient types are nominally distinct copies of the same class. Cast
  // across that duplicate-package boundary; it is the same client at runtime.
  const v: VitalityDb = {
    db: supabase as unknown as VitalityDb['db'],
    userId,
    mode: 'user',
    scopes: ['mcp:read'],
  }
  try {
    const [bigGoals, prog, weights, mood, sleep] = await Promise.all([
      getBigGoals(supabase, userId), // app repo: real row ids + AI-tidied titles
      getLiftProgression(v),
      getWeights(v, 30),
      getMoodDaily(v, 30),
      getSleep(v, 14),
    ])

    const goals: ActiveGoal[] = bigGoals
      .filter((g) => g.status === 'active')
      .map((g) => ({
        id: g.id, // real vitality_goals row id — ready for the cooldown ledger
        title: g.cleanTitle ?? g.title, // tidied title matches lifts more cleanly
        push: mapPush(g.push),
      }))

    const lifts: LiftProgressionInput[] = prog.lifts

    // Each domain contributes its own already-gated concerns. Anchored ones (train,
    // weight) can carry the goal; agnostic ones (mood, recovery) add a converging
    // domain. greenLight needs >=1 anchored + the domain count to fire.
    const concerns: DomainConcern[] = [
      ...liftStallConcerns(goals, lifts),
      ...weightDriftConcern(goals, weights.weeklyRate, weights.latestKg),
      ...moodLowConcern(mood),
      ...recoveryDipConcern(sleep.entries),
      // future: fuelQuietConcern (needs the nutrition logged-day window confirmed)
    ]

    // minDomains:1 so a single strong goal-tied stall (the loved "bench vs 225"
    // notice) surfaces today; a genuine 2+ domain convergence outranks it on
    // confidence once more signals are wired.
    return greenLight(concerns, goals, { minDomains: 1 })
  } catch {
    return null
  }
}

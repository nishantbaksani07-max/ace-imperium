/**
 * computeVitalityScore — the server entrypoint for the Vitality Score. Creates
 * the RLS-scoped server Supabase client and runs the registered contributors
 * through the safety-netted orchestration in lib/vitality/score.ts. Lives in its
 * own file (not score.ts) so the server-only `next/headers` dependency pulled in
 * by createClient never leaks into the Jest-imported pure engine module.
 */
import { createClient } from '@/lib/supabase/server'
import { getLocalDateKey } from '@/lib/dates'
import { trainContributor } from '@/lib/vitality/contributors/train'
import { fuelContributor } from '@/lib/vitality/contributors/fuel'
import { tileStreamsContributor } from '@/lib/vitality/contributors/tileStreams'
import { runContributors, type Contributor, type ScoreContext, type VitalityScore } from '@/lib/vitality/score'

/** The registry. Add a module by appending its contributor — nothing else
 *  changes. 'tiles' is ONE slot for ALL user-built tile streams (report
 *  contract), so tiles together weigh as much as Train, as much as Fuel. */
const CONTRIBUTORS: Contributor[] = [trainContributor, fuelContributor, tileStreamsContributor]

export async function computeVitalityScore(userId: string): Promise<VitalityScore> {
  const ctx: ScoreContext = { supabase: createClient(), userId }
  return runContributors(ctx, CONTRIBUTORS, getLocalDateKey())
}

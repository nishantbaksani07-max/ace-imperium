'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getLocalDateKey } from '@/lib/dates'
import type { WeightEntry } from './types'

/**
 * Server actions for the Progress module's weight log.
 *
 * RLS on `public.weights` keeps every read/write scoped to auth.uid().
 * The table has a unique constraint on (user_id, date) — we use Supabase
 * upsert with onConflict so logging twice on the same day overwrites
 * rather than failing.
 *
 * All weights are persisted as kilograms regardless of the user's display
 * unit. UI converts at the boundary (same pattern as lib/units.ts).
 */

export interface SaveWeightInput {
  /** Canonical kilograms. */
  weightKg: number
  /** Optional override; defaults to local today via getLocalDateKey(). */
  dateKey?: string
}

export interface SaveWeightResult {
  ok: boolean
  entry?: WeightEntry
  error?: string
}

export async function saveWeight(input: SaveWeightInput): Promise<SaveWeightResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0 || input.weightKg > 500) {
    return { ok: false, error: 'invalid_weight' }
  }

  const dateKey = input.dateKey ?? getLocalDateKey()

  const { data, error } = await supabase
    .from('weights')
    .upsert(
      { user_id: user.id, date: dateKey, weight_kg: input.weightKg },
      { onConflict: 'user_id,date' },
    )
    .select('date, weight_kg')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' }

  revalidatePath('/app/fitness/progress')
  return {
    ok: true,
    entry: { dateKey: data.date as string, weightKg: Number(data.weight_kg) },
  }
}

export interface DeleteWeightResult {
  ok: boolean
  error?: string
}

export async function deleteWeight(dateKey: string): Promise<DeleteWeightResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  const { error } = await supabase
    .from('weights')
    .delete()
    .eq('user_id', user.id)
    .eq('date', dateKey)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/app/fitness/progress')
  return { ok: true }
}

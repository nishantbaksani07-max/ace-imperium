'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Sex, Units } from '@/lib/supabase/types'

export interface UpdateAccountProfileInput {
  weightKg?: number
  sex?: Sex
  units?: Units
}

export interface UpdateAccountProfileResult {
  ok: boolean
  error?: string
}

/**
 * Patches the canonical user_profile from the Water settings modal.
 *
 * Only forwards the fields the modal owns (weight, sex, units). RLS
 * keeps the write scoped to auth.uid(). Caller updates UI optimistically
 * and revalidates the route so other modules (fitness/log, score) see
 * fresh values on next render.
 */
export async function updateAccountProfile(
  input: UpdateAccountProfileInput,
): Promise<UpdateAccountProfileResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'Not authenticated' }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.weightKg !== undefined) {
    if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
      return { ok: false, error: 'Invalid weight' }
    }
    patch.starting_weight_kg = input.weightKg
  }
  if (input.sex !== undefined) patch.sex = input.sex
  if (input.units !== undefined) patch.units = input.units

  if (Object.keys(patch).length === 1) {
    return { ok: true }
  }

  const { error } = await supabase
    .from('user_profile')
    .update(patch)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/app/fuel/water')
  return { ok: true }
}

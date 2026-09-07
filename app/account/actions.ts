'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateUsername } from '@/lib/profiles/username'
import { normalizeExternalUrl } from '@/lib/profiles/links'

export interface SaveProfileInput {
  firstName?: string
  sex?: 'M' | 'F'
  heightCm?: number
  weightKg?: number
  units?: 'metric' | 'imperial'
}

export interface SaveProfileResult {
  ok: boolean
  error?: string
}

/**
 * Update the user's personal profile (user_profile row).
 *
 * Single source of truth for: name, sex, height, current bodyweight, unit
 * preference. Onboarding seeds this; the /app/account page lets the user
 * edit any field on demand. Downstream features (fitness setup wizard
 * starting-weight computation, splitlog unit toggle, etc.) read from
 * here instead of re-asking.
 *
 * Only updates fields explicitly provided — partial updates are safe.
 */
export async function saveProfile(input: SaveProfileInput): Promise<SaveProfileResult> {
  const supabase = createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'unauthorized' }

  const patch: Record<string, unknown> = {}
  if (input.firstName !== undefined) patch.first_name = input.firstName
  if (input.sex !== undefined) patch.sex = input.sex
  if (input.heightCm !== undefined) patch.height_cm = input.heightCm
  if (input.weightKg !== undefined) patch.starting_weight_kg = input.weightKg
  if (input.units !== undefined) patch.units = input.units

  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await supabase
    .from('user_profile')
    .update(patch)
    .eq('user_id', user.id)
  if (error) return { ok: false, error: error.message }

  // Revalidate anywhere the profile shows up so updates flow without a
  // full reload.
  revalidatePath('/account')
  revalidatePath('/app')
  revalidatePath('/app/fitness/setup')
  revalidatePath('/app/fitness/log')
  revalidatePath('/app/fitness/log/[day]', 'page')
  return { ok: true }
}

// ── Public maker profile (Arts District identity, v2) ──────────────────────

export interface SaveCreatorProfileInput {
  /** Only honored on first claim — the handle is a one-way door after that. */
  username?: string
  displayName?: string
  bio?: string
  linkUrl?: string
  instagramUrl?: string
}

export interface SaveCreatorProfileResult {
  ok: boolean
  error?: string
  /** the live handle after the save (so the client can show the URL) */
  username?: string
}

/**
 * Create or update the user's public `creator_profiles` row.
 *
 * Username is a ONE-WAY DOOR: it can be set once (at first claim), then it's
 * locked — published-tile bylines and shared /u/<handle> links would rot if it
 * changed. display_name / bio / links stay editable forever.
 *
 * Writes go through RLS (self-only). The public /u/<handle> page reads this
 * table with the anon role; it holds only public fields, so nothing sensitive
 * leaks (billing lives in `profiles`, untouched).
 */
export async function saveCreatorProfile(
  input: SaveCreatorProfileInput
): Promise<SaveCreatorProfileResult> {
  const supabase = createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'unauthorized' }

  // Current handle (if any) — decides claim vs edit, and enforces one-way.
  const { data: existing } = await supabase
    .from('creator_profiles')
    .select('username')
    .eq('user_id', user.id)
    .maybeSingle()

  // Normalize the optional links — empty clears, non-empty must be a real URL.
  const linkUrl = normalizeLinkField(input.linkUrl)
  if (linkUrl.error) return { ok: false, error: linkUrl.error }
  const instagramUrl = normalizeLinkField(input.instagramUrl)
  if (instagramUrl.error) return { ok: false, error: instagramUrl.error }

  const displayName = input.displayName?.trim().slice(0, 50) || null
  const bio = input.bio?.trim().slice(0, 240) || null

  if (existing) {
    // Edit path — username is locked, never written.
    const { error } = await supabase
      .from('creator_profiles')
      .update({
        display_name: displayName,
        bio,
        link_url: linkUrl.value,
        instagram_url: instagramUrl.value,
      })
      .eq('user_id', user.id)
    if (error) return { ok: false, error: error.message }
    revalidatePath(`/u/${existing.username}`)
    return { ok: true, username: existing.username }
  }

  // First claim — username is required and must be valid.
  const check = validateUsername(input.username ?? '')
  if (!check.ok) return { ok: false, error: check.error }
  const username = check.value!

  const { error } = await supabase
    .from('creator_profiles')
    .insert({
      user_id: user.id,
      username,
      display_name: displayName,
      bio,
      link_url: linkUrl.value,
      instagram_url: instagramUrl.value,
    })

  if (error) {
    // 23505 = unique_violation → the handle is taken by someone else.
    if (error.code === '23505') {
      return { ok: false, error: 'That username is taken. Try another.' }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath(`/u/${username}`)
  return { ok: true, username }
}

// ── Maker avatar (profile photo) ───────────────────────────────────────────

export interface SaveAvatarUrlResult {
  ok: boolean
  error?: string
}

/**
 * Persist the public URL of the user's uploaded avatar onto their
 * `creator_profiles` row. The actual image bytes are uploaded to the `avatars`
 * Storage bucket client-side (folder-per-user RLS: `avatars/<uid>/…`); this only
 * records the resulting public URL (or clears it when `url` is null).
 *
 * The avatar lives on the public identity row, which requires a claimed handle,
 * so this updates an EXISTING row only — there's nothing to create here.
 */
export async function saveAvatarUrl(url: string | null): Promise<SaveAvatarUrlResult> {
  const supabase = createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'unauthorized' }

  const value = url?.trim() || null
  if (value && value.length > 400) return { ok: false, error: 'That image URL is too long.' }

  const { data: existing } = await supabase
    .from('creator_profiles')
    .select('username')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!existing) return { ok: false, error: 'Claim your handle first, then add a photo.' }

  const { error } = await supabase
    .from('creator_profiles')
    .update({ avatar_url: value })
    .eq('user_id', user.id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/account')
  revalidatePath('/app')
  revalidatePath(`/u/${existing.username}`)
  return { ok: true }
}

/** Normalize an optional external-link field: empty → null; bad → error. */
function normalizeLinkField(raw: string | undefined): { value: string | null; error?: string } {
  const trimmed = raw?.trim()
  if (!trimmed) return { value: null }
  const normalized = normalizeExternalUrl(trimmed)
  if (!normalized) return { value: null, error: 'That link doesn’t look like a web address.' }
  // normalizeExternalUrl may prepend "https://" (+8 chars), so guard the DB's
  // 400-char CHECK here with a friendly message instead of a raw constraint error.
  if (normalized.length > 400) return { value: null, error: 'That link is too long.' }
  return { value: normalized }
}

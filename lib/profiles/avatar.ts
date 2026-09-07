import type { SupabaseClient } from '@supabase/supabase-js'

/** The Storage bucket that holds maker avatars (and, later, custom dashboard
 *  backgrounds). Objects live at `avatars/<uid>/…`; public-read, owner-write. */
export const AVATAR_BUCKET = 'avatars'

/** The single, always-overwritten object path for a user's avatar. A fixed key
 *  (no extension — content-type is set on upload) means each new photo replaces
 *  the old one, so a user never accumulates orphaned files. */
export function avatarObjectPath(userId: string): string {
  return `${userId}/avatar`
}

/**
 * Read a user's public avatar URL from `creator_profiles.avatar_url`.
 *
 * Deliberately resilient: `avatar_url` is added by the 20260701 migration, so
 * until that lands on a given database this returns null instead of surfacing a
 * "column does not exist" error — the avatar simply falls back to the initial,
 * and every caller keeps rendering. Once the migration is applied it lights up
 * with no code change.
 */
export async function getAvatarUrl(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('creator_profiles')
      .select('avatar_url')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) return null
    return ((data?.avatar_url as string | null | undefined) ?? null) || null
  } catch {
    return null
  }
}

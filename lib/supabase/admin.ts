import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS. Use ONLY in code paths that
// can't carry a user session (webhooks, cron jobs, admin scripts).
// Never import this from a request handler that already has a
// user-scoped supabase client available — bypassing RLS by accident
// is exactly the multi-tenant footgun CLAUDE.md hard rule #3 warns
// about.

// The codebase doesn't ship a generated `Database` schema yet (see
// lib/supabase/types.ts), so the strict default generic of
// supabase-js v2 collapses every table to `never`. Matching the
// `@supabase/ssr` server client (which defaults to a permissive
// schema) keeps writes ergonomic until we run `supabase gen types`.
type AdminClient = ReturnType<typeof createSupabaseClient<any, 'public', any>>

let _admin: AdminClient | null = null

export function createAdminClient(): AdminClient {
  if (_admin) return _admin

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY ' +
        'for admin client.'
    )
  }

  _admin = createSupabaseClient<any, 'public', any>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return _admin
}

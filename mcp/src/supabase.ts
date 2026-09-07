// Supabase access for the Vitality MCP.
//
// Two auth modes, resolved in env.ts:
//   • user    — anon key + email/password sign-in. Every query runs under the
//               user's own row-level-security context (exactly like the site).
//               The server can structurally only ever see this user's data.
//   • service — service-role key + explicit user id. Bypasses RLS, so we scope
//               EVERY query to that user id by hand. Opt-in, local-only.
//
// The client + resolved user id are cached: we authenticate once, then reuse the
// session for every tool call in the process lifetime.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from './env.js';

export interface VitalityDb {
  db: SupabaseClient;
  userId: string;
  mode: 'user' | 'service';
  /** Granted capabilities (OAuth scopes). Write tools require 'mcp:write'.
   *  Local CLI sessions get full control; hosted credentials carry whatever the
   *  user consented to (read-only connections never gain write on refresh). */
  scopes: string[];
}

/** Scope a write tool requires. Mirrors `MCP_WRITE_SCOPE` in the server-only
 *  `app/api/mcp/oauth/shared.ts` (the two can't share an import across the
 *  server-only boundary — keep the literals identical). */
export const WRITE_SCOPE = 'mcp:write';

/** Marker the hosted auth layer swaps in for `mcp:write` when the global write
 *  kill-switch (`MCP_WRITE_ENABLED=false`) is on. It lets `requireWrite` tell a
 *  temporary server-side pause apart from a credential that never granted write,
 *  so the error says "try again later" instead of sending the user into a
 *  disconnect/re-Allow loop that cannot help. Mirrors the literal in
 *  `app/api/mcp/auth.ts` (server-only boundary; keep the literals identical). */
export const WRITE_PAUSED_SCOPE = 'mcp:write:paused';

/** Full local control — the stdio CLI is the user reading/writing their own data. */
export const LOCAL_SCOPES = ['mcp:read', WRITE_SCOPE];

let cached: VitalityDb | null = null;
let pending: Promise<VitalityDb> | null = null;

async function connect(): Promise<VitalityDb> {
  const env = getEnv();

  if (env.authMode === 'service') {
    const db = createClient(env.supabaseUrl, env.serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return { db, userId: env.userId!, mode: 'service', scopes: LOCAL_SCOPES };
  }

  // user mode
  const db = createClient(env.supabaseUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: true },
  });
  const { data, error } = await db.auth.signInWithPassword({
    email: env.userEmail!,
    password: env.userPassword!,
  });
  if (error || !data.user) {
    console.error('[vitality-mcp] sign-in failed:', error?.message ?? 'no user returned');
    throw new Error(`Vitality sign-in failed: ${error?.message ?? 'unknown error'}`);
  }
  console.error(`[vitality-mcp] signed in as ${data.user.email} (RLS-scoped).`);
  return { db, userId: data.user.id, mode: 'user', scopes: LOCAL_SCOPES };
}

/** Get the authenticated client + user id. Authenticates once, then caches.
 *  This is the STDIO/local path: one process, one user, cached for its lifetime. */
export function getDb(): Promise<VitalityDb> {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  pending = connect()
    .then((resolved) => {
      cached = resolved;
      pending = null;
      return resolved;
    })
    .catch((err) => {
      pending = null;
      throw err;
    });
  return pending;
}

/**
 * Build a per-request, RLS-scoped client from a caller's Supabase access token.
 *
 * This is the HOSTED path: no singleton, no cache, no sign-in, no env coupling
 * (so it is safe to import inside Next.js, which has its own env). The user's
 * JWT is attached as a Bearer header, so `auth.uid()` resolves to that user and
 * every query the tools run is confined to their own rows by RLS — exactly like
 * the website. One server process can safely serve many users, one per request.
 *
 * Never pass the service-role key here: the hosted path is RLS-only by design.
 */
export function dbForAccessToken(opts: {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  userId: string;
  scopes: string[];
}): VitalityDb {
  const db = createClient(opts.supabaseUrl, opts.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${opts.accessToken}` } },
  });
  return { db, userId: opts.userId, mode: 'user', scopes: opts.scopes };
}

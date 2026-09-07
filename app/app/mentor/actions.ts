'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { writeFact, deleteFact } from '@/lib/memory/userFacts'
import { isContextKind, type ContextArea } from './contextStubs'
import { MOOD_SOURCE, MOOD_KIND, formatMoodBody, localDateKey, localDateKeyAt } from './moodData'
import type { ContextFact, Note } from './types'

export async function addNote(body: string): Promise<{ ok: true; note: Note } | { ok: false; error: string }> {
  const trimmed = body.trim()
  if (!trimmed) return { ok: false, error: 'empty_body' }
  if (trimmed.length > 4000) return { ok: false, error: 'too_long' }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  const { data, error } = await supabase
    .from('notes')
    .insert({ user_id: user.id, body: trimmed })
    .select('id, body, created_at')
    .single()

  if (error || !data) {
    // The most common "could not save" failure pre-launch is the BUILD16
    // migration not having been applied to the live DB yet — Postgres
    // returns "relation \"public.notes\" does not exist" (code 42P01).
    // Detect and bubble up a clearer message so devs know exactly what
    // to fix.
    const code = (error as { code?: string } | null)?.code
    const msg = error?.message ?? 'insert_failed'
    if (code === '42P01' || /does not exist/i.test(msg)) {
      return { ok: false, error: 'notes_table_missing' }
    }
    // Never leak raw Postgres text to the client (mirrors goalActions.writeError):
    // log it server-side and return a stable code the UI can map.
    if (process.env.NODE_ENV !== 'production') console.error('[mentor/actions] addNote failed:', code, msg)
    return { ok: false, error: 'write_failed' }
  }

  revalidatePath('/app/mentor')
  return { ok: true, note: data as Note }
}

export async function deleteNote(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    if (process.env.NODE_ENV !== 'production') console.error('[mentor/actions] deleteNote failed:', error.code, error.message)
    return { ok: false, error: 'delete_failed' }
  }

  revalidatePath('/app/mentor')
  return { ok: true }
}

/**
 * Record the split day the user confirmed they're training today. Upserts the
 * training_day row (shared source of truth) and writes an ephemeral user_fact
 * that expires at the end of the local day, so the chat route knows the day for
 * the rest of today with no extra wiring. Never throws to the client.
 */
export async function confirmTrainingDay(
  date: string,
  dayName: string,
): Promise<{ ok: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const { error } = await supabase
    .from('training_day')
    .upsert({ user_id: user.id, date, day_name: dayName, confirmed: true }, { onConflict: 'user_id,date' })
  if (error) return { ok: false }

  // Ephemeral brain fact: expires at local end-of-day (date is YYYY-MM-DD local).
  const expiresAt = new Date(`${date}T23:59:59`).toISOString()
  await writeFact(supabase, user.id, {
    source: 'train',
    kind: 'event',
    body: dayName === 'Rest' ? 'Resting today (no training day)' : `Training ${dayName} today`,
    salience: 0.5,
    expiresAt,
  })

  revalidatePath('/app/mentor')
  return { ok: true }
}

// ── Mental-health context store ("Folded Notes") ──
// Each finished sentence is one durable user_facts row Vee reads everywhere
// (in-app chat + MCP vitality_user_facts). source='mental_health', kind=<area>.
const CONTEXT_SOURCE = 'mental_health'

export async function saveContextFact(
  area: ContextArea,
  body: string,
): Promise<{ ok: true; fact: ContextFact } | { ok: false; error: string }> {
  const trimmed = body.trim()
  if (!trimmed) return { ok: false, error: 'empty_body' }
  if (trimmed.length > 600) return { ok: false, error: 'too_long' }
  if (!isContextKind(area)) return { ok: false, error: 'bad_area' }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  // Insert directly (not writeFact) so we get the row id back for the optimistic UI.
  const { data, error } = await supabase
    .from('user_facts')
    .insert({ user_id: user.id, source: CONTEXT_SOURCE, kind: area, body: trimmed, salience: 0.7, expires_at: null })
    .select('id, body')
    .single()

  if (error || !data) {
    const code = (error as { code?: string } | null)?.code
    if (code === '42P01') return { ok: false, error: 'user_facts_table_missing' }
    if (process.env.NODE_ENV !== 'production') console.error('[mentor/actions] addContextFact failed:', code, error?.message)
    return { ok: false, error: 'write_failed' }
  }

  revalidatePath('/app/mentor')
  return { ok: true, fact: { id: data.id as string, area, body: data.body as string } }
}

export async function deleteContextFact(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }
  const res = await deleteFact(supabase, user.id, id)
  if (!res.ok) return { ok: false, error: 'delete_failed' }
  revalidatePath('/app/mentor')
  return { ok: true }
}

// One-tap daily mood. Stored as a user_facts row (no new table) so Vee reads it.
// Upserts the day: deletes today's prior mood rows, then inserts the new score.
// `client` carries the USER'S day: their local day key + tz offset (from
// Date#getTimezoneOffset), so "today" is the user's today, not the UTC server's.
// An evening tap west of UTC must never delete yesterday's real mood.
export async function saveMood(
  score: number,
  client?: { dayKey: string; tzOffsetMin: number },
): Promise<{ ok: boolean }> {
  if (!Number.isInteger(score) || score < 1 || score > 5) return { ok: false }
  const clientOk = !!client
    && /^\d{4}-\d{2}-\d{2}$/.test(client.dayKey)
    && Number.isInteger(client.tzOffsetMin)
    && Math.abs(client.tzOffsetMin) <= 16 * 60
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const today = clientOk ? client!.dayKey : localDateKey()
  const dayOf = (iso: string) => (clientOk ? localDateKeyAt(iso, client!.tzOffsetMin) : localDateKey(iso))
  const { data: existing } = await supabase
    .from('user_facts')
    .select('id, created_at')
    .eq('user_id', user.id)
    .eq('kind', MOOD_KIND)
  const dupes = (existing ?? [])
    .filter(r => dayOf(r.created_at as string) === today)
    .map(r => r.id as string)
  if (dupes.length) {
    await supabase.from('user_facts').delete().eq('user_id', user.id).in('id', dupes)
  }

  const { error } = await supabase.from('user_facts').insert({
    user_id: user.id, source: MOOD_SOURCE, kind: MOOD_KIND, body: formatMoodBody(score), salience: 0.4, expires_at: null,
  })
  if (error) return { ok: false }
  revalidatePath('/app/mentor')
  return { ok: true }
}

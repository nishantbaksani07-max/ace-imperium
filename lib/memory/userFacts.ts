import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Shared memory layer. user_facts is the APP's durable memory about a user
 * (distinct from `notes`, the user's own inbox). Any module writes facts in,
 * any mentor reads them out. Pure mappers/filters are exported for testing;
 * the IO helpers take a supabase client (server) and never throw.
 */

export interface UserFactRow {
  id: string
  user_id: string
  source: string
  kind: string
  body: string
  salience: string | number
  created_at: string
  last_referenced_at: string | null
  expires_at: string | null
}

export interface UserFact {
  id: string
  source: string
  kind: string
  body: string
  salience: number
  createdAt: string
  lastReferencedAt: string | null
  expiresAt: string | null
}

const num = (v: string | number): number =>
  typeof v === 'number' ? v : Number.isFinite(Number(v)) ? Number(v) : 0.5

export function rowToFact(row: UserFactRow): UserFact {
  return {
    id: row.id,
    source: row.source,
    kind: row.kind,
    body: row.body,
    salience: num(row.salience),
    createdAt: row.created_at,
    lastReferencedAt: row.last_referenced_at,
    expiresAt: row.expires_at,
  }
}

export interface SelectOpts {
  now: string
  minSalience?: number
  limit?: number
  kinds?: string[]
}

/** Pure: drop expired, filter by salience/kind, sort by salience desc, cap. */
export function selectRelevantFacts(facts: UserFact[], opts: SelectOpts): UserFact[] {
  const nowMs = Date.parse(opts.now)
  let out = facts.filter(f => {
    if (f.expiresAt && Date.parse(f.expiresAt) <= nowMs) return false
    if (opts.minSalience != null && f.salience < opts.minSalience) return false
    if (opts.kinds && !opts.kinds.includes(f.kind)) return false
    return true
  })
  out = out.sort((a, b) => b.salience - a.salience)
  return opts.limit != null ? out.slice(0, opts.limit) : out
}

// Words that carry no identifying signal — ignored when comparing two facts.
const FACT_STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'from', 'with',
  'by', 'as', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you',
  'your', 'my', 'me', 'they', 'them', 'their', 'has', 'have', 'had',
  'today', 'now', 'currently', 'still', 'likely', 'after', 'before', 'day',
  'reported', 'experiencing', 'feeling', 'feels', 'about', 'some', 'when',
  'while', 'because', 'so', 'then', 'just', 'also', 'very', 'really',
])

/** Reduce a fact to its array of unique, meaningful, stemmed content words. */
function factTokens(body: string): string[] {
  const words = body
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    // drop short words, stopwords, and bare numbers (dates / counts aren't the
    // subject of a fact, and they dilute the overlap score)
    .filter(w => w.length > 1 && !FACT_STOPWORDS.has(w) && !/^\d+$/.test(w))
    // crude stem so "leg"/"legs", "session"/"sessions" collapse together
    .map(w => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
  return Array.from(new Set(words))
}

/**
 * Pure: is `body` a near-duplicate of any fact in `existing`? True when most of
 * the new fact's meaningful words are already covered by an existing fact —
 * i.e. it adds no new information. Catches Haiku re-logging the same ongoing
 * thing ("sharp knee pain today" vs "sharp stabbing knee pain limits leg
 * training") turn after turn. `threshold` is the share of new-fact words that
 * must already be present to count as a duplicate.
 */
export function isDuplicateFact(body: string, existing: string[], threshold = 0.7): boolean {
  const tokens = factTokens(body)
  if (tokens.length === 0) return false
  for (const prev of existing) {
    const prevTokens = new Set(factTokens(prev))
    if (prevTokens.size === 0) continue
    const covered = tokens.filter(t => prevTokens.has(t)).length
    if (covered / tokens.length >= threshold) return true
  }
  return false
}

export interface WriteFactInput {
  source: string
  kind: string
  body: string
  salience?: number
  expiresAt?: string | null
  /** Optional id of the row this fact describes (e.g. a goal id) — lets the
   *  owning module refresh or remove this exact fact later. */
  refId?: string | null
}

/** IO: read all of a user's facts (RLS-scoped). Never throws. */
export async function readFacts(supabase: SupabaseClient, userId: string): Promise<UserFact[]> {
  const { data, error } = await supabase
    .from('user_facts')
    .select('id, user_id, source, kind, body, salience, created_at, last_referenced_at, expires_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return (data as UserFactRow[]).map(rowToFact)
}

/** IO: write one fact (RLS-scoped). Never throws. */
export async function writeFact(
  supabase: SupabaseClient,
  userId: string,
  input: WriteFactInput,
): Promise<{ ok: boolean }> {
  const payload: Record<string, unknown> = {
    user_id: userId,
    source: input.source,
    kind: input.kind,
    body: input.body,
    salience: input.salience ?? 0.5,
    expires_at: input.expiresAt ?? null,
  }
  // Only touch the ref_id column when a caller actually uses it. PostgREST
  // rejects the WHOLE insert if the payload names a column missing from the
  // schema cache, so leaving ref_id out keeps the non-ref writers (mentor chat,
  // training-day facts) working even if this ships before the ref_id migration.
  if (input.refId != null) payload.ref_id = input.refId
  const { error } = await supabase.from('user_facts').insert(payload)
  return { ok: !error }
}

/**
 * IO: remove every fact a source wrote for one origin row (matched by
 * user_id + source + ref_id). Used when that row is deleted, goes private, or
 * is being refreshed. RLS-scoped, never throws.
 */
export async function deleteFactsByRef(
  supabase: SupabaseClient,
  userId: string,
  source: string,
  refId: string,
): Promise<void> {
  await supabase
    .from('user_facts')
    .delete()
    .eq('user_id', userId)
    .eq('source', source)
    .eq('ref_id', refId)
}

/**
 * IO: keep exactly one fact for (source, refId) — clear any prior, write the
 * new one. So a goal whose progress/title/priority changes leaves a single,
 * current memory instead of a pile of stale duplicates. Never throws.
 */
export async function upsertFactByRef(
  supabase: SupabaseClient,
  userId: string,
  input: WriteFactInput & { refId: string },
): Promise<{ ok: boolean }> {
  await deleteFactsByRef(supabase, userId, input.source, input.refId)
  return writeFact(supabase, userId, input)
}

/** IO: bump last_referenced_at for facts the mentor actually used. Never throws. */
export async function touchFacts(supabase: SupabaseClient, userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return
  await supabase
    .from('user_facts')
    .update({ last_referenced_at: new Date().toISOString() })
    .eq('user_id', userId)
    .in('id', ids)
}

/** IO: delete one fact the user owns (RLS-scoped). Never throws. */
export async function deleteFact(supabase: SupabaseClient, userId: string, id: string): Promise<{ ok: boolean }> {
  const { error } = await supabase
    .from('user_facts')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  return { ok: !error }
}

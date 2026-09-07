/**
 * Persistence mapping for the report contract: turns a validated ReportedStream
 * into the two RLS-scoped rows the noticed engine reads, and runs the write.
 *
 * Split from reportContract so the contract stays pure shape + validation, and
 * from the server action so the WRITE LOGIC (validate, normalize, which table
 * gets which row) is unit-tested without a database. The thin server action
 * (reportActions.ts) just supplies the authed Supabase client + user id.
 *
 * PATCH21 — two integrity rules live here:
 *   1. Per-tile identity. A stream row is (user_id, tile_id, key), and each
 *      datapoint carries its stream row's id. Two different tiles reporting
 *      the same key (yours + a friend's shared tile) stay two separate
 *      streams — no label/kind clobber, no merged datapoints. tile_id comes
 *      from the HOST's window registry (useTileHost), never from anything the
 *      iframe claims; a Create-page draft reports under its provisional id
 *      rather than being dropped.
 *   2. Kind pinning. A tile author (possibly not the user, for a shared tile)
 *      declares kind/goalDirection, and those set the SCORING MODE. The
 *      first-seen kind/goalDirection for a stream row is pinned: a later
 *      report cannot silently flip a stream from "down = good" magnitude
 *      scoring to something else. Label may refresh; the mode may not.
 */

import { validateReport, normalizeKey, type ReportedStream } from './reportContract'

/** A row of `tile_streams` (stream identity, one per user+tile+key). */
export interface StreamUpsert {
  user_id: string
  tile_id: string
  key: string
  canonical_key: string
  label: string
  kind: string
  goal_direction: string | null
}

/** A row of `tile_reports` (one logged datapoint, tied to its stream row). */
export interface ReportUpsert {
  user_id: string
  stream_id: string
  stream_key: string
  value: number
  date: string
}

export function toStreamRow(userId: string, tileId: string, s: ReportedStream): StreamUpsert {
  return {
    user_id: userId,
    tile_id: tileId,
    key: s.key,
    canonical_key: normalizeKey(s.key),
    label: s.label,
    kind: s.kind,
    goal_direction: s.goalDirection ?? null,
  }
}

export function toReportRow(userId: string, streamId: string, s: ReportedStream): ReportUpsert {
  return { user_id: userId, stream_id: streamId, stream_key: s.key, value: s.value, date: s.date }
}

/** The minimal slice of a Supabase client this needs, so it is testable. */
export interface DbLike {
  from(table: string): {
    select(cols: string): SelectLike
    upsert(rows: unknown, opts?: unknown): UpsertLike
  }
}
export interface SelectLike {
  eq(col: string, v: unknown): SelectLike
  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: unknown }>
}
export interface UpsertLike extends PromiseLike<{ error: unknown }> {
  select(cols: string): { single(): Promise<{ data: Record<string, unknown> | null; error: unknown }> }
}

export type ReportWriteResult = { ok: true } | { ok: false; error: string }

/**
 * Validate an untrusted payload (it crossed the iframe boundary), then upsert
 * the stream row for (userId, tileId, key) — pinning its first-seen kind and
 * goalDirection — and the datapoint under that stream row's id. The caller is
 * responsible for having resolved userId from the session and tileId from the
 * host's own window registry (never the iframe).
 */
export async function reportStreamWith(
  db: DbLike,
  userId: string,
  tileId: string,
  input: unknown,
): Promise<ReportWriteResult> {
  if (typeof tileId !== 'string' || tileId.trim() === '') {
    return { ok: false, error: 'missing tile id' }
  }
  const v = validateReport(input)
  if (!v.ok) return { ok: false, error: v.error }
  const s = v.stream
  const tid = tileId.trim()

  // Pinning read: does this (user, tile, key) stream already exist?
  const existing = await db
    .from('tile_streams')
    .select('id, kind, goal_direction')
    .eq('user_id', userId)
    .eq('tile_id', tid)
    .eq('key', s.key)
    .maybeSingle()
  if (existing.error) return { ok: false, error: 'failed to read the stream' }

  const row = toStreamRow(userId, tid, s)
  if (existing.data) {
    // First-seen kind/goalDirection win forever; a mismatched later report
    // refreshes the label and logs its datapoint, never the scoring mode.
    row.kind = String(existing.data.kind ?? row.kind)
    row.goal_direction = (existing.data.goal_direction ?? null) as string | null
  }

  const streamRes = await db
    .from('tile_streams')
    .upsert(row, { onConflict: 'user_id,tile_id,key' })
    .select('id')
    .single()
  if (streamRes.error || !streamRes.data?.id) return { ok: false, error: 'failed to save the stream' }
  const streamId = String(streamRes.data.id)

  const reportRes = await db
    .from('tile_reports')
    .upsert(toReportRow(userId, streamId, s), { onConflict: 'user_id,stream_id,date' })
  if (reportRes.error) return { ok: false, error: 'failed to save the datapoint' }

  return { ok: true }
}

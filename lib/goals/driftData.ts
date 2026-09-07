/**
 * Server-side gather for the drift watch (BUILD42 flagship). Reads the user's
 * recent behaviour from the real module tables (workouts / nutrition_meals /
 * wearable_data) + the goal_nudges cooldown ledger, then hands a pure snapshot
 * to detectDrift. RLS-scoped, never throws — a read failure just means "no
 * nudge" (Vee stays quiet rather than crashing the Vee tab).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { detectDrift, type DriftInput, type DriftGoalRef, type DriftKind, type DriftNudge, type DriftResolution, type StreamDriftItem } from './drift'
import type { Push } from '@/app/app/goals/veeTypes'

// Which drift domain a goal category feeds. Only 'fitness' is mapped: it maps
// cleanly to training. 'health' is a deliberately broad bucket (sleep, vices,
// mental wellbeing, nutrition), so attaching it to the meal-logging drift would
// mis-attribute non-nutrition goals ("Quit Vaping runs on fuel logging"). Until
// there's a dedicated nutrition signal, only fitness goals personalise a drift.
const CATEGORY_DOMAIN: Partial<Record<string, DriftKind>> = {
  fitness: 'train',
}
const PUSH_RANK: Record<Push, number> = { silent: 0, gentle: 1, balanced: 2, push: 3 }

/** A non-null nearer deadline beats a later/absent one (null ranks last). */
function nearerDeadline(a: string | null, b: string | null): boolean {
  if (a == null) return false
  if (b == null) return true
  return a < b
}

function keyMinus(today: string, n: number): string {
  const d = new Date(`${today}T00:00:00`)
  d.setDate(d.getDate() - n)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function dayDiff(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey}T00:00:00`)
  const b = Date.parse(`${toKey}T00:00:00`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 9999
  return Math.round((b - a) / 86_400_000)
}

export async function gatherDrift(
  supabase: SupabaseClient,
  userId: string,
  today: string,
): Promise<DriftNudge | null> {
  try {
    const since30 = keyMinus(today, 30)

    const [wRes, mRes, recRes, ndRes, gRes, tsRes, trRes] = await Promise.all([
      supabase.from('workouts').select('date').eq('user_id', userId).not('submitted_at', 'is', null).gte('date', since30).order('date', { ascending: false }),
      supabase.from('nutrition_meals').select('day_key').eq('user_id', userId).gte('day_key', since30).order('day_key', { ascending: false }),
      // 21-day floor so the "prior" baseline can never reach into stale months
      // (a recovery dip must be vs the user's RECENT self, never a month ago).
      supabase.from('wearable_data').select('recovery, date').eq('user_id', userId).not('recovery', 'is', null).gte('date', keyMinus(today, 21)).order('date', { ascending: false }).limit(12),
      supabase.from('goal_nudges').select('kind, last_nudged_at, resolution').eq('user_id', userId).order('last_nudged_at', { ascending: false }),
      // active, non-silent goals — so Vee can reach out about the SPECIFIC goal
      // whose domain has gone quiet, at the cadence its push level asks for.
      supabase.from('vitality_goals').select('id, title, clean_title, category, push_level, target_date').eq('user_id', userId).eq('status', 'active').neq('push_level', 'silent'),
      // user-built tile streams (report contract) — the generic drift domain
      supabase.from('tile_streams').select('id, key, canonical_key, label').eq('user_id', userId),
      supabase.from('tile_reports').select('stream_id, stream_key, date').eq('user_id', userId).gte('date', since30).order('date', { ascending: false }),
    ])

    // training
    const wDates = (wRes.data ?? []).map(r => r.date as string)
    const daysSinceLastWorkout = wDates.length ? dayDiff(wDates[0], today) : null
    const workoutsLast21 = wDates.filter(d => dayDiff(d, today) <= 21).length

    // fuel — distinct logged days
    const mKeys = (mRes.data ?? []).map(r => r.day_key as string)
    const daysSinceLastMeal = mKeys.length ? dayDiff(mKeys[0], today) : null
    const mealDaysLast21 = new Set(mKeys.filter(d => dayDiff(d, today) <= 21)).size

    // recovery — last ~3 readings vs the ~7 before them
    const recs = (recRes.data ?? [])
      .map(r => ({ v: Number(r.recovery), date: r.date as string }))
      .filter(r => Number.isFinite(r.v))
    const recoveryReadings14 = recs.filter(r => dayDiff(r.date, today) <= 14).length
    const avg = (arr: { v: number }[]) => (arr.length ? arr.reduce((s, x) => s + x.v, 0) / arr.length : null)
    // Need a real recent window AND a real prior window (>=2 / >=3 readings) or
    // we don't judge — no comparing today against a 1-reading "baseline".
    const recentSlice = recs.slice(0, 3)
    const priorSlice = recs.slice(3, 10)
    const recoveryRecentAvg = recentSlice.length >= 2 ? avg(recentSlice) : null
    const recoveryPriorAvg = priorSlice.length >= 3 ? avg(priorSlice) : null

    // tile streams — one snapshot per stream (distinct report days, recency).
    // Reports join by stream_id (PATCH21 per-tile identity), so two same-key
    // tiles are watched as two separate streams, never one merged habit.
    const streamRows = tsRes.data ?? []
    const reportsByStream = new Map<string, string[]>()
    for (const row of trRes.data ?? []) {
      const k = String(row.stream_id ?? row.stream_key)
      const d = String(row.date).slice(0, 10)
      const arr = reportsByStream.get(k)
      if (arr) arr.push(d)
      else reportsByStream.set(k, [d])
    }
    const streams: StreamDriftItem[] = streamRows.map(row => {
      const dates =
        reportsByStream.get(String(row.id)) ?? reportsByStream.get(row.key as string) ?? [] // newest first
      return {
        canonicalKey: (row.canonical_key ?? row.key) as string,
        label: row.label as string,
        daysSinceLastReport: dates.length ? dayDiff(dates[0], today) : null,
        reportDaysLast21: new Set(dates.filter(d => dayDiff(d, today) <= 21)).size,
      }
    })

    // cooldown — latest row per kind (core kinds + the generic stream:* kinds)
    const cooldown: DriftInput['cooldown'] = {}
    for (const row of ndRes.data ?? []) {
      const k = row.kind as DriftKind
      if (k !== 'train' && k !== 'fuel' && k !== 'recovery' && !k.startsWith('stream:')) continue
      if (!cooldown[k]) {
        cooldown[k] = {
          lastNudgedAt: (row.last_nudged_at ?? null) as string | null,
          resolution: (row.resolution ?? null) as DriftResolution | null,
        }
      }
    }

    // best goal per domain: highest push, then nearest deadline
    const goalByKind: DriftInput['goalByKind'] = {}
    for (const row of gRes.data ?? []) {
      const domain = CATEGORY_DOMAIN[(row.category ?? '') as string]
      if (!domain) continue
      // Only personalise with the AI-tidied title. Until it lands (categorize is
      // async after save), fall through to generic drift copy rather than drop a
      // raw, possibly-lowercase user sentence into Vee's outreach.
      const cleanTitle = ((row.clean_title ?? '') as string).trim()
      if (!cleanTitle) continue
      const pl = row.push_level as string
      const push = (pl === 'gentle' || pl === 'push' || pl === 'balanced' ? pl : 'balanced') as Push
      const cand: DriftGoalRef = {
        id: row.id as string,
        title: cleanTitle,
        push,
        targetDate: (row.target_date ?? null) as string | null,
      }
      const cur = goalByKind[domain]
      const better = !cur
        || PUSH_RANK[cand.push] > PUSH_RANK[cur.push]
        || (PUSH_RANK[cand.push] === PUSH_RANK[cur.push] && nearerDeadline(cand.targetDate, cur.targetDate))
      if (better) goalByKind[domain] = cand
    }

    return detectDrift({
      today,
      daysSinceLastWorkout,
      workoutsLast21,
      daysSinceLastMeal,
      mealDaysLast21,
      recoveryRecentAvg,
      recoveryPriorAvg,
      recoveryReadings14,
      streams,
      cooldown,
      goalByKind,
    })
  } catch {
    return null
  }
}

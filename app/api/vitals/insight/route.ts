import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserPreferences } from '@/lib/preferences'
import { buildVitalsAdvice } from '@/lib/vitals/advice'
import { coerceReading, rowToGoal } from '@/lib/vitals/goalsRepo'
import { readFacts, selectRelevantFacts } from '@/lib/memory/userFacts'
import { buildInsightContext, INSIGHT_METRICS } from '@/lib/vitals/insightContext'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/*
 * AI Vitals Mentor — per-metric personal lines.
 *
 * Assembles the user's WHOOP reading + 7d trend + active goal + yesterday's
 * workout + relevant user_facts, asks Claude for { line, opener } per metric,
 * caches the result per user per day (keyed by an input hash), and falls back
 * to the rules engine (lib/vitals/advice.ts) on any failure. The page never
 * shows a broken/empty insight.
 *
 * Tier gating point: today any signed-in user (dogfood), gate to 'pro' when
 * profiles.tier is enforced (hard rule #5).
 */

interface MetricInsight { line: string; opener: string }
type InsightMap = Record<string, MetricInsight>

/** Hard guarantee against em/en dashes (Alex's copy rule) — model sometimes ignores the prompt. */
const noDashes = (s: string): string =>
  s.replace(/\s*[—–]\s*(\w?)/g, (_m, c: string) => (c ? `, ${c.toLowerCase()}` : ', '))

function sanitizeInsights(map: InsightMap): InsightMap {
  const out: InsightMap = {}
  for (const [k, v] of Object.entries(map)) {
    out[k] = { line: noDashes(v.line ?? ''), opener: noDashes(v.opener ?? '') }
  }
  return out
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function daysAgoKey(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Tiny stable hash so we only regenerate when inputs change. */
function hash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0 }
  return String(h)
}

const SYSTEM = `You are the Vitals mentor in the Vitality app — a personal voice tied to one user's wearable data and their life.

For each requested metric, write ONE short personal line (max ~22 words) and ONE opener question to start a chat about it.

VOICE: warm, calm, lowercase is fine, no shame, never scold. A low day is the body asking for rest, not a failure. No emoji. No em dashes.

FACTS ARE SACRED. Use ONLY what is in the context block. Never invent a number, a workout, a meal, a sleep event, or any life detail. If "Yesterday's training" says nothing logged, do NOT mention a workout at all. If you don't know why a metric moved, say it plainly ("not sure what drove this") or ask in the opener instead of guessing a cause. "Bold and personal" means a confident, warm tone and connecting the REAL data points and known facts you were given. It does NOT mean inventing specifics. When you have little to go on, the opener should ASK ("what did yesterday look like for you?") rather than assume.

NUMBERS: quote every metric value EXACTLY as given in the context. Do not change, round, or drift a number (if hrv=218, write 218, never 217). The one exception: sleep hours may be shown to one decimal (e.g. 7.7h), never more.

The opener is a single friendly question that invites them to tell you more.

Return ONLY minified JSON of shape {"recovery":{"line":"...","opener":"..."},"hrv":{...},"sleep":{...},"strain":{...}}. No prose outside the JSON.`

export async function POST(_request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const yesterday = daysAgoKey(1)
  const day = todayKey()

  // Mirror the dashboard: take the latest 7 readings regardless of date, so the
  // insight works on seed/older test data too (don't gate on a 7-day window).
  const [wearableRes, goalRes, workoutsRes, prefs, allFacts] = await Promise.all([
    supabase.from('wearable_data').select('date, recovery, sleep_hours, sleep_perf, hrv, rhr, strain').eq('user_id', user.id).order('date', { ascending: false }).limit(7),
    supabase.from('vitals_goals').select('*').eq('user_id', user.id).eq('status', 'active').maybeSingle(),
    supabase.from('workouts').select('date, day_name').eq('user_id', user.id).eq('date', yesterday),
    getUserPreferences(supabase, user.id),
    readFacts(supabase, user.id),
  ])

  const week = (wearableRes.data ?? []).map(coerceReading)
  if (!week.length) return NextResponse.json({ insights: {} })
  const latest = week[0]
  const goal = goalRes.data ? rowToGoal(goalRes.data) : null
  const facts = selectRelevantFacts(allFacts, { now: new Date().toISOString(), limit: 8 })
  const workoutsYesterday = (workoutsRes.data ?? []).map(w => ({ date: w.date as string, day_name: w.day_name as string }))

  const context = buildInsightContext({ reading: latest, week, goal, facts, workoutsYesterday, today: day })
  const inputHash = hash(context)

  // Cache hit?
  const cached = await supabase.from('vitals_insights').select('input_hash, lines').eq('user_id', user.id).eq('day_key', day).maybeSingle()
  if (cached.data && cached.data.input_hash === inputHash) {
    return NextResponse.json({ insights: cached.data.lines as InsightMap, cached: true })
  }

  // Rules fallback (instant, free) — used if the LLM call fails or isn't configured.
  const advice = buildVitalsAdvice(latest, week, prefs.vitals ?? null, goal)
  const fallback: InsightMap = Object.fromEntries(
    INSIGHT_METRICS.map(m => [m, { line: advice.headline, opener: 'want to talk about how today is feeling?' }]),
  )

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ insights: fallback, fallback: true })

  let insights: InsightMap = fallback
  try {
    const model = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001'
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model, max_tokens: 600, system: SYSTEM,
        messages: [{ role: 'user', content: `${context}\n\nMetrics to write for: ${INSIGHT_METRICS.join(', ')}.` }],
      }),
    })
    const json = await res.json() as { content?: Array<{ type: string; text: string }> }
    const text = json.content?.find(b => b.type === 'text')?.text ?? ''
    const start = text.indexOf('{'); const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(text.slice(start, end + 1)) as InsightMap
      // keep only metrics we asked for, fall back per-missing-metric
      insights = Object.fromEntries(INSIGHT_METRICS.map(m => [m, parsed[m]?.line ? parsed[m] : fallback[m]])) as InsightMap
    }
  } catch {
    insights = fallback
  }

  insights = sanitizeInsights(insights)
  await supabase.from('vitals_insights').upsert({ user_id: user.id, day_key: day, input_hash: inputHash, lines: insights })
  return NextResponse.json({ insights })
}

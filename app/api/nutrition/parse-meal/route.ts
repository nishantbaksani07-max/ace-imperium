import { NextRequest, NextResponse } from 'next/server'

import { requireUser } from '@/lib/auth/require-tier'
import { createClient } from '@/lib/supabase/server'
import { buildSystemPrompt, buildResponseSchema, buildCorrectionPriors } from '@/lib/nutrition/prompt'
import { usdaSearchBest } from '@/lib/nutrition/usda'
import { lookupMacrosForMeal, type ResolvedMeal } from '@/lib/nutrition/macros'
import { shouldEscalate, escalationTimeoutMs } from '@/lib/nutrition/escalate'
import type { ParsedMeal } from '@/lib/nutrition/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/*
 * Nutrition · parse-meal — the vision pipeline.
 *
 * Takes a base64 food photo (+ optional caption + meal-type portion prior) and
 * asks Claude to identify foods, estimate grams, decompose composites, and
 * surface uncertainty as clarifying questions. Claude NEVER returns macros —
 * USDA does that downstream via /api/nutrition/usda-search.
 *
 * Two-tier model: the fast FLOOR model (Sonnet) handles every photo. When it
 * flags that it could not commit confidently (state uncertain / can_tell), the
 * same photo is silently re-run on the stronger ESCALATION model (Opus) and we
 * take that answer. Easy plates stay fast; hard plates get the better eyes.
 * The generalized prompt (lib/nutrition/prompt.ts) is what makes the floor
 * model flag doubt honestly, which is the routing signal escalation relies on.
 *
 * Server-only: the Anthropic key (CLAUDE.md hard rule #4) and the prompt IP
 * (lib/nutrition/prompt.ts) stay on the server. Pro-gated (hard rule #5).
 */

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const CLAUDE_API_VERSION = '2023-06-01'
// Floor model: handles every photo. Sonnet 4.6 is the default — a big accuracy
// jump over Haiku (which padded plates with phantom foods) while still returning
// well inside the 60s function budget. Override with CLAUDE_MODEL.
const DEFAULT_MODEL = 'claude-sonnet-4-6'
// Sharpen model: used ONLY when the user taps "Redo scan" on a meal they think
// is wrong. We deliberately spend Opus (our smartest eyes) on that one photo for
// a real second opinion — paid only on demand, not on every scan.
const SHARPEN_MODEL = 'claude-opus-4-8'
// Synchronous escalation is DISABLED by default. A second blocking frontier
// call made the request too long (first 504s, then dropped connections). Opus
// accuracy on hard plates belongs in an ASYNC second request (return the floor
// result fast, sharpen in the background) — not a second blocking call. The
// inline path below still works if you set CLAUDE_ESCALATION_MODEL to a model
// id, but it's best-effort + time-bounded and can re-introduce slow requests.
const DEFAULT_ESCALATION_MODEL = 'none'
// Cost ceiling: the vision scan is our most expensive AI call (Sonnet, sometimes
// Opus per photo). Cap the number of AI photo scans a user can run per day so a
// small API budget lasts. Manual + USDA logging stay UNLIMITED (they cost us
// nothing) — this only bounds the paid photo path. Tune with FUEL_SCAN_DAILY_CAP.
const SCAN_DAILY_CAP = Number(process.env.FUEL_SCAN_DAILY_CAP) || 12

interface ParseMealBody {
  imageBase64?: string
  mediaType?: string
  // The user's own short list of what's on the plate (from the scan-context
  // sheet). Treated as the authoritative set of foods so the model matches it
  // instead of over-itemizing.
  caption?: string
  mealTypeHint?: string
  // Where the meal came from (homemade / restaurant / dining hall / whole). A
  // hidden-fat prior built client-side from lib/nutrition/foodSource.
  sourceHint?: string
  // Set by "Redo scan": run this one photo on the SHARPEN_MODEL (Opus) instead
  // of the floor model for a stronger second opinion.
  escalate?: boolean
}

// Outcome of one vision call: a parsed meal, or a client-facing error.
type VisionResult =
  | { ok: true; parsed: ParsedMeal }
  | { ok: false; status: number; message: string }

// One photo → one Claude vision call → ParsedMeal (or a structured error).
// Pulled out so the floor and escalation passes share identical request shape
// (same prompt, schema, and cached system block).
async function requestVisionParse(
  model: string,
  apiKey: string,
  userContent: Array<Record<string, unknown>>,
  timeoutMs?: number
): Promise<VisionResult> {
  const payload = {
    model,
    max_tokens: 4096,
    // System prompt as a cached block: the large static prompt is processed
    // once and reused across the user's session (5-min TTL), trimming TTFT.
    // Cache is keyed per model, so the floor and escalation models cache
    // independently.
    system: [{ type: 'text', text: buildSystemPrompt(), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userContent }],
    // Grammar-constrained JSON output — the response is guaranteed to match
    // the schema, so no defensive JSON.parse cleanup is needed.
    output_config: { format: { type: 'json_schema', schema: buildResponseSchema() } },
  }

  // Abort if the call would overrun its slice of the function time budget —
  // two sequential frontier calls can otherwise blow Vercel's 60s wall (504).
  const controller = new AbortController()
  const timer = timeoutMs && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null

  try {
    const res = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': CLAUDE_API_VERSION,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error(`[nutrition/parse-meal] Claude ${res.status} (${model}):`, errText)
      const status = res.status === 401 ? 500 : 502
      const message =
        res.status === 401
          ? 'AI photo analysis is misconfigured.'
          : 'Claude could not analyze the photo right now.'
      return { ok: false, status, message }
    }

    const data = await res.json()
    if (data.stop_reason === 'max_tokens') {
      return { ok: false, status: 422, message: 'The analysis was too long for one photo. Try a simpler plate.' }
    }
    if (data.stop_reason === 'refusal') {
      return { ok: false, status: 422, message: 'Claude declined to analyze this photo.' }
    }

    const text: string | undefined = data.content?.[0]?.text
    if (!text) {
      console.error('[nutrition/parse-meal] empty Claude content:', data)
      return { ok: false, status: 502, message: 'Claude returned an empty response.' }
    }

    try {
      return { ok: true, parsed: JSON.parse(text) as ParsedMeal }
    } catch (err) {
      console.error('[nutrition/parse-meal] could not parse Claude JSON:', err, text.slice(0, 500))
      return { ok: false, status: 502, message: 'Claude returned an unreadable response.' }
    }
  } catch (err) {
    if (controller.signal.aborted) {
      console.warn(`[nutrition/parse-meal] ${model} aborted after ~${timeoutMs}ms (time budget)`)
      return { ok: false, status: 504, message: 'That plate took too long to analyze. Try a clearer or simpler photo.' }
    }
    console.error('[nutrition/parse-meal] network error:', err)
    return { ok: false, status: 502, message: 'network connection to Claude failed' }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireUser()
  if (!gate.ok) return gate.response
  const { userId } = gate

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI photo analysis not configured. Admin needs to set ANTHROPIC_API_KEY.' },
      { status: 500 }
    )
  }

  let body: ParseMealBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const { imageBase64, mediaType, caption, mealTypeHint, sourceHint, escalate } = body
  if (!imageBase64 || !mediaType) {
    return NextResponse.json({ error: 'imageBase64 and mediaType are required' }, { status: 400 })
  }

  // Daily scan cap (cost ceiling). READ the count before the expensive vision
  // call and block at the cap; the counter is only bumped AFTER a successful scan
  // (below), so a failed/timed-out call or a flaky API key never burns the user's
  // daily allowance. Fail-closed on a read error. Manual/USDA logging never hits
  // this route, so the user can always keep logging for free.
  const capDay = new Date().toISOString().slice(0, 10)
  {
    const supabase = createClient()
    const { data: usage, error: capErr } = await supabase
      .from('ai_usage_daily')
      .select('count')
      .eq('user_id', userId)
      .eq('day', capDay)
      .maybeSingle()
    if (capErr) {
      console.error('[nutrition/parse-meal] scan cap read error:', capErr.message)
      return NextResponse.json({ error: 'Could not check your scan limit. Please try again.' }, { status: 500 })
    }
    if (((usage?.count as number) ?? 0) >= SCAN_DAILY_CAP) {
      return NextResponse.json(
        { error: `You've used today's ${SCAN_DAILY_CAP} photo scans. You can still add meals manually, or scan again tomorrow.` },
        { status: 429 },
      )
    }
  }

  const userContent: Array<Record<string, unknown>> = [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
  ]
  if (mealTypeHint) userContent.push({ type: 'text', text: mealTypeHint })
  if (sourceHint) userContent.push({ type: 'text', text: sourceHint })
  if (caption && caption.trim())
    userContent.push({ type: 'text', text: "On the plate (user's own words): " + caption.trim() })

  // Per-user learning: inject this user's recent corrections as a (non-cached)
  // prior so the model leans toward their past fixes on ambiguous foods. Best
  // effort — a failed read must never block the photo. Goes in a user-content
  // block, NOT the cached system prompt (per-user data would bust the cache).
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('nutrition_corrections')
      .select('guessed_name, corrected_name')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(40)
    if (data && data.length > 0) {
      const priors = buildCorrectionPriors(
        data.map((r) => ({
          guessedName: (r.guessed_name as string | null) ?? null,
          correctedName: r.corrected_name as string,
        }))
      )
      if (priors) userContent.push({ type: 'text', text: priors })
    }
  } catch (err) {
    console.warn('[nutrition/parse-meal] correction priors skipped:', err)
  }

  // AI time budget: keep the floor + escalation calls comfortably under the
  // function's maxDuration (60s) so the route can never hit Vercel's gateway
  // wall (which surfaced to users as a 504). Leaves headroom for the USDA
  // resolve + response below.
  const startedAt = Date.now()
  // A user-triggered "Redo scan" spends our slowest, smartest model on purpose,
  // so give it more of the 60s budget than a normal floor scan.
  const AI_BUDGET_MS = escalate ? 54_000 : 48_000

  // Floor pass: the default model handles every photo. "Redo scan" forces Opus.
  const floorModel = escalate ? SHARPEN_MODEL : process.env.CLAUDE_MODEL || DEFAULT_MODEL
  const floor = await requestVisionParse(floorModel, apiKey, userContent, AI_BUDGET_MS)
  if (!floor.ok) {
    return NextResponse.json({ error: floor.message }, { status: floor.status })
  }

  // The scan succeeded, so it counts now (never on failure). Best-effort: a bump
  // error must not fail a scan the user already got a result from.
  try {
    const supabase = createClient()
    await supabase.rpc('bump_ai_usage', { p_day: capDay })
  } catch (e) {
    console.warn('[nutrition/parse-meal] usage bump failed (non-blocking):', e)
  }

  let parsed: ParsedMeal = floor.parsed

  // Escalation pass: only when the floor flagged doubt AND enough of the budget
  // remains for a second frontier call. Short on time → keep the floor result
  // rather than risk overrunning; a failed/aborted escalation also falls back
  // to the floor. Best-effort by design — it never makes the request fail.
  const escalationModel = process.env.CLAUDE_ESCALATION_MODEL || DEFAULT_ESCALATION_MODEL
  if (escalationModel !== 'none' && escalationModel !== floorModel && shouldEscalate(parsed)) {
    const escMs = escalationTimeoutMs(Date.now() - startedAt, { budgetMs: AI_BUDGET_MS })
    if (escMs > 0) {
      const escalated = await requestVisionParse(escalationModel, apiKey, userContent, escMs)
      if (escalated.ok) {
        parsed = escalated.parsed
      } else {
        console.warn(
          `[nutrition/parse-meal] escalation to ${escalationModel} failed/aborted (${escalated.status}); using ${floorModel} result`
        )
      }
    } else {
      console.warn('[nutrition/parse-meal] skipped escalation — insufficient time budget remaining')
    }
  }

  // Resolve macros HERE, server-side, in parallel — every food's USDA lookup
  // fires at once and there are no extra browser round trips. This collapses
  // the old per-food client waterfall into one response. If USDA isn't
  // configured or errors, `resolved` is null and the client falls back to its
  // own (slower) resolution path.
  let resolved: ResolvedMeal | null = null
  const usdaKey = process.env.USDA_API_KEY
  if (usdaKey && Array.isArray(parsed.foods) && parsed.foods.length > 0) {
    try {
      resolved = await lookupMacrosForMeal(parsed, (hint) => usdaSearchBest(hint, usdaKey))
    } catch (err) {
      console.error('[nutrition/parse-meal] macro resolution failed:', err)
    }
  }

  return NextResponse.json({ parsed, resolved })
}

import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { getUserPreferences } from '@/lib/preferences'
import { buildCoachContext } from '@/lib/coach/context'
import { buildSystemPrompt, SCORE_INSTRUCTION } from '@/lib/coach/prompt'
import { shouldDistill, distillMemory } from '@/lib/coach/memory'
import type { CoachRequest, CoachChatMessage } from '@/lib/coach/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/*
 * Food Coach — the macro-purposed, omniscient-context coach on /app/fuel.
 *
 * Cloned from app/api/mentor/chat. Server-side key only (hard rule #4). Accepts
 * { mode, dayKey, snapshot, messages }. score mode returns { score, reason };
 * chat mode returns { reply }. Personalization comes from buildCoachContext,
 * which reads every questionnaire + the user's live data.
 *
 * Model: COACH_MODEL env knob, defaults to Sonnet (the coach reasons over the
 * whole file, quality matters), like the macros module's CLAUDE_MODEL knob.
 *
 * Tier: open today. coachAccess() is the single seam to gate pro/free later.
 */

const DEFAULT_MODEL = 'claude-sonnet-4-6'

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicResponse { content?: AnthropicTextBlock[]; error?: { message?: string } }

/**
 * The one tier seam. Returns a 402 response to block, or null to allow. Today
 * it allows everyone so we can dogfood. To gate later: read the user's tier and
 * `return NextResponse.json({ error: 'requires_pro' }, { status: 402 })` when
 * it is not 'pro'. The client already maps 402 to an upgrade nudge.
 */
function coachAccess(_tier: string | null): NextResponse | null {
  return null
}

async function callClaude(
  apiKey: string,
  model: string,
  system: string,
  messages: CoachChatMessage[],
  maxTokens: number,
): Promise<{ text: string } | { error: string; status: number }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
  })
  const rawText = await res.text()
  let data: AnthropicResponse
  try {
    data = JSON.parse(rawText) as AnthropicResponse
  } catch {
    return { error: `Anthropic returned non-JSON: ${rawText.slice(0, 200)}`, status: 502 }
  }
  if (!res.ok) {
    console.error('[coach] Anthropic error:', res.status, data?.error?.message)
    return { error: data?.error?.message || `Anthropic ${res.status}`, status: 502 }
  }
  const text = data?.content?.[0]?.text
  if (typeof text !== 'string') return { error: 'Empty response from coach', status: 502 }
  return { text: text.trim() }
}

// Try the configured model, then known-good fallbacks. Auto-heals a bad or
// deprecated COACH_MODEL env (the most common reason the coach goes dark while
// other AI keeps working) — the first model that answers wins.
const COACH_MODELS = Array.from(
  new Set([process.env.COACH_MODEL, DEFAULT_MODEL, 'claude-haiku-4-5-20251001'].filter(Boolean) as string[]),
)
async function callCoach(
  apiKey: string,
  system: string,
  messages: CoachChatMessage[],
  maxTokens: number,
): Promise<{ text: string } | { error: string; status: number }> {
  let last: { error: string; status: number } = { error: 'no model configured', status: 502 }
  for (const model of COACH_MODELS) {
    const r = await callClaude(apiKey, model, system, messages, maxTokens)
    if ('text' in r) return r
    last = r
    console.error(`[coach] model ${model} failed (${r.status}): ${r.error}`)
  }
  return last
}

/** Pull {score, reason} out of the model's reply, defensively. */
function parseScore(text: string): { score: number | null; reason: string } {
  const match = text.match(/\{[\s\S]*\}/)
  if (match) {
    try {
      const obj = JSON.parse(match[0]) as { score?: unknown; reason?: unknown }
      const raw = Number(obj.score)
      const score = Number.isFinite(raw) ? Math.max(1, Math.min(10, Math.round(raw))) : null
      const reason = typeof obj.reason === 'string' ? obj.reason.trim() : ''
      if (reason) return { score, reason }
    } catch {
      // fall through to plain-text fallback
    }
  }
  // Fallback: no JSON, use the whole reply as the reason without a number.
  return { score: null, reason: text }
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Coach is not configured on the server' }, { status: 500 })

  // Tier seam (open today).
  const { data: billing } = await supabase.from('profiles').select('tier').eq('id', user.id).maybeSingle()
  const gate = coachAccess((billing?.tier as string) ?? null)
  if (gate) return gate

  const payload = (await request.json().catch(() => null)) as CoachRequest | null
  if (!payload || (payload.mode !== 'score' && payload.mode !== 'chat')) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  if (typeof payload.dayKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payload.dayKey)) {
    return NextResponse.json({ error: 'bad_day_key' }, { status: 400 })
  }

  const [context, prefs] = await Promise.all([
    buildCoachContext(supabase, user.id, payload.dayKey, payload.snapshot),
    getUserPreferences(supabase, user.id),
  ])
  const system = buildSystemPrompt(context.text, prefs.mentor?.tone)

  try {
    if (payload.mode === 'score') {
      // Empty day: no model call, a warm nudge instead.
      if (context.todayMealCount === 0) {
        return NextResponse.json({ score: null, reason: 'Log a meal and I will take a look.' })
      }
      const result = await callCoach(apiKey, system, [{ role: 'user', content: SCORE_INSTRUCTION }], 220)
      if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
      const scored = parseScore(result.text)
      // Persist the day's score so History can show the coach's read for past
      // days and across devices (localStorage only ever held today, this device).
      // Best-effort: a write failure (e.g. table not yet migrated) logs and never
      // blocks the reply.
      try {
        const { error: scoreErr } = await supabase.from('coach_scores').upsert(
          {
            user_id: user.id,
            day_key: payload.dayKey,
            score: scored.score,
            reason: scored.reason,
            sig: typeof payload.sig === 'string' ? payload.sig : '',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,day_key' },
        )
        if (scoreErr) console.error('[coach] score persist failed:', scoreErr.message)
      } catch (e) {
        console.error('[coach] score persist threw:', e instanceof Error ? e.message : e)
      }
      return NextResponse.json(scored)
    }

    // chat mode
    const messages = (payload.messages ?? [])
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-16)
    if (messages.length === 0) return NextResponse.json({ error: 'no_message' }, { status: 400 })
    const result = await callCoach(apiKey, system, messages, 320)
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })

    // ── Memory ──────────────────────────────────────────────────────────
    // Persist this turn (both sides) so the chat survives reloads and the
    // coach grows with the user. All best-effort: a write failure (e.g. the
    // table not yet migrated) logs and never blocks the reply.
    const lastUser = messages[messages.length - 1]
    if (lastUser?.role === 'user') {
      try {
        const { count } = await supabase
          .from('coach_messages')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)

        const { error: insertErr } = await supabase.from('coach_messages').insert([
          { user_id: user.id, role: 'user', content: lastUser.content, day_key: payload.dayKey },
          { user_id: user.id, role: 'assistant', content: result.text, day_key: payload.dayKey },
        ])
        if (insertErr) console.error('[coach] persist failed:', insertErr.message)

        // Refresh the long-term memory once enough new messages have landed.
        const total = (count ?? 0) + 2
        const { data: mem } = await supabase
          .from('coach_memory')
          .select('summary, message_count')
          .eq('user_id', user.id)
          .maybeSingle()
        if (shouldDistill(total, (mem?.message_count as number) ?? 0)) {
          await distillMemory(supabase, user.id, apiKey, (mem?.summary as string) ?? '', messages, total)
        }
      } catch (e) {
        console.error('[coach] memory step failed:', e instanceof Error ? e.message : e)
      }
    }

    return NextResponse.json({ reply: result.text })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'coach_failed'
    console.error('[coach]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

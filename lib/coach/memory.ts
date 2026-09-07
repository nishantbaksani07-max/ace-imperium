// Food Coach — long-term memory distillation.
//
// The coach keeps a single distilled "what I know about you" summary per user
// (coach_memory). It is refreshed only every DISTILL_THRESHOLD new messages, so
// most chat turns pay nothing. The refresh uses a cheap, fast model and is
// always best-effort: a failure logs and leaves the prior summary in place, so
// it can never break a chat reply.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CoachChatMessage } from './types'

export const DISTILL_THRESHOLD = 8
const MEMORY_MODEL = process.env.COACH_MEMORY_MODEL || 'claude-haiku-4-5-20251001'
const MAX_SUMMARY_CHARS = 1200

/** Pure: have enough new messages accumulated since the last distill? */
export function shouldDistill(totalMessages: number, lastCount: number): boolean {
  return totalMessages - lastCount >= DISTILL_THRESHOLD
}

const DISTILL_SYSTEM = `You keep a Food Coach's private notes about one person. Read the prior notes and the recent conversation, then return UPDATED notes: only durable facts worth remembering long term (their goals, wins, struggles, preferences, sensitivities, life context). Drop anything transient like a single day's macros. Write it as the coach's own warm notes in second person, plain language, no emojis, no em dashes. Keep it under ${MAX_SUMMARY_CHARS} characters. Return ONLY the notes text.`

/**
 * Best-effort refresh of coach_memory.summary. Never throws — guards every step
 * and logs on failure. `recent` is the running conversation; `totalMessages` is
 * the new persisted count, written back as `message_count` so the next distill
 * is measured from here.
 */
export async function distillMemory(
  supabase: SupabaseClient,
  userId: string,
  apiKey: string,
  priorSummary: string,
  recent: CoachChatMessage[],
  totalMessages: number,
): Promise<void> {
  try {
    const transcript = recent
      .map((m) => `${m.role === 'user' ? 'Them' : 'You'}: ${m.content}`)
      .join('\n')
    const userMsg = `Prior notes:\n${priorSummary || '(none yet)'}\n\nRecent conversation:\n${transcript}`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MEMORY_MODEL,
        max_tokens: 500,
        system: DISTILL_SYSTEM,
        messages: [{ role: 'user', content: userMsg }],
      }),
    })
    if (!res.ok) {
      console.error('[coach] distill model error:', res.status)
      return
    }
    const data = (await res.json()) as { content?: { text?: string }[] }
    const summary = data?.content?.[0]?.text?.trim()
    if (!summary) return

    await supabase.from('coach_memory').upsert({
      user_id: userId,
      summary: summary.slice(0, MAX_SUMMARY_CHARS),
      message_count: totalMessages,
      updated_at: new Date().toISOString(),
    })
  } catch (e) {
    console.error('[coach] distill failed:', e instanceof Error ? e.message : e)
  }
}

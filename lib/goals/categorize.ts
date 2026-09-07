/**
 * Goal triage — the AI read (BUILD47). Takes a raw goal title and returns one of
 * the nine buckets + a clean, professional rewrite. Server-only (uses the
 * ANTHROPIC_API_KEY). NEVER throws: any failure (no key, bad JSON, API down)
 * falls back to a deterministic keyword guess + the user's original title, so a
 * goal is always saved and the categorize step is purely additive.
 *
 * Called async/non-blocking from goalActions.categorizeAndCleanGoal — the goal
 * is already saved with the raw title before this ever runs.
 */
import { clampCategory, guessCategory, type GoalCategory } from './categories'
import { detectGoalUnit, type GoalUnit } from './goalUnit'

const SYSTEM = `You tidy a personal goal for a life-dashboard app.

Return STRICT JSON only, no prose, no markdown fences:
{"category": "<one key>", "cleanTitle": "<short professional title>"}

category MUST be exactly one of:
fitness  - training, lifting, running, sport, body composition
health   - sleep, nutrition, recovery, mental wellbeing, quitting a vice
mind     - learning, reading, a skill, a language, focus
money    - saving, investing, debt, budget, net worth
career   - a job, work, a promotion, a business
craft    - making things: music, art, writing, design, building, content
audience - followers, subscribers, brand, reach
people   - family, friends, dating, community
general  - anything that does not clearly fit one of the above

cleanTitle rules: a calm, professional restatement of the SAME goal. Title case,
6 words max, no quotes, no trailing punctuation, no emoji. Keep the user's intent
exactly. Examples:
"i wanna get a 3 plate bench" -> {"category":"fitness","cleanTitle":"3-Plate Bench Press"}
"hit 1000 subs on yt" -> {"category":"audience","cleanTitle":"Reach 1,000 Subscribers"}
"save up for a car" -> {"category":"money","cleanTitle":"Save For A Car"}
"get better at guitar" -> {"category":"craft","cleanTitle":"Improve At Guitar"}`

export interface Categorized {
  category: GoalCategory
  cleanTitle: string
  /** The goal's own measurement unit, detected deterministically. null = the goal
   *  states none, so downstream falls back to the account's unit. The single
   *  source of truth for "what does this goal measure in" (Alex's never-switch
   *  rule); persisted onto the goal by categorizeAndCleanGoal. */
  unit: GoalUnit | null
}

export async function categorizeGoal(title: string): Promise<Categorized> {
  const t = (title || '').trim()
  // Unit detection is deterministic (no AI) and runs on every path, so the goal's
  // unit is captured even when the AI tidy step is down or keyless.
  const fallback: Categorized = { category: guessCategory(t), cleanTitle: t, unit: detectGoalUnit(t) }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || !t) return fallback

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      // A wedged API must never hold a server action (and its caller) hostage:
      // abort after 10s and fall back to the deterministic guess. The catch
      // below already treats the AbortError like any other failure.
      signal: AbortSignal.timeout(10_000),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        temperature: 0,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: t }],
      }),
    })
    if (!res.ok) return fallback

    const data = await res.json() as { content?: { text?: string }[] }
    const raw = (data.content?.[0]?.text ?? '').replace(/```json|```/g, '').trim()
    if (!raw) return fallback

    const parsed = JSON.parse(raw) as { category?: unknown; cleanTitle?: unknown }
    const category = clampCategory(parsed.category)
    let cleanTitle = typeof parsed.cleanTitle === 'string' ? parsed.cleanTitle.trim().replace(/^["']|["']$/g, '') : ''
    // Guard against an empty/runaway rewrite — keep the user's words if unsure.
    if (!cleanTitle || cleanTitle.length > 80) cleanTitle = t
    // Detect across both titles: the unit word often survives only in the AI's
    // cleanTitle ("225 bench" -> "225-Pound Bench Press"), and the raw title is the
    // backstop. Whichever states a unit first wins.
    return { category, cleanTitle, unit: detectGoalUnit(cleanTitle, t) }
  } catch {
    return fallback
  }
}

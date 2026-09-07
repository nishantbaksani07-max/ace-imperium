import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

/**
 * /api/brand/intake — turns a free-text "what are you building?" answer
 * into a pre-filled brand template.
 *
 * Pipes a short user description to Claude Haiku, which picks one of
 * eight archetypes, suggests a short name + blurb + emoji, and writes
 * 3 follow-up questions the UI can ask. The picked archetype maps onto
 * the static template library in archetypes.ts — accounts / links /
 * KPIs come from there, not from the model. That keeps the response
 * deterministic and the AI cost predictable.
 *
 * Cost ≈ $0.002 per call with prompt caching on the long system block.
 * Worth the spend to avoid making non-creator users hand-pick from a
 * grid of generic categories.
 */

const SYSTEM_PROMPT = `You help a user set up a "brand" entry in a portfolio-tracking app. They've typed a short description of what they're building, and you have to map it to one of eight archetypes plus a short name, blurb, emoji, and a few follow-up questions for the UI to ask.

Archetypes — pick exactly ONE:

- "creator"      — social-first creator (TikTok / Instagram / YouTube / podcasts, content cadence)
- "shop"         — selling product (Etsy, Shopify, ecom, resell, prints)
- "service"      — freelance, agency, coaching, consulting (selling time + craft)
- "channel"      — long-form publisher (newsletter, podcast, blog, Substack)
- "product"      — indie product (SaaS, app, game, tool, dev project)
- "construction" — trades / contractor / local service (construction, plumbing, landscaping, cleaning, handyman, hvac, etc)
- "restaurant"   — hospitality (restaurant, café, bar, food truck, catering)
- "other"        — only if NONE of the above fits; e.g. nonprofit, art studio without ecom, hobby with no commerce angle

Output schema — return ONLY this JSON object, no prose, no markdown fences:

{
  "archetype": "<one of the eight strings above>",
  "name": "<3-5 word brand name extracted or inferred from the description>",
  "blurb": "<one-line description, max 90 chars, no trailing period>",
  "emoji": "<one emoji that fits the brand>",
  "followups": ["<question 1>", "<question 2>", "<question 3>"]
}

Rules:

1. NAME: if the user named the thing ("my brand is Cool Co"), use it. Otherwise infer a short working name from the activity ("Tea Studio", "Praze TikTok", "Austin Construction"). Title case. Never invent unrelated words.

2. BLURB: one tight line that captures what they're building. No fluff. Examples: "Looksmaxxing + lock-in shorts on TikTok", "Wood furniture for small studios in Brooklyn", "B2B SaaS for indie podcasters".

3. EMOJI: a single emoji that visually matches. Use the obvious ones: 🎥 for video creator, 🛍️ for shop, 💼 for freelance, 📡 for newsletter, 🛠️ for product, 🏗️ for construction, 🍽️ for restaurant. For "other", pick something fitting (e.g. 🎨 for art studio, ❤️ for nonprofit).

4. FOLLOWUPS: three short questions (under 60 chars each) the UI will ask the user to fill the brand out. Tailor to the archetype:
   - creator → ask about platforms, posting cadence, niche
   - shop → ask about platform (Etsy / Shopify / etc), product type, monthly revenue range
   - service → ask about client niche, pricing model, lead source
   - channel → ask about platform, cadence, audience size
   - product → ask about stage (MVP / launched), tech stack, MRR
   - construction → ask about service area, job type, average job size
   - restaurant → ask about cuisine / concept, seating capacity, reservation channel
   - other → ask three open questions that help the user clarify

5. If the description is too short or ambiguous to pick confidently, lean toward the closest fit; never refuse.

Return ONLY the JSON object.`

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicResponse {
  content?: AnthropicTextBlock[]
  error?: { message?: string }
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number }
}

interface IntakeOutput {
  archetype: string
  name: string
  blurb: string
  emoji: string
  followups: string[]
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI intake not configured. Admin needs to set ANTHROPIC_API_KEY.' }, { status: 500 })
  }

  let body: { description?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const description = String(body.description || '').trim()
  if (!description) {
    return NextResponse.json({ error: 'description required' }, { status: 400 })
  }
  // Loose cap to keep token bills sane on adversarial input.
  if (description.length > 600) {
    return NextResponse.json({ error: 'description too long (600 char max)' }, { status: 400 })
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        temperature: 0,
        // System prompt is constant and big; marking it for ephemeral
        // (5-min) caching cuts subsequent input cost by ~90%.
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          { role: 'user', content: description },
        ],
      }),
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      return NextResponse.json({
        error: `Claude returned ${res.status}`,
        detail: errBody.slice(0, 200),
      }, { status: 502 })
    }

    const data = await res.json() as AnthropicResponse
    const raw = data.content?.[0]?.text?.trim() ?? ''
    if (!raw) {
      return NextResponse.json({ error: 'Empty response from Claude' }, { status: 502 })
    }

    // Strip an accidental ```json fence if Claude added one despite the
    // instructions — small belt-and-braces.
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    let parsed: IntakeOutput
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: 'Claude returned non-JSON', raw: raw.slice(0, 200) }, { status: 502 })
    }

    const archetype = String(parsed.archetype || '').toLowerCase()
    if (!ARCHETYPES.includes(archetype)) {
      return NextResponse.json({ error: `Invalid archetype: ${archetype}` }, { status: 502 })
    }

    return NextResponse.json({
      archetype,
      name: String(parsed.name || '').slice(0, 80),
      blurb: String(parsed.blurb || '').slice(0, 120),
      emoji: String(parsed.emoji || '').slice(0, 4),
      followups: Array.isArray(parsed.followups)
        ? parsed.followups.slice(0, 5).map(q => String(q).slice(0, 200))
        : [],
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

const ARCHETYPES = [
  'creator', 'shop', 'service', 'channel',
  'product', 'construction', 'restaurant', 'other',
]

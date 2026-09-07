import { NextRequest, NextResponse } from 'next/server'

import { requireUser } from '@/lib/auth/require-tier'

export const runtime = 'nodejs'
export const maxDuration = 20

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const CLAUDE_API_VERSION = '2023-06-01'
// Use the same model the photo scanner runs on — it is proven reachable with
// this API key in prod. (The cheaper Haiku tier is not always enabled on the
// key, which silently 4xx'd here.) A one-liner on Sonnet is still cheap.
const EXPLAIN_MODEL = process.env.CLAUDE_EXPLAIN_MODEL || process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'

interface ExplainBody {
  name?: string
  usdaDescription?: string
}

// "What is this?" — a friendly one-liner for a food the user doesn't recognize
// (e.g. pepperoncini). Not the macros, just what the thing IS.
export async function POST(request: NextRequest) {
  const gate = await requireUser()
  if (!gate.ok) return gate.response

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI is not configured.' }, { status: 500 })
  }

  let body: ExplainBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const name = (body.name || '').trim().slice(0, 120)
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  const usda = (body.usdaDescription || '').trim().slice(0, 200)

  const prompt =
    `In ONE short, friendly sentence, tell someone who has never heard of it what this food is: "${name}".` +
    (usda ? ` (USDA match: "${usda}")` : '') +
    ` Plain English, no markdown, no calories or macros, under 25 words. ` +
    `Say what it is and what it tastes like or how it is used.`

  try {
    const res = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': CLAUDE_API_VERSION,
      },
      body: JSON.stringify({
        model: EXPLAIN_MODEL,
        max_tokens: 90,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      console.error('[nutrition/explain-food] Claude', res.status, await res.text())
      return NextResponse.json({ error: 'Could not look that up right now.' }, { status: 502 })
    }
    const data = await res.json()
    const text: string =
      Array.isArray(data.content) && data.content[0]?.type === 'text'
        ? String(data.content[0].text).trim()
        : ''
    if (!text) return NextResponse.json({ error: 'No explanation available.' }, { status: 502 })

    return NextResponse.json(
      { text },
      // Same food → same answer; let the edge cache it for a day.
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=86400' } }
    )
  } catch (err) {
    console.error('[nutrition/explain-food]', err)
    return NextResponse.json({ error: 'Could not look that up right now.' }, { status: 502 })
  }
}

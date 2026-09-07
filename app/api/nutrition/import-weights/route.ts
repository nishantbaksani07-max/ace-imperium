import { NextRequest, NextResponse } from 'next/server'

import { requireUser } from '@/lib/auth/require-tier'
import { getLocalDateKey } from '@/lib/dates'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/*
 * Nutrition · import-weights — the "Bring your history" vision path.
 *
 * Takes a screenshot from a weight/health app (WHOOP, Apple Health, Withings,
 * Renpho, a scale app, a spreadsheet) — or messy pasted text the client-side
 * regex parser (lib/nutrition/parseWeighIns) couldn't crack — and asks Claude
 * to pull out every { date, weight }. Grammar-constrained JSON, so the response
 * is guaranteed to match the schema. The client converts → kg and confirms
 * before anything is saved (saveWeights, fill-gaps-only).
 *
 * Server-only: the Anthropic key stays on the server (CLAUDE.md hard rule #4).
 */

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const CLAUDE_API_VERSION = '2023-06-01'
// Sonnet reads varied app screenshots reliably; weight extraction is simpler
// than food, so override down to Haiku with CLAUDE_IMPORT_MODEL to save cost.
const DEFAULT_MODEL = 'claude-sonnet-4-6'

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    unit: { type: 'string', enum: ['kg', 'lb'] },
    weighIns: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD' },
          value: { type: 'number', description: 'weight exactly as shown, in `unit`' },
        },
        required: ['date', 'value'],
      },
    },
  },
  required: ['unit', 'weighIns'],
}

interface Body {
  imageBase64?: string
  mediaType?: string
  text?: string
}

interface OutWeighIn { date: string; value: number }

export async function POST(request: NextRequest) {
  const gate = await requireUser()
  if (!gate.ok) return gate.response

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI import not configured. Admin needs to set ANTHROPIC_API_KEY.' },
      { status: 500 },
    )
  }

  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const { imageBase64, mediaType, text } = body
  if (!imageBase64 && !(text && text.trim())) {
    return NextResponse.json({ error: 'Provide a screenshot or some text.' }, { status: 400 })
  }

  const today = getLocalDateKey()
  const system =
    "You extract body-weight history from a screenshot or pasted text from a weight/health app " +
    '(WHOOP, Apple Health, Withings, Renpho, Fitbit, a smart scale, or a spreadsheet). ' +
    'Return EVERY weigh-in as { date: "YYYY-MM-DD", value: <weight exactly as shown> }. ' +
    'Detect the unit shown (kg or lb) and report it once in `unit`; report values in that unit, un-converted. ' +
    'IGNORE body-fat %, BMI, muscle mass, water %, goal lines, and any number that is not a scale weight. ' +
    `If a date has no year, use the most recent past occurrence relative to today (${today}). ` +
    'Order oldest-first. If you cannot read any weigh-ins, return an empty array.'

  const userContent: Array<Record<string, unknown>> = []
  if (imageBase64) {
    userContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType || 'image/png', data: imageBase64 } })
  }
  if (text && text.trim()) {
    userContent.push({ type: 'text', text: 'Pasted text:\n' + text.trim().slice(0, 8000) })
  }

  const payload = {
    model: process.env.CLAUDE_IMPORT_MODEL || DEFAULT_MODEL,
    max_tokens: 4096,
    system: [{ type: 'text', text: system }],
    messages: [{ role: 'user', content: userContent }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 52_000)
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
      console.error(`[nutrition/import-weights] Claude ${res.status}:`, errText.slice(0, 400))
      return NextResponse.json(
        { error: res.status === 401 ? 'AI import is misconfigured.' : 'Could not read that right now.' },
        { status: res.status === 401 ? 500 : 502 },
      )
    }

    const data = await res.json()
    const out: string | undefined = data.content?.[0]?.text
    if (!out) return NextResponse.json({ error: 'Empty response.' }, { status: 502 })

    let parsed: { unit?: string; weighIns?: OutWeighIn[] }
    try {
      parsed = JSON.parse(out)
    } catch {
      return NextResponse.json({ error: 'Unreadable response.' }, { status: 502 })
    }

    const unit = parsed.unit === 'lb' ? 'lb' : 'kg'
    // light server-side sanity filter; the client does plausibility + confirm
    const rows = (parsed.weighIns || [])
      .filter((w) => w && /^\d{4}-\d{1,2}-\d{1,2}$/.test(String(w.date)) && Number.isFinite(w.value) && w.value > 0)
      .map((w) => ({ date: String(w.date), value: Number(w.value) }))

    return NextResponse.json({ unit, weighIns: rows })
  } catch (err) {
    if (controller.signal.aborted) {
      return NextResponse.json({ error: 'That took too long — try a clearer screenshot.' }, { status: 504 })
    }
    console.error('[nutrition/import-weights] network error:', err)
    return NextResponse.json({ error: 'Connection to Claude failed.' }, { status: 502 })
  } finally {
    clearTimeout(timer)
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserPreferences, type MentorTone } from '@/lib/preferences'
import { isDuplicateFact, readFacts, selectRelevantFacts, writeFact } from '@/lib/memory/userFacts'
import { ASK_GLYPH_NAMES, resolveAskGlyph } from '@/lib/vee/askGlyphs'
import { gatherSignal } from '@/lib/vitals/signalData'
import { buildTileContextLines } from '@/lib/tiles/tileContext'
import { groupReportRows, type ReportKind, type GoalDirection, type TileStreamRow, type TileReportRow } from '@/lib/tiles/reportContract'
import { findStreamConnections, connectionContextLines, type OutcomeDef } from '@/lib/insights/streamConnections'
import { toDailySeries } from '@/lib/insights/series'
import { MOOD_KIND, buildMoodStrip, moodLabel } from '@/app/app/mentor/moodData'
import { isContextKind } from '@/app/app/mentor/contextStubs'
import type { VeeAsk } from '@/app/app/mentor/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/*
 * Mentor chat — the AI that knows the user.
 *
 * Accepts { messages: ChatMessage[] }. Pulls the user's recent data across
 * every module currently in Supabase (profile, water, workouts, weights,
 * wearable_data) plus all of their notes, packages a compact context block
 * into the system prompt, and forwards the conversation to Claude.
 *
 * Finance state lives in localStorage today (BUILD12) — not visible to the
 * server. When it moves to Supabase, add it here.
 *
 * Cost-shape: every message hits Claude with the full context block, so the
 * input grows with the user's history. Keep windows tight (7d for daily logs,
 * 30 most-recent notes). Tier gating belongs here — gated to "pro" once
 * profiles.tier is enforced; today it allows any signed-in user so we can
 * dogfood it.
 */

const SYSTEM_PROMPT_PREAMBLE = `You are Vee, the Vitality mentor. One mind that has read every part of this user's life in the app: training, fuel, vitals, goals, money, how they feel (their mood), what is going on in their life, and the thoughts they throw into the void. You are always in their corner.

Your job is to be useful, not chatty. Help the user think clearly about their health, habits, finances, and life. Reference their actual data when it's relevant. When the user has dumped notes into their inbox (the void), treat those as standing reminders or goals they want you to hold for them. Your signature move is connecting two areas of their life that they treat as separate.

VOICE
- Warm, calm, plain. Short sentences. Lowercase is fine. No emoji. Never use em dashes or en dashes; use periods or "and" instead.
- Never shame. When something is off target, stay encouraging and name the smallest next move. The user should leave wanting to come back.
- Never open with "Great question!" or close with "Let me know if you need anything else!" — just answer.
- When you don't know something, say so. Never invent data. If asked about a metric that isn't in the context block, say it isn't connected yet.

RESPONSE FORMAT (strict — the UI renders this as designed cards, NOT a document. A wall of prose is a failure.)
- Hard cap ~75 words total. Shorter is better. The user has Google for essays. They came here for the point.
- ALWAYS this shape:
  1. One short lead line: the single most important takeaway, in plain words. This is the headline.
  2. Then a bulleted list (each bullet starts with "- ") carrying the supporting points. Almost every reply should use bullets, not paragraphs. Two to four bullets. Each bullet is ONE tight clause, not a sentence stack.
- Bold the one load-bearing phrase in the lead and in each bullet using **double asterisks**. Exactly one bold phrase per line. This is what the user's eye lands on, so make it the real signal (a number, a body part, a verb to act on).
- Reference their actual data as the bold phrase when you can (e.g. **10 workouts**, **no water logged**, **right shoulder**).
- Never write two prose paragraphs in a row. If you have more than one thought, they go in bullets.
- Plain text + "- " bullets + **bold** only. No headers (#), no tables, no code blocks, no emoji.
- End with the answer. Only add a question if it truly unblocks them, and prefer an ask card for that (see ASK CARDS).`

/*
 * Shared-brain write path. Vee appends durable facts after a marker the UI
 * never sees; we strip the block, validate, and persist via user_facts.
 * Single Claude call — no second "extract facts" round trip, no extra latency.
 */
const MEMORY_MARKER = '===MEMORY==='

const MEMORY_INSTRUCTION = `

MEMORY (strict)
You have a durable memory (shown under WHAT YOU REMEMBER). If the user's LATEST message reveals a new durable fact worth holding onto (a preference, goal, constraint, identity, or life detail that will still matter in a month), then after your reply append a line containing exactly ${MEMORY_MARKER} followed by a JSON array, e.g.
${MEMORY_MARKER}
[{"kind":"preference","body":"prefers evening workouts","salience":0.6}]
- kind is one of: preference, goal, constraint, identity, event.
- body is a tight note about the user, like a sticky note: under about 8 words, lower case, no trailing period. Just the thing itself (e.g. "right knee pain, sharp on squats" not "the user reports sharp pain in their right knee as of today"). Never put a date in the body, the timestamp is stored separately. salience is 0 to 1 (how much future advice should weigh it).
- Only durable facts. Never daily metrics already in the context block, never things you already remember.
- If there is nothing new, do not output the marker at all. The user never sees anything after the marker.`

const FACT_KINDS = new Set(['preference', 'goal', 'constraint', 'identity', 'event'])

/*
 * Ask cards. When a clarifying question with a few discrete answers is the most
 * useful reply, Vee appends a hidden ===ASK=== block (parallel to ===MEMORY===)
 * and the UI renders it as a cozy tappable card instead of a prose question.
 */
const ASK_MARKER = '===ASK==='
const ALL_MARKERS = [ASK_MARKER, MEMORY_MARKER]

const ASK_INSTRUCTION = `

ASK CARDS (prefer these for any clarifying question)
Whenever your reply is, or ends with, a clarifying question that has a small set of natural answers (2 to 4), do NOT ask in prose. Ask with a card instead. The card IS the question. This is the signature of the app and far better than a wall of text the user has to type a reply to. Keep your visible reply to at most one short sentence (or empty), then append a line containing exactly ${ASK_MARKER} followed by a JSON object, e.g.
${ASK_MARKER}
{"tag":"quick check","lead":"Where's the knee landing?","key":"knee","sub":"One tap and I will tailor today around it.","options":[{"label":"Sharp","value":"it's a sharp pain","glyph":"sharp"},{"label":"Dull ache","value":"a dull ache","glyph":"dull"},{"label":"Swelling","value":"there's swelling","glyph":"swelling"},{"label":"Just stiff","value":"it's just stiff","glyph":"stiff"}]}
- tag: 1 to 2 word lowercase label, e.g. "quick check", "one more".
- lead: the question itself, short, no em dashes. This is the only place the question appears.
- key: the single most important word in lead to highlight. It must appear in lead exactly. Omit if nothing stands out.
- sub: one short helper line, optional.
- options: 2 to 4. label is the short chip text. value is what gets sent back as the user's answer in their natural words. glyph MUST be one of: ${ASK_GLYPH_NAMES.join(', ')}. If unsure, use "dull".
- ordered: if the answers form a scale that runs least to most (how bad, how sore, how are you feeling, how hard), add "ordered":true and list options from least to most. Otherwise omit it. The UI shows ordered questions as a dial or meter.
- Ask ONE thing per card. Only use a card when the answers are a small discrete set. For anything open-ended, answer or ask in prose with no marker.
- If you also have a memory to save, put the ${ASK_MARKER} block first, then the ${MEMORY_MARKER} block.
- The user never sees anything after a marker. The card replaces the question.`

interface ExtractedFact { kind: string; body: string; salience?: number }
interface RawAskOption { label?: unknown; value?: unknown; glyph?: unknown }
interface RawAsk { tag?: unknown; lead?: unknown; key?: unknown; sub?: unknown; options?: unknown; ordered?: unknown }

/** Hard guarantee against em/en dashes (the "reads like ChatGPT" tell). The
 *  prompt forbids them but models slip; this never lets one reach the user. */
function noDashes(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ', ')
}

/** The JSON body between a marker and the next marker (or end), fence-stripped. */
function sliceBlock(raw: string, marker: string): string | null {
  const i = raw.indexOf(marker)
  if (i === -1) return null
  let end = raw.length
  for (const other of ALL_MARKERS) {
    const j = raw.indexOf(other, i + marker.length)
    if (j !== -1 && j < end) end = j
  }
  return raw.slice(i + marker.length, end).replace(/^```(?:json)?|```$/g, '').trim()
}

function parseFacts(block: string | null): ExtractedFact[] {
  if (!block) return []
  try {
    const parsed = JSON.parse(block) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((f): f is ExtractedFact =>
        !!f && typeof f === 'object'
        && typeof (f as ExtractedFact).body === 'string'
        && (f as ExtractedFact).body.trim().length > 0
        && (f as ExtractedFact).body.length <= 300
        && FACT_KINDS.has(String((f as ExtractedFact).kind)))
      .slice(0, 3)
  } catch {
    return []
  }
}

function parseAsk(block: string | null): VeeAsk | null {
  if (!block) return null
  try {
    const p = JSON.parse(block) as RawAsk
    if (!p || typeof p !== 'object') return null
    const lead = typeof p.lead === 'string' ? noDashes(p.lead.trim()) : ''
    if (!lead || lead.length > 140) return null
    const rawOpts = Array.isArray(p.options) ? (p.options as RawAskOption[]) : []
    const options = rawOpts
      .filter(o => !!o && typeof o === 'object'
        && typeof o.label === 'string' && o.label.trim().length > 0
        && typeof o.value === 'string' && o.value.trim().length > 0)
      .slice(0, 4)
      .map(o => ({
        label: noDashes((o.label as string).trim()).slice(0, 28),
        value: noDashes((o.value as string).trim()).slice(0, 160),
        glyph: resolveAskGlyph(o.glyph),
      }))
    if (options.length < 2) return null
    const tag = (typeof p.tag === 'string' && p.tag.trim() ? p.tag.trim() : 'quick check').slice(0, 24)
    const key = typeof p.key === 'string' && p.key.trim() ? p.key.trim().slice(0, 40) : undefined
    const sub = typeof p.sub === 'string' && p.sub.trim() ? noDashes(p.sub.trim()).slice(0, 160) : undefined
    const ordered = p.ordered === true ? true : undefined
    return { tag, lead, key, sub, options, ordered }
  } catch {
    return null
  }
}

/** Split Vee's raw output into the visible reply + an optional ask card + facts.
 *  (Not exported — Next route files may only export route handlers.) */
function parseVeeOutput(raw: string): { reply: string; ask: VeeAsk | null; facts: ExtractedFact[] } {
  let firstIdx = raw.length
  for (const m of ALL_MARKERS) {
    const i = raw.indexOf(m)
    if (i !== -1 && i < firstIdx) firstIdx = i
  }
  const reply = raw.slice(0, firstIdx).trim()
  return { reply, ask: parseAsk(sliceBlock(raw, ASK_MARKER)), facts: parseFacts(sliceBlock(raw, MEMORY_MARKER)) }
}

interface ChatMessage { role: 'user' | 'assistant'; content: string }
interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicResponse { content?: AnthropicTextBlock[]; error?: { message?: string } }

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgoKey(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Mentor is not configured on the server' }, { status: 500 })
  }

  const payload = await request.json().catch(() => null) as { messages?: ChatMessage[] } | null
  if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) {
    return NextResponse.json({ error: 'missing_messages' }, { status: 400 })
  }

  const messages = payload.messages
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-20)
  if (messages.length === 0) {
    return NextResponse.json({ error: 'no_valid_messages' }, { status: 400 })
  }

  // Pull a compact slice of the user's data in parallel.
  const since = daysAgoKey(7)
  const sinceMonth = daysAgoKey(30)
  const [
    profileRes,
    notesRes,
    waterRes,
    workoutsRes,
    weightsRes,
    wearableRes,
    prefs,
    allFacts,
    tileStreamsRes,
    tileReportsRes,
    outcome56Res,
    workouts56Res,
  ] = await Promise.all([
    supabase.from('user_profile').select('first_name, sex, height_cm, starting_weight_kg, goal, units').eq('user_id', user.id).maybeSingle(),
    supabase.from('notes').select('body, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
    supabase.from('water_log').select('date, amount_ml').eq('user_id', user.id).gte('date', since).order('date', { ascending: false }),
    supabase.from('workouts').select('date, day_name, submitted_at').eq('user_id', user.id).gte('date', since).order('date', { ascending: false }),
    supabase.from('weights').select('date, weight_kg').eq('user_id', user.id).gte('date', sinceMonth).order('date', { ascending: false }).limit(30),
    supabase.from('wearable_data').select('date, recovery, sleep_hours, sleep_perf, hrv, rhr, strain').eq('user_id', user.id).gte('date', since).order('date', { ascending: false }),
    getUserPreferences(supabase, user.id),
    readFacts(supabase, user.id),
    // the user's OWN built tiles (report contract) — so Vee can talk about the
    // beer tracker or reading timer they made as naturally as workouts. 56d so
    // the same rows also feed the deterministic connections scan below.
    supabase.from('tile_streams').select('id, tile_id, key, canonical_key, label, kind, goal_direction').eq('user_id', user.id),
    supabase.from('tile_reports').select('stream_id, stream_key, value, date').eq('user_id', user.id).gte('date', daysAgoKey(56)),
    // 56d outcome series (recovery/sleep) + workouts — the other half of the scan
    supabase.from('wearable_data').select('date, recovery, sleep_hours').eq('user_id', user.id).gte('date', daysAgoKey(56)),
    supabase.from('workouts').select('date').eq('user_id', user.id).not('submitted_at', 'is', null).gte('date', daysAgoKey(56)),
  ])

  // The same fused daily read the Vitals page shows, so Vee references today's
  // signal and stays consistent with the page. Runs after the batch so it can
  // reuse allFacts (no duplicate user_facts query). Best-effort, never throws.
  const signal = await gatherSignal(supabase, user.id, todayKey(), { facts: allFacts ?? [] }).catch(() => null)

  const profile = profileRes.data
  const notes = notesRes.data ?? []
  const waterByDay = new Map<string, number>()
  for (const row of waterRes.data ?? []) {
    waterByDay.set(row.date as string, (waterByDay.get(row.date as string) ?? 0) + Number(row.amount_ml ?? 0))
  }
  const workouts = workoutsRes.data ?? []
  const weights = weightsRes.data ?? []
  const wearable = wearableRes.data ?? []

  const contextLines: string[] = []
  contextLines.push(`Today: ${todayKey()}`)
  if (profile) {
    contextLines.push(
      `Profile: ${profile.first_name ?? '(no name)'} · sex=${profile.sex ?? '—'} · goal=${profile.goal ?? '—'} · units=${profile.units ?? '—'} · height=${profile.height_cm ?? '—'}cm · starting weight=${profile.starting_weight_kg ?? '—'}kg`
    )
  } else {
    contextLines.push('Profile: not yet onboarded.')
  }

  if (waterByDay.size > 0) {
    const formatted = Array.from(waterByDay.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([d, ml]) => `${d}: ${(ml / 1000).toFixed(1)}L`)
      .join(' · ')
    contextLines.push(`Water (last 7d): ${formatted}`)
  } else {
    contextLines.push('Water (last 7d): no entries.')
  }

  if (workouts.length > 0) {
    const formatted = workouts.map(w => `${w.date} ${w.day_name}${w.submitted_at ? ' ✓' : ''}`).join(' · ')
    contextLines.push(`Workouts (last 7d): ${formatted}`)
  } else {
    contextLines.push('Workouts (last 7d): none logged.')
  }

  if (weights.length > 0) {
    const latest = weights[0]
    const oldest = weights[weights.length - 1]
    const delta = Number(latest.weight_kg) - Number(oldest.weight_kg)
    contextLines.push(
      `Weight: latest ${Number(latest.weight_kg).toFixed(1)}kg on ${latest.date}; ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}kg over ${weights.length} entries in the last 30d.`
    )
  } else {
    contextLines.push('Weight: no entries in the last 30d.')
  }

  if (wearable.length > 0) {
    const formatted = wearable.slice(0, 7).map(w => {
      const parts: string[] = [w.date as string]
      if (w.recovery != null) parts.push(`recovery=${w.recovery}`)
      if (w.sleep_hours != null) parts.push(`sleep=${Number(w.sleep_hours).toFixed(1)}h`)
      if (w.strain != null) parts.push(`strain=${Number(w.strain).toFixed(1)}`)
      if (w.hrv != null) parts.push(`hrv=${Number(w.hrv).toFixed(0)}`)
      if (w.rhr != null) parts.push(`rhr=${w.rhr}`)
      return parts.join(' ')
    }).join(' · ')
    contextLines.push(`Wearable (last 7d): ${formatted}`)
  } else {
    contextLines.push('Wearable (last 7d): not connected.')
  }

  // Their OWN tiles (Phase 2 of Vee-as-the-middle). One dense line per stream,
  // capped at 8, built by the tested formatter — the user BUILT these trackers,
  // so Vee referencing them by name is the "it knows my whole board" moment.
  const tileStreams: TileStreamRow[] = (tileStreamsRes.data ?? []).map(r => ({
    id: String(r.id),
    tileId: (r.tile_id ?? '') as string,
    key: r.key as string,
    canonicalKey: (r.canonical_key ?? r.key) as string,
    label: r.label as string,
    kind: r.kind as ReportKind,
    goalDirection: (r.goal_direction ?? null) as GoalDirection | null,
  }))
  const tileReports: TileReportRow[] = (tileReportsRes.data ?? []).map(r => ({
    streamId: r.stream_id ? String(r.stream_id) : undefined,
    streamKey: r.stream_key as string,
    value: Number(r.value),
    date: String(r.date).slice(0, 10),
  }))
  const tileLines = buildTileContextLines(tileStreams, tileReports, todayKey())
  if (tileLines.length > 0) {
    contextLines.push(`Tiles they built themselves (their own trackers):\n${tileLines.map(l => `- ${l}`).join('\n')}`)
  }

  // "Vee connects" — deterministic cross-stream links (tile x recovery/sleep/
  // training), verified by the gated scan, so Vee can CITE a real pattern
  // instead of inventing one. At most two lines; silent when nothing is true.
  if (tileStreams.length > 0) {
    const outcomes: OutcomeDef[] = [
      {
        name: 'recovery', label: 'recovery',
        points: toDailySeries(
          (outcome56Res.data ?? []).map(r => ({ date: String(r.date), value: r.recovery != null ? Number(r.recovery) : null })),
          { density: 'daily', agg: 'mean' },
        ).points,
      },
      {
        name: 'sleep', label: 'sleep',
        points: toDailySeries(
          (outcome56Res.data ?? []).map(r => ({ date: String(r.date), value: r.sleep_hours != null ? Number(r.sleep_hours) : null })),
          { density: 'daily', agg: 'mean' },
        ).points,
      },
      {
        name: 'training', label: 'training',
        points: toDailySeries(
          (workouts56Res.data ?? []).map(r => ({ date: String(r.date), value: 1 })),
          { density: 'daily', agg: 'count' },
        ).points,
      },
    ]
    const connections = findStreamConnections(
      groupReportRows(tileStreams, tileReports).map(({ def, rows }) => ({ def, rows })),
      outcomes,
    )
    const connLines = connectionContextLines(connections)
    if (connLines.length > 0) {
      contextLines.push(
        `Connections verified in their data (deterministic, safe to cite):\n${connLines.map(l => `- ${l}`).join('\n')}`,
      )
    }
  }

  // Mood — the user's own daily read. The "how you feel" half of every connection
  // Vee makes (feelings x sleep/training/spending). Sits next to the wearable data
  // on purpose so the model can tie them together.
  const moodStrip = buildMoodStrip(
    allFacts.filter(f => f.kind === MOOD_KIND).map(f => ({ body: f.body, createdAt: f.createdAt })),
    todayKey(),
    7,
  )
  const moodLogged = moodStrip.filter(p => p.score != null)
  if (moodLogged.length > 0) {
    const trend = moodStrip.map(p => (p.score != null ? moodLabel(p.score) : '—')).join(', ')
    const todayScore = moodStrip[moodStrip.length - 1].score
    contextLines.push(`Mood (last 7d, oldest to today): ${trend}.${todayScore != null ? ' Today: ' + moodLabel(todayScore) + '.' : ''}`)
  } else {
    contextLines.push('Mood (last 7d): not logged yet.')
  }

  // Today's fused signal — the same read the Vitals page shows. Keeps Vee
  // consistent with what the user just saw on their signal card.
  if (signal) {
    contextLines.push(
      `\nTODAY'S SIGNAL (Vitality's fused read): ${signal.badge}, ${signal.verdict} Why: ${signal.why}${signal.goalLine ? ' Goal: ' + signal.goalLine : ''}`
    )
  }

  if (notes.length > 0) {
    const formatted = notes.map(n => `[${(n.created_at as string).slice(0, 10)}] ${n.body}`).join('\n')
    contextLines.push(`\nUser notes (most recent first):\n${formatted}`)
  } else {
    contextLines.push('\nUser notes: empty.')
  }

  // The shared brain. Every module writes user_facts; Vee reads the most
  // salient slice here and grows it via the MEMORY marker after each reply.
  // mental_health facts (life context + mood) are surfaced separately below, so
  // exclude them here to avoid raw "Mood today: 4/5" lines cluttering the list.
  const memoryFacts = selectRelevantFacts(allFacts.filter(f => f.source !== 'mental_health'), { now: new Date().toISOString(), limit: 30 })
  if (memoryFacts.length > 0) {
    const formatted = memoryFacts.map(f => `[${f.source}/${f.kind}] ${f.body}`).join('\n')
    contextLines.push(`\nWHAT YOU REMEMBER (durable facts, [source/kind] fact):\n${formatted}`)
  } else {
    contextLines.push('\nWHAT YOU REMEMBER: nothing yet. You are still getting to know them.')
  }

  // Life context the user told Vee directly (the "Folded Notes"). Backstory Vee
  // cannot infer from metrics. Use it to respond like someone who actually knows them.
  const lifeFacts = allFacts.filter(f => f.source === 'mental_health' && isContextKind(f.kind))
  if (lifeFacts.length > 0) {
    const formatted = lifeFacts.map(f => `[${f.kind}] ${f.body}`).join('\n')
    contextLines.push(`\nTHEIR LIFE (in their own words, [area] note):\n${formatted}`)
  }

  // Pull tailoring preferences into the system prompt. Mentor tone +
  // focus override the default voice direction; Goal slice + Mentor
  // memory_notes become standing context the model holds across every
  // message. All optional — missing = use defaults.
  const toneBlock = buildToneBlock(prefs.mentor?.tone)
  const focusBlock = prefs.mentor?.focus && prefs.mentor.focus.length > 0
    ? `\n\nFOCUS\nThe user has flagged these as the areas they want you focused on: ${prefs.mentor.focus.join(', ')}. Lead with these when relevant; deprioritize others.`
    : ''
  const memoryBlock = prefs.mentor?.memory_notes && prefs.mentor.memory_notes.trim()
    ? `\n\nUSER NOTES TO REMEMBER (persistent — keep in mind every message)\n${prefs.mentor.memory_notes.trim()}`
    : ''
  const systemPrompt = `${SYSTEM_PROMPT_PREAMBLE}${ASK_INSTRUCTION}${MEMORY_INSTRUCTION}${toneBlock}${focusBlock}${memoryBlock}\n\n--- USER CONTEXT ---\n${contextLines.join('\n')}\n--- END CONTEXT ---`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    })

    const rawText = await res.text()
    let data: AnthropicResponse
    try {
      data = JSON.parse(rawText) as AnthropicResponse
    } catch {
      return NextResponse.json({ error: `Anthropic returned non-JSON: ${rawText.slice(0, 200)}` }, { status: 502 })
    }

    if (!res.ok) {
      console.error('[mentor/chat] Anthropic error:', res.status, data?.error?.message)
      return NextResponse.json({ error: data?.error?.message || `Anthropic ${res.status}` }, { status: 502 })
    }

    const text = data?.content?.[0]?.text
    if (typeof text !== 'string') {
      return NextResponse.json({ error: 'Empty response from Vee' }, { status: 502 })
    }

    const parsed = parseVeeOutput(text)
    const reply = noDashes(parsed.reply)
    const { ask, facts } = parsed
    if (facts.length > 0) {
      // Dedup guard. Haiku ignores the "never things you already remember"
      // instruction and re-logs the same ongoing thing every turn (e.g. the
      // knee), so drop any fact already covered by an existing one — and dedup
      // within this batch too. allFacts is every stored fact, not just the
      // salient slice, so an old memory still suppresses a fresh duplicate.
      const seen = allFacts.map(f => f.body)
      const fresh = facts.filter(f => {
        const body = f.body.trim()
        if (!body || isDuplicateFact(body, seen)) return false
        seen.push(body)
        return true
      })
      // writeFact never throws; a lost fact must never block the reply.
      await Promise.all(fresh.map(f => writeFact(supabase, user.id, {
        source: 'mentor',
        kind: f.kind,
        body: f.body.trim(),
        salience: typeof f.salience === 'number' ? Math.min(1, Math.max(0, f.salience)) : 0.5,
      })))
    }

    // A card-only reply is valid (the question lives in the card), so only the
    // both-empty case is a real failure.
    if (!reply && !ask) {
      return NextResponse.json({ error: 'Empty response from Vee' }, { status: 502 })
    }
    return NextResponse.json({ reply, ask })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'chat_failed'
    console.error('[mentor/chat]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Tone instructions injected when the user has completed the Mentor
 * Voice quiz. Each block REPLACES the default VOICE guidance the
 * preamble suggests — model only sees one direction, never a conflict.
 */
function buildToneBlock(tone?: MentorTone): string {
  if (!tone) return ''
  switch (tone) {
    case 'direct':
      return '\n\nTONE OVERRIDE\nThe user has asked for direct delivery — cut the fluff. Give them the answer in the first sentence, no preamble, no soft hedges. Be confident and brief.'
    case 'encouraging':
      return '\n\nTONE OVERRIDE\nThe user has asked for an encouraging tone — warm, in their corner, like a coach who believes in them. Lead with what\'s working before naming what to fix.'
    case 'data_driven':
      return '\n\nTONE OVERRIDE\nThe user has asked for a data-driven tone — cite the numbers from the context block. Frame recommendations as "given X, Y is the move because Z." Probability + reasoning over assertion.'
    case 'socratic':
      return '\n\nTONE OVERRIDE\nThe user has asked for a Socratic tone — ask one sharp question back that helps them think. Don\'t just answer; surface the thing they should be looking at. Trust them to do the work.'
  }
}

import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

/*
 * Finance Coach — "Echo" retargeted to money (Phase 6).
 *
 * Modeled 1:1 on app/api/coach/route.ts: server-side Anthropic key only
 * (CLAUDE.md rule #4), tier-gated via the coachAccess() seam (rule #5), latest
 * Claude model. Unlike the Fuel coach it does NOT read a Supabase context /
 * memory tables (those are nutrition-specific and would need a migration) — the
 * client sends a finance snapshot (net worth, subs, upcoming bills, recent
 * spend, budget) and we summarize it into the system prompt.
 *
 * Modes: `score` returns { score, reason } (today's money verdict, 1–10);
 *        `chat`  returns { reply }.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// "latest Claude model" (the brief). Overridable via env without a redeploy.
const DEFAULT_MODEL = 'claude-opus-4-8'

interface UpcomingBill { name: string; amountCHF: number; daysUntil: number }
interface CoachAlert { kind: 'trial' | 'hike'; name: string; detail: string }
interface TopCategory { category: string; totalCHF: number }

/** The finance snapshot the client builds from useFinanceState() + helpers. */
interface FinanceCoachSnapshot {
  currency: string
  netWorthCHF: number
  monthlyBurnCHF: number
  assetsCHF?: number
  debtCHF?: number
  cryptoCHF?: number
  upcomingBills?: UpcomingBill[]
  alerts?: CoachAlert[]
  thisMonthSpendCHF?: number
  lastMonthSpendCHF?: number
  thisMonthIncomeCHF?: number
  netCashFlowCHF?: number
  budgetCHF?: number | null
  topCategories?: TopCategory[]
  runwayMonths?: number | null
  goalCHF?: number | null
  goalPct?: number | null
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

interface FinanceCoachRequest {
  mode: 'score' | 'chat'
  snapshot: FinanceCoachSnapshot
  messages?: ChatMessage[]
}

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicResponse { content?: AnthropicTextBlock[]; error?: { message?: string } }

/**
 * The one tier seam. Returns a 402 response to block, or null to allow. Open
 * today so we can dogfood; to gate later, return
 * `NextResponse.json({ error: 'requires_pro' }, { status: 402 })` for non-pro.
 */
function coachAccess(_tier: string | null): NextResponse | null {
  return null
}

const fmt = (chf: number, ccy: string) =>
  `${ccy} ${(Number(chf) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

/** Render the snapshot into a compact brief Echo reasons over. */
function snapshotText(s: FinanceCoachSnapshot): string {
  const ccy = s.currency || 'CHF'
  const lines: string[] = []
  lines.push(`Net worth: ${fmt(s.netWorthCHF, ccy)}`)
  if (s.debtCHF != null && s.debtCHF > 0) {
    const assetsPart = s.assetsCHF != null ? `${fmt(s.assetsCHF, ccy)} assets − ` : ''
    lines.push(`Debt: ${assetsPart}${fmt(s.debtCHF, ccy)} owed`)
  }
  if (s.cryptoCHF != null && s.cryptoCHF > 0) lines.push(`Crypto holdings: ${fmt(s.cryptoCHF, ccy)}`)
  lines.push(`Subscriptions: ${fmt(s.monthlyBurnCHF, ccy)} / month`)
  if (s.thisMonthSpendCHF != null) {
    const vs = s.lastMonthSpendCHF != null ? ` (last month ${fmt(s.lastMonthSpendCHF, ccy)})` : ''
    lines.push(`Spent this month: ${fmt(s.thisMonthSpendCHF, ccy)}${vs}`)
  }
  if (s.thisMonthIncomeCHF != null && s.thisMonthIncomeCHF > 0) {
    const net = s.netCashFlowCHF != null ? `, net ${s.netCashFlowCHF >= 0 ? '+' : '−'}${fmt(Math.abs(s.netCashFlowCHF), ccy)}` : ''
    lines.push(`Income this month: ${fmt(s.thisMonthIncomeCHF, ccy)}${net}`)
  }
  if (s.runwayMonths != null) lines.push(`Runway: ~${s.runwayMonths >= 99 ? '99+' : s.runwayMonths.toFixed(1)} months of cash cushion`)
  if (s.budgetCHF != null) lines.push(`Monthly budget: ${fmt(s.budgetCHF, ccy)}`)
  if (s.goalCHF != null) {
    const pct = s.goalPct != null ? ` (${Math.round(s.goalPct)}% there)` : ''
    lines.push(`Net-worth goal: ${fmt(s.goalCHF, ccy)}${pct}`)
  }
  if (s.topCategories?.length) {
    lines.push('Top spend: ' + s.topCategories.slice(0, 4).map(c => `${c.category} ${fmt(c.totalCHF, ccy)}`).join(', '))
  }
  if (s.upcomingBills?.length) {
    lines.push('Upcoming bills: ' + s.upcomingBills.slice(0, 6).map(b => `${b.name} ${fmt(b.amountCHF, ccy)} in ${b.daysUntil}d`).join(', '))
  }
  if (s.alerts?.length) {
    lines.push('Alerts: ' + s.alerts.slice(0, 6).map(a => `${a.name} (${a.kind}) — ${a.detail}`).join('; '))
  }
  return lines.join('\n')
}

function buildSystemPrompt(s: FinanceCoachSnapshot): string {
  return [
    'You are Echo, a calm, sharp personal-finance coach inside the Vitality app.',
    'You speak to the user about THEIR money only, using the snapshot below. Be warm,',
    'concrete, and brief. No preamble, no disclaimers, no markdown headings. One or two',
    'short sentences unless asked for more. Never invent numbers not in the snapshot;',
    'if something is missing, say what to add. Amounts are already in the user\'s currency.',
    'When relevant, weigh debt payoff, cash runway, this-month cash flow (income vs spend),',
    'and progress toward their net-worth goal — not just spending.',
    'Respond with only the final answer — do not narrate your reasoning.',
    '',
    "Today's finance snapshot:",
    snapshotText(s),
  ].join('\n')
}

const SCORE_INSTRUCTION =
  'Rate the user\'s money situation today from 1 (rough) to 10 (great) given the snapshot, ' +
  'weighing upcoming bills, overspend vs budget, subscription burn, debt load, cash runway, ' +
  'this-month cash flow, goal progress, and net worth direction. ' +
  'Reply ONLY with compact JSON: {"score": <1-10 integer>, "reason": "<one short sentence>"}.'

async function callClaude(
  apiKey: string,
  model: string,
  system: string,
  messages: ChatMessage[],
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
    console.error('[finance-coach] Anthropic error:', res.status, data?.error?.message)
    return { error: data?.error?.message || `Anthropic ${res.status}`, status: 502 }
  }
  const text = data?.content?.[0]?.text
  if (typeof text !== 'string') return { error: 'Empty response from coach', status: 502 }
  return { text: text.trim() }
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
      // fall through
    }
  }
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

  const payload = (await request.json().catch(() => null)) as FinanceCoachRequest | null
  if (!payload || (payload.mode !== 'score' && payload.mode !== 'chat') || !payload.snapshot) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const model = process.env.FINANCE_COACH_MODEL || DEFAULT_MODEL
  const system = buildSystemPrompt(payload.snapshot)

  try {
    if (payload.mode === 'score') {
      const hasData = (payload.snapshot.netWorthCHF || 0) > 0 || (payload.snapshot.monthlyBurnCHF || 0) > 0
      if (!hasData) {
        return NextResponse.json({ score: null, reason: 'Add an account or a subscription and I will take a look.' })
      }
      const result = await callClaude(apiKey, model, system, [{ role: 'user', content: SCORE_INSTRUCTION }], 220)
      if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
      return NextResponse.json(parseScore(result.text))
    }

    // chat mode
    const messages = (payload.messages ?? [])
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-16)
    if (messages.length === 0) return NextResponse.json({ error: 'no_message' }, { status: 400 })
    const result = await callClaude(apiKey, model, system, messages, 320)
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ reply: result.text })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'coach_failed'
    console.error('[finance-coach]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

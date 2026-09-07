/**
 * claudeHandoff - the pure prefill composer for every "open in Claude" hop on
 * the Vee page. v1 keeps the destination (claude.ai/new) but Claude arrives
 * already knowing the user: the question is followed by a compact context
 * block assembled SERVER-SIDE from data loadNoticed already fetched (no new
 * DB reads). Everything in the block is a real, logged fact: first name,
 * active goals with category + trend state, the visible notice lead, the
 * honest life chips, and the days-logged count. Nothing is invented; an empty
 * field is simply omitted, and a context with nothing real collapses to the
 * bare question.
 *
 * Pure module: no imports from the app, safe on server and client.
 */

export interface HandoffGoal {
  title: string
  /** The goal's category word (fitness, money, ...) or null pre-triage. */
  category: string | null
  /** The trend word the board shows: rising / steady / drifting / no data yet. */
  state: string
}

export interface ClaudeHandoffContext {
  firstName: string | null
  /** Real distinct days with any logged data (VeeRunStats.daysLogged). */
  daysLogged: number
  /** Active goals, priority order. */
  goals: HandoffGoal[]
  /** The lead sentence of the notice currently on the card, when one exists. */
  noticeLead: string | null
  /** The honest live-stat chips (label + value), e.g. train 3.7x/wk. */
  lifeChips: { label: string; value: string }[]
  /** Which Vitality modules actually have data (loadNoticed activeModules). */
  activeModules: string[]
}

/** One quick-question chip: the visible title + the prompt handed to Claude. */
export interface QuickQuestion {
  title: string
  prompt: string
}

/* The per-module question bank, in surfacing priority order. A question is
 * offered ONLY when its module has real data behind it (activeModules), so
 * nobody is asked about water they never logged. */
const MODULE_QUESTIONS: { module: string; q: QuickQuestion }[] = [
  { module: 'train', q: { title: 'How is my training going?', prompt: 'how is my training going?' } },
  { module: 'recovery', q: { title: 'How is my recovery trending?', prompt: 'how is my recovery trending?' } },
  { module: 'macros', q: { title: 'Am I eating enough protein?', prompt: 'am i eating enough protein?' } },
  { module: 'weight', q: { title: 'Is my weight moving the right way?', prompt: 'is my weight moving the right way?' } },
  { module: 'water', q: { title: 'Am I drinking enough water?', prompt: 'am i drinking enough water?' } },
  { module: 'finance', q: { title: 'Where is my money heading?', prompt: 'where is my money heading?' } },
  { module: 'brand', q: { title: 'How is my audience growing?', prompt: 'how is my audience growing?' } },
  { module: 'supplements', q: { title: 'Am I consistent with my stack?', prompt: 'am i consistent with my supplement stack?' } },
]

/* Nothing tracked yet: two generic questions, never a claim about data. */
const GENERIC_QUESTIONS: QuickQuestion[] = [
  { title: 'What should I focus on today?', prompt: 'what should i focus on today?' },
  { title: 'How do I build a routine that sticks?', prompt: 'how do i build a routine that sticks?' },
]

const MAX_QUESTIONS = 4

/** The quick-question chips, built from what the user ACTUALLY tracks. */
export function quickQuestions(activeModules: string[] | undefined | null): QuickQuestion[] {
  const active = new Set(activeModules ?? [])
  const matched = MODULE_QUESTIONS.filter(m => active.has(m.module)).map(m => m.q)
  if (matched.length === 0) return GENERIC_QUESTIONS
  return matched.slice(0, MAX_QUESTIONS)
}

/* Length discipline: goal titles are server-capped at 200 chars and up to 5 are
 * included, and non-ASCII text percent-encodes at 6-12 chars per char, so an
 * unclamped block can push the href past what claude.ai (or a proxy) accepts.
 * Clip the long fields here, and clamp the final href below. */
const MAX_TITLE_CHARS = 60
const MAX_LEAD_CHARS = 160
const MAX_HREF_CHARS = 3800

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

/** The compact context block. Returns '' when nothing real is known. */
export function contextBlock(ctx: ClaudeHandoffContext | null | undefined): string {
  if (!ctx) return ''
  const lines: string[] = []
  if (ctx.firstName) lines.push(`My name is ${ctx.firstName}.`)
  if (ctx.daysLogged > 0) lines.push(`Days of data logged: ${ctx.daysLogged}.`)
  if (ctx.goals.length > 0) {
    const gl = ctx.goals
      .slice(0, 5)
      .map(g => `${clip(g.title, MAX_TITLE_CHARS)} (${g.category ?? 'goal'}, ${g.state})`)
      .join('; ')
    lines.push(`Active goals: ${gl}.`)
  }
  if (ctx.noticeLead) lines.push(`Vee's latest find: "${clip(ctx.noticeLead, MAX_LEAD_CHARS)}"`)
  if (ctx.lifeChips.length > 0) {
    lines.push(`Live stats: ${ctx.lifeChips.map(c => `${c.label} ${c.value}`).join(', ')}.`)
  }
  if (ctx.activeModules.length > 0) lines.push(`I track: ${ctx.activeModules.join(', ')}.`)
  if (lines.length === 0) return ''
  return `Context from my Vitality dashboard (all real logged data):\n${lines.map(l => `- ${l}`).join('\n')}`
}

/** Question + context, ready for the q= prefill. Falls back to the bare question. */
export function composePrefill(question: string, ctx: ClaudeHandoffContext | null | undefined): string {
  const q = question.trim()
  const block = contextBlock(ctx)
  return block ? `${q}\n\n${block}` : q
}

/** The full claude.ai/new URL for a question, context attached when real.
 *  Hard cap: if the encoded href still overruns (many long non-ASCII goal
 *  titles), the context block is dropped and the bare question ships intact —
 *  a shorter hop always beats a truncated or rejected one. */
export function claudeHandoffHref(question: string, ctx: ClaudeHandoffContext | null | undefined): string {
  const full = `https://claude.ai/new?q=${encodeURIComponent(composePrefill(question, ctx))}`
  if (full.length <= MAX_HREF_CHARS) return full
  return `https://claude.ai/new?q=${encodeURIComponent(question.trim())}`
}

/* ---- server-side assembly (pure; called by the pages with loadNoticed data) ---- */

/** The board's trend word for a ticker state (mirrors the goals board copy). */
function stateWord(state: string | undefined): string {
  switch (state) {
    case 'on-track': return 'rising'
    case 'drifting': return 'drifting'
    case 'holding': return 'steady'
    default: return 'no data yet'
  }
}

export interface BuildHandoffInput {
  firstName: string | null
  daysLogged: number
  /** Active goals only (status === 'active'), already priority sorted. */
  goals: { id: string; title: string; cleanTitle?: string | null; category: string | null }[]
  /** Per-goal steering rows: id matches goal id, carries the trend state. */
  rows: { id: string; state: string }[]
  /** The feed as passed to the card; the first notice is the visible one. */
  feed: { lead: string }[]
  lifeChips: { label: string; value: string }[]
  activeModules: string[]
}

/** Assemble the handoff context from data loadNoticed already returned. */
export function buildHandoffContext(input: BuildHandoffInput): ClaudeHandoffContext {
  const rowById = new Map(input.rows.map(r => [r.id, r.state]))
  return {
    firstName: input.firstName,
    daysLogged: input.daysLogged,
    goals: input.goals.map(g => ({
      title: g.cleanTitle ?? g.title,
      category: g.category,
      state: stateWord(rowById.get(g.id)),
    })),
    noticeLead: input.feed[0]?.lead ?? null,
    lifeChips: input.lifeChips.map(c => ({ label: c.label, value: c.value })),
    activeModules: input.activeModules,
  }
}

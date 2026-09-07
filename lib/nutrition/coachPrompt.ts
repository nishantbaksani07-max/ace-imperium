/**
 * Coach prompt builder — pure.
 *
 * Turns the day's nutrition snapshot into the plain-English question we hand to
 * Claude via `claude.ai/new?q=` — the same zero-cost-to-us doorway the workout
 * logger uses. The Fuel coach card maps its computed totals + targets into a
 * CoachDaySnapshot and calls this; the string is what the user sees pre-filled
 * in a fresh Claude chat. If they have the Vitality MCP connector set up, Claude
 * can pull the rest (recent meals, weight trend, training, goals) live — which
 * is why the closing line invites it. No IO here; numbers in, string out.
 * See app/app/fuel/CoachDoorway.tsx for the caller.
 */

export interface CoachDaySnapshot {
  /** Friendly label for the day, e.g. "today". */
  dayLabel: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  kcalTarget: number
  proteinTarget: number
  /** The deterministic card read, attached so Claude starts where the user is. */
  score: number | null
  scoreReason: string
}

function round(n: number): number {
  return Math.round(n)
}

/**
 * The day's context lines, human-readable (no leading bullet). Used by the
 * doorway's "what Claude sees" preview so the preview is literally a subset of
 * the sent prompt — honest, not a separate hand-written claim.
 */
export function coachContextLines(snap: CoachDaySnapshot): string[] {
  const lines: string[] = []
  const kcalT = snap.kcalTarget > 0 ? ` / ${round(snap.kcalTarget)} target` : ''
  const proT = snap.proteinTarget > 0 ? ` / ${round(snap.proteinTarget)}g target` : ''
  lines.push(`Calories: ${round(snap.kcal)}${kcalT}`)
  lines.push(`Protein: ${round(snap.protein)}g${proT}`)
  lines.push(`Carbs: ${round(snap.carbs)}g · Fat: ${round(snap.fat)}g`)
  if (snap.score != null) {
    lines.push(`Today's read: ${snap.score}/10 — ${snap.scoreReason}`)
  }
  return lines
}

/**
 * @param userMessage what the user typed in the doorway. When present it LEADS
 *   the prompt (their words first) and the day is attached below as context.
 *   When empty we fall back to a warm "coach me on today" question.
 */
export function buildCoachPrompt(snap: CoachDaySnapshot, userMessage?: string): string {
  const body = coachContextLines(snap).join('\n')
  const closing =
    'Keep it warm and specific, like a coach who actually knows me. You can also pull my recent meals, weight trend, training, and goals from my Vitality data if it helps.'
  const msg = (userMessage ?? '').trim()

  if (msg) {
    return [
      msg,
      ``,
      `For context, here's my nutrition ${snap.dayLabel}.`,
      body,
      ``,
      closing,
    ].join('\n')
  }

  return [
    `Be my food coach. Here's my nutrition ${snap.dayLabel}.`,
    body,
    ``,
    `What should I eat for the rest of the day, and how am I really tracking?`,
    closing,
  ].join('\n')
}

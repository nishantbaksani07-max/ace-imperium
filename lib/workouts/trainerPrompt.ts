/**
 * Trainer prompt builder — pure.
 *
 * Turns a live workout snapshot into the plain-English question we hand to
 * Claude via `claude.ai/new?q=`. The logger maps its in-progress React state
 * into a TrainerSnapshot (resolving exercise names + converting kg to the
 * user's display unit) and calls this; the string is what the user sees
 * pre-filled in a fresh Claude chat. If they also have the Vitality MCP
 * connector set up, Claude can pull the rest (history, sleep, readiness) live —
 * which is why the closing line invites it. No IO here; display-unit in,
 * string out. See app/app/fitness/log/TrainerDoorway.tsx for the caller.
 */

export interface TrainerSet {
  /** Already converted to the user's display unit (lb or kg). */
  weight: number | null
  reps: number | null
  /** User tapped "log" — a completed set. */
  done: boolean
  /** User tapped "miss" — attempted but failed. */
  failed: boolean
}

export interface TrainerExercise {
  name: string
  sets: TrainerSet[]
  /** Heaviest prior top set, in display units. null when no history. */
  prevBest: { weight: number; reps: number } | null
}

export interface TrainerSnapshot {
  /** e.g. "Push heavy". */
  dayName: string
  /** "lb" or "kg" — appended to every weight. */
  unitLabel: string
  exercises: TrainerExercise[]
  /** The lift the user is currently on (most recent acted-on set), or null. */
  focusName: string | null
}

function roundW(n: number): number {
  return Math.round(n * 10) / 10
}

function fmtSet(s: TrainerSet, index: number, unit: string): string {
  const hasW = s.weight != null
  const hasR = s.reps != null
  let core: string
  if (hasW && hasR) core = `${roundW(s.weight as number)} ${unit} x ${s.reps}`
  else if (hasR) core = `${s.reps} reps`
  else if (hasW) core = `${roundW(s.weight as number)} ${unit}`
  else core = 'logged'
  return `set ${index + 1} ${core}${s.failed ? ' (missed)' : ''}`
}

function fmtExercise(ex: TrainerExercise, unit: string): string {
  const acted = ex.sets
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.done || s.failed)
  const best = ex.prevBest
    ? ` [best ${roundW(ex.prevBest.weight)} ${unit} x ${ex.prevBest.reps}]`
    : ''
  if (acted.length === 0) return `- ${ex.name}: not started${best}`
  const sets = acted.map(({ s, i }) => fmtSet(s, i, unit)).join(', ')
  return `- ${ex.name}: ${sets}${best}`
}

/**
 * The per-exercise context lines, human-readable (no leading bullet). Used by
 * the doorway's "what Claude sees" preview so the preview is literally a subset
 * of the sent prompt — honest, not a separate hand-written claim.
 */
export function trainerContextLines(snap: TrainerSnapshot): string[] {
  const unit = snap.unitLabel || 'lb'
  return snap.exercises.map((ex) => fmtExercise(ex, unit).replace(/^- /, ''))
}

/**
 * @param userMessage what the user typed in the doorway. When present it LEADS
 *   the prompt (their words first) and the live session is attached below as
 *   context. When empty we fall back to a generic "coach me" question built
 *   around the focus lift.
 */
export function buildTrainerPrompt(snap: TrainerSnapshot, userMessage?: string): string {
  const unit = snap.unitLabel || 'lb'
  const lines = snap.exercises.map((ex) => fmtExercise(ex, unit))
  const body = lines.length ? lines.join('\n') : '(no exercises loaded yet)'
  const closing = `Keep it short and specific, like a coach on the gym floor. You can also pull my recent training, sleep, and readiness from my Vitality data if it helps.`
  const msg = (userMessage ?? '').trim()

  if (msg) {
    return [
      msg,
      ``,
      `For context, here's my live workout right now.`,
      `Day: ${snap.dayName}.`,
      body,
      ``,
      closing,
    ].join('\n')
  }

  const ask = snap.focusName
    ? `I just got stuck on ${snap.focusName}. What should I do for the rest of this lift and the rest of my session?`
    : `What should I focus on to get the most out of the rest of this session?`
  return [
    `I'm in the middle of a workout and want quick, no-nonsense coaching.`,
    `Day: ${snap.dayName}.`,
    ``,
    `Where I am right now:`,
    body,
    ``,
    ask,
    closing,
  ].join('\n')
}

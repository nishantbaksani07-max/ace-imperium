// The macro setup quiz doesn't persist its raw answers server-side (only the
// computed plan is saved). We cache the answers + a human-readable summary in
// localStorage so the Targets panel can show "what you picked" and the quiz can
// pre-fill on a redo. Device-local is fine for v1 (same browser that took the
// quiz); the done-lock card falls back to the DB-derived plan when absent.

import type { QuizAnswers } from '@/components/Quiz'

export const MACRO_ANSWERS_KEY = 'vitality_macro_answers_v1'

// One summarized pick, ready to render as a chip (e.g. {label:'Goal', value:'Lose weight'}).
export interface MacroPick {
  label: string
  value: string
}

export interface MacroAnswersCache {
  answers: QuizAnswers
  picks: MacroPick[]
}

export function saveMacroAnswers(cache: MacroAnswersCache): void {
  try {
    localStorage.setItem(MACRO_ANSWERS_KEY, JSON.stringify(cache))
  } catch {
    // ignore (private mode / quota)
  }
}

export function loadMacroAnswers(): MacroAnswersCache | null {
  try {
    const raw = localStorage.getItem(MACRO_ANSWERS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const c = parsed as Partial<MacroAnswersCache>
    if (!c.answers || !Array.isArray(c.picks)) return null
    return { answers: c.answers, picks: c.picks }
  } catch {
    return null
  }
}

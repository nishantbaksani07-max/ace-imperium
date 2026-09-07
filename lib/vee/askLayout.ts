/*
 * Vee ask-card layout picker.
 *
 * Vee asks every clarifying question as a cozy card, but a paid app should never
 * feel repetitive, so each card wears one of a family of layouts and one of a
 * pool of slow entrance + lead-reveal animations, chosen to fit the question and
 * rotated so the same shape never shows twice in a row. The visual designs live
 * in public/mentor-ask-layouts.html (the kit library, Page 3 of the Vee kit).
 *
 * Pure + deterministic given its inputs (the randomness is injected by the
 * caller once per message, then frozen on the message so re-renders are stable).
 */

export type LayoutKind =
  | 'chips' | 'cards' | 'segmented' | 'trail' | 'fillpills' | 'spotlight' | 'tiles'
  | 'dial' | 'meter' | 'split'

/** Layouts suitable for a plain pick-one question (3 to 4 options). */
const PICK_POOL: LayoutKind[] = ['chips', 'cards', 'segmented', 'trail', 'fillpills', 'spotlight', 'tiles']
/** Layouts that read well for a two-way choice. */
const BINARY_POOL: LayoutKind[] = ['split', 'segmented', 'cards', 'chips']
/** Layouts for an ordered / severity question ("how bad", "how are you feeling"). */
const ORDERED_POOL: LayoutKind[] = ['dial', 'meter']

const ENTRANCES = ['ePop', 'eDrift', 'eBloom', 'eGlide', 'eSettle', 'eFade', 'eUnfold', 'eTilt']
const LEAD_MODES = ['w', 'wRise', 'wFade', 'line']

export interface CardStyle {
  layout: LayoutKind
  entrance: string
  leadMode: string
}

function pick<T>(arr: readonly T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)]
}

/**
 * Choose a layout + animation pair for a question. `recent` is the list of the
 * last few layouts used (newest last); we avoid those so consecutive cards
 * differ. `rnd` defaults to Math.random but is injectable for tests.
 */
export function makeCardStyle(
  ask: { ordered?: boolean; options: unknown[] },
  recent: LayoutKind[] = [],
  rnd: () => number = Math.random,
): CardStyle {
  const pool = ask.ordered
    ? ORDERED_POOL
    : ask.options.length === 2
      ? BINARY_POOL
      : PICK_POOL
  const fresh = pool.filter(l => !recent.includes(l))
  const layout = pick(fresh.length ? fresh : pool, rnd)
  return { layout, entrance: pick(ENTRANCES, rnd), leadMode: pick(LEAD_MODES, rnd) }
}

/** Layouts that present an ordered scale (tapping a stop = that level). */
export const ORDERED_LAYOUTS: ReadonlySet<LayoutKind> = new Set<LayoutKind>(['dial', 'meter'])

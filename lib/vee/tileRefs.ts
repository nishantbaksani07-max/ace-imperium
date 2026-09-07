/**
 * tileRefs — turn an insight's honest "watched" label into the SEAM: the sources
 * Vee cross-referenced to find it, so the Noticed card can show "Vitals x Train x
 * Peak" using each source's CURRENT name (respecting a core-tile rename, e.g.
 * Train -> "Workout Page"). Pure + total: unknown tokens simply match nothing.
 *
 * Seam sources are the core tiles (Train, Fuel, Vitals, Finance) PLUS two personal
 * inputs — Mood and Notes — so a user's mood taps and notes-to-self earn
 * accountability in the same gamified system: feed Vee more, and it has more
 * corners of your life to connect. The seam LENGTH is the story — more sources
 * connected = a rarer find.
 *
 * Peak and Brand are de-cored side projects (launch strip 2026-07-12) that do not
 * work yet, so they are deliberately NOT seam sources: their tokens (caffeine,
 * followers...) simply match nothing here. Finance stays a core tile + seam source.
 * See SIDE_PROJECT_IDS in lib/tiles/coreTiles.tsx.
 */

import { CORE_TILES, type CoreTileId } from '@/lib/tiles/coreTiles'

/** A seam source: a core tile, or one of the two personal inputs. */
export type SeamSource = CoreTileId | 'mood' | 'notes'

/** Canonical labels for the non-tile inputs (core tiles carry their own label). */
const INPUT_LABELS: Record<'mood' | 'notes', string> = { mood: 'Mood', notes: 'Notes' }

/** Keyword map per source, tested in priority order so an ambiguous token lands on
 *  the more specific source (recovery -> vitals, not peak). Whole-word-ish match. */
const SOURCE_KEYWORDS: Array<[SeamSource, string[]]> = [
  ['mood', ['mood', 'feeling', 'feelings', 'stress', 'stressed', 'energy', 'motivation']],
  ['notes', ['note', 'notes', 'journal', 'reflection', 'wrote', 'logged a note']],
  ['vitals', ['recovery', 'sleep', 'hrv', 'resting', 'rhr', 'readiness', 'strain', 'wearable', 'oura', 'whoop', 'fitbit', 'heart', 'steps', 'rest', 'vitals']],
  ['train', ['training', 'train', 'workout', 'lift', 'lifts', 'bench', 'squat', 'deadlift', 'press', 'ohp', 'row', 'curl', 'volume', 'session', 'sessions', 'gym', 'split', 'deload', 'reps', 'sets', 'strength', 'hypertrophy', 'pr', '1rm']],
  ['fuel', ['protein', 'macro', 'macros', 'calorie', 'calories', 'kcal', 'carb', 'carbs', 'water', 'hydration', 'hydrate', 'supplement', 'supplements', 'creatine', 'meal', 'meals', 'food', 'diet', 'weight', 'weigh', 'bodyweight', 'cut', 'bulk', 'maintenance', 'fuel']],
  // Finance is a core tile (works, fully feeds Vee), so it is a seam source.
  ['finance', ['finance', 'money', 'spend', 'spending', 'networth', 'subscription', 'subscriptions', 'order', 'orders', 'income', 'revenue', 'budget', 'savings', 'wishlist']],
  // Peak and Brand are de-cored side projects that do not work yet: NOT seam
  // sources, so their tokens (caffeine, followers...) intentionally match nothing.
]

/** Which seam source (if any) a single domain token belongs to. */
function sourceForToken(token: string): SeamSource | null {
  const t = token.toLowerCase().trim()
  if (!t) return null
  for (const [id, words] of SOURCE_KEYWORDS) {
    if (words.some(w => t === w || t.includes(w))) return id
  }
  return null
}

/**
 * The seam an insight cross-referenced, in order of first appearance, deduped,
 * capped. Reads the free-text "watched" label ("caffeine + recovery + training")
 * plus the goal title (a goal like "bench 100kg" pins Train).
 */
export function seamForNotice(
  watched: string | null | undefined,
  goalTitle?: string | null,
  cap = 3,
): SeamSource[] {
  const out: SeamSource[] = []
  const push = (id: SeamSource | null) => {
    if (id && !out.includes(id)) out.push(id)
  }
  const source = `${watched ?? ''} ${goalTitle ?? ''}`
  for (const token of source.split(/[+·,&/|]|\bx\b|\band\b|\s+/i)) {
    push(sourceForToken(token))
    if (out.length >= cap) break
  }
  return out.slice(0, cap)
}

/**
 * A seam source's CURRENT display name — a core tile's user rename if set, else
 * the canonical label — capped so a long custom name never breaks the seam.
 * `customNames` is the map read from the client's tile skins (mood/notes are
 * fixed labels and ignore it).
 */
export function resolveSourceName(
  id: SeamSource,
  customNames: Partial<Record<string, string>>,
  cap = 14,
): string {
  const label = id === 'mood' || id === 'notes' ? INPUT_LABELS[id] : CORE_TILES[id].label
  const raw = (customNames[id]?.trim() || label).trim()
  if (raw.length <= cap) return raw
  return `${raw.slice(0, cap - 1).trimEnd()}…`
}

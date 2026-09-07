/**
 * The "Vitality noticed" cooldown ledger — gating the §01 cross-domain card so a
 * found insight lands like a gift, never a feed of repeats.
 *
 * Modeled 1:1 on the drift cooldown (lib/goals/drift.ts): a pure read-side that,
 * given a per-pattern ledger snapshot, decides whether a seam is still resting.
 * The difference is the unit of rest: drift rests a *kind* (train/fuel/recovery),
 * this rests a *pattern* (the cross-domain pairing, e.g. caffeine x recovery), so
 * a fresh seam can still surface while a recently-shown one stays quiet.
 *
 * Pure + IO-free (unit-tested in __tests__/noticedLedger.test.ts). The Supabase
 * read/write lives in the gather (app/app/mentor/page.tsx) + a server action.
 */

export type NoticedResolution = 'dismissed' | 'talk'

/** The latest ledger row for one pattern, in the shape the gather builds. */
export interface NoticedCooldown {
  lastShownAt: string | null // ISO timestamp of the latest show of this pattern
  resolution: NoticedResolution | null // null = shown but not yet acted on
}

// How long a pattern stays quiet. Launch cadence (Alex, 2026-07-11): a plain
// show rests ~5 days, not two weeks - Vee should feel PRESENT, and a pattern
// the user merely scrolled past may return within the week. Rarity itself
// keeps the deep finds rare (rarityOf is depth-based: an epic needs 3+
// domains converging, which no cooldown can manufacture; the cold-start
// firstFind notices cover day one so nobody quits un-noticed). Once the user
// has RESOLVED a pattern (dismissed it or took it into Claude) it rests a
// full month, honouring that they have had this one.
export const NOTICED_COOLDOWN_DAYS: Record<'shown' | NoticedResolution, number> = {
  shown: 5,
  dismissed: 30,
  talk: 30,
}

/** Whole days between two dates (either ISO or YYYY-MM-DD; only the day matters). */
export function daysBetween(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey.slice(0, 10)}T00:00:00`)
  const b = Date.parse(`${toKey.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

/** A stable, order-independent key for a seam, from its scored domains.
 *  ['recovery','caffeine'] and ['caffeine','recovery'] both -> 'caffeine+recovery',
 *  so one pattern can never split into two ledger clocks. */
export function patternKeyOf(domains: readonly string[]): string {
  return [...domains]
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('+')
}

/** True if this pattern is still resting, so Vee keeps it back this open. */
export function onNoticeCooldown(today: string, cd: NoticedCooldown | undefined): boolean {
  if (!cd || !cd.lastShownAt) return false
  const since = daysBetween(cd.lastShownAt, today)
  const window = cd.resolution ? NOTICED_COOLDOWN_DAYS[cd.resolution] : NOTICED_COOLDOWN_DAYS.shown
  return since < window
}

/** Drop any seam candidate whose pattern is still resting, keeping the rest in
 *  order. The engine then picks the strongest of what is left — so a recently
 *  shown seam steps aside and a fresh one can take the card. */
export function selectFresh<T extends { score: { domains: string[] } }>(
  candidates: ReadonlyArray<T | null | undefined>,
  cooldownByKey: Record<string, NoticedCooldown>,
  today: string,
): T[] {
  return candidates
    .filter((c): c is T => !!c)
    .filter((c) => !onNoticeCooldown(today, cooldownByKey[patternKeyOf(c.score.domains)]))
}

/**
 * Vee rarity mapping — turns a real, deterministic "Vitality noticed" insight into
 * an OG-loot rarity tier for the feed UI. Pure, total, and never throws: any
 * unrecognized input degrades to 'common'.
 *
 * It honors the engine's own grade first (a FeedNotice.rarity set by the correlation
 * engine on a cross-domain fusion seam). When the engine left it blank (a momentum
 * row, a drift nudge, the cold-start promise) it derives a floor from the insight's
 * SOURCE and lifts it by DEPTH (distinct life-domains named in the "watched" label)
 * and STRENGTH (how many real receipts back it). No LLM, no randomness — the same
 * insight always maps to the same tier.
 *
 * Pure + IO-free + unit-tested (see __tests__/veeRarity.test.ts).
 */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic'

/** Lowest to highest. Higher = deeper + rarer. */
const ORDER: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']

/** The minimal shape read off a FeedNotice. Kept structural so this module stays
 *  decoupled from the feed engine and trivially testable in isolation. */
export interface RarityInput {
  source?: string | null
  rarity?: string | null
  watched?: string | null
  receipts?: readonly unknown[] | null
}

/** Per-source floor: how deep a find from this source is BEFORE depth/strength lift.
 *  oracle = the one true multi-domain convergence; fusion = a real cross-domain seam;
 *  drift = one domain quietly slipping; momentum/starter = a single thread or a promise. */
const SOURCE_FLOOR: Record<string, Rarity> = {
  starter: 'common',
  first: 'common',
  momentum: 'common',
  drift: 'uncommon',
  fusion: 'rare',
  oracle: 'epic',
}

const MEANING: Record<Rarity, string> = {
  common: 'a small true nudge',
  uncommon: 'a solid single link',
  rare: 'a link you would miss',
  epic: 'two or three, one story',
  legendary: 'the lever for a big goal',
  mythic: 'the one you would kill to know',
}

/** A string is a valid Rarity, or null. */
export function normalizeRarity(value: unknown): Rarity | null {
  return typeof value === 'string' && (ORDER as readonly string[]).includes(value)
    ? (value as Rarity)
    : null
}

function clampIndex(i: number): number {
  if (!Number.isFinite(i)) return 0
  return Math.max(0, Math.min(ORDER.length - 1, Math.round(i)))
}

/** Distinct life-domains a find ties together, read from its honest "watched" label
 *  (e.g. "caffeine + recovery", "money x training x mood"). Trailing time windows
 *  like "- 21d" are stripped. Returns 1 when the label is missing or unparseable. */
export function watchedDepth(watched?: string | null): number {
  if (typeof watched !== 'string') return 1
  const parts = watched
    .toLowerCase()
    .split(/[+·,&]|\bx\b|\band\b/)
    .map(p => p.replace(/[-–—].*$/, '').trim())
    .filter(Boolean)
    .filter(p => !/^\d+\s*(d|wk|mo|day|days|weeks?|months?|hr|hrs)?$/.test(p))
  return Math.max(1, new Set(parts).size)
}

/** The rarity of one real insight. Deterministic and total — bad input maps to 'common'. */
export function rarityForNotice(input: RarityInput | null | undefined): Rarity {
  try {
    if (!input) return 'common'

    // The engine's deliberate grade wins when it set one (fusion seams carry it).
    const explicit = normalizeRarity(input.rarity)
    if (explicit) return explicit

    const source = typeof input.source === 'string' ? input.source : ''
    const floor = SOURCE_FLOOR[source] ?? 'common'
    let i = ORDER.indexOf(floor)

    const depth = watchedDepth(input.watched)
    if (depth >= 3) i += 2
    else if (depth >= 2) i += 1

    const strength = Array.isArray(input.receipts) ? input.receipts.length : 0
    if (strength >= 3) i += 1

    return ORDER[clampIndex(i)]
  } catch {
    return 'common'
  }
}

export interface CollectionTier {
  rarity: Rarity
  name: string
  count: number
  mean: string
  /** Marks the single highest tier present — the "just found" glow. */
  cur: boolean
}

/** Tally already-mapped rarities into the six-tier collection grid. `cur` marks the
 *  highest tier present. Always returns all six tiers (zeros included). Never throws. */
export function buildCollection(rarities: readonly Rarity[]): CollectionTier[] {
  const counts: Record<Rarity, number> = {
    common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, mythic: 0,
  }
  const list: readonly Rarity[] = Array.isArray(rarities) ? rarities : []
  for (const r of list) if (r in counts) counts[r] += 1

  let topIndex = -1
  ORDER.forEach((r, i) => { if (counts[r] > 0) topIndex = i })

  return ORDER.map((r, i) => ({
    rarity: r,
    name: r,
    count: counts[r],
    mean: MEANING[r],
    cur: i === topIndex,
  }))
}

/** Total graded finds across the collection. */
export function collectionTotal(tiers: readonly CollectionTier[]): number {
  return (Array.isArray(tiers) ? tiers : []).reduce((sum, t) => sum + (t?.count ?? 0), 0)
}

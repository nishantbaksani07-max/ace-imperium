/**
 * The correlation engine — Stage 4 of the "Vitality noticed" feature. This is the
 * part that turns a pile of true cross-domain findings into the SINGLE insight Vee
 * shows. It grows over time (a registry of domain pairings, receipt derivation,
 * goal-linking); this first piece is the selection brain.
 *
 * THE PRINCIPLE (Alex's north star): always reach for the deepest TRUE insight.
 * A building-block link ("recovery dips after heavy caffeine") is real and useful,
 * but the life-changing insight is when several domains turn out to be ONE story
 * ("your spending climbs the weeks your training drops ... one spiral, not three
 * problems"). Because every leg of a story is independently gated as real by
 * detectSeam, the deepest story is always made of true links, so depth is the
 * right thing to rank on first. Among equally deep insights, the stronger
 * (|r| * n * felt-contrast) wins.
 *
 * Pure + IO-free + unit-tested (see __tests__/correlationEngine.test.ts).
 */

/** A finding ready to be ranked. `domains` are the distinct life domains it links
 *  (2 = a building-block seam, 3+ = a convergence / "one spiral" insight). */
export interface ScoredInsight {
  domains: string[]
  /** Representative correlation strength (a single seam's r, or a convergence's
   *  weakest leg). Sign carries direction; ranking uses its magnitude. */
  r: number
  /** Paired buckets behind it — more evidence, more trust. */
  n: number
  /** Felt-contrast magnitude (how big the difference actually is). */
  contrast: number
}

/** How much evidence + effect an insight carries, within its depth tier. */
const strength = (i: ScoredInsight): number => Math.abs(i.r) * i.n * i.contrast

/** How profound it is: the number of distinct life domains it ties into one story. */
const depth = (i: ScoredInsight): number => new Set(i.domains).size

/**
 * Rank insights deepest-and-strongest first. Depth wins first (the most profound
 * true story is the prize), then strength breaks ties. Stable + deterministic.
 * Generic so richer finding objects rank without losing their extra fields.
 */
export function rankInsights<T extends ScoredInsight>(items: T[]): T[] {
  return [...items].sort((a, b) => depth(b) - depth(a) || strength(b) - strength(a))
}

/** The single insight Vee surfaces, or null when there is nothing true to say
 *  (Vee stays quiet rather than reaching for a weak or invented link). */
export function selectStrongest<T extends ScoredInsight>(items: T[]): T | null {
  return rankInsights(items)[0] ?? null
}

/**
 * A relative, unitless effect size: the gap between two halves as a fraction of their
 * average magnitude. It lets seams measured in different units (recovery %, sessions a
 * week, hours a night) feed a comparable `contrast` into the ranking above. 0 when the
 * halves are equal; never divides by zero. Order-independent (magnitude only).
 */
export function relContrast(hi: number, lo: number): number {
  const denom = (Math.abs(hi) + Math.abs(lo)) / 2
  return denom === 0 ? 0 : Math.abs(hi - lo) / denom
}

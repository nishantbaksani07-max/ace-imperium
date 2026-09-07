/**
 * Insight rarity — the "OG loot" grade Alex loved (public/vee-noticed-rarity-demo.html).
 * Every "Vitality noticed" finding gets a rarity that tells the user how DEEP it goes
 * and how much of their life it took to find. Rarity is not decoration: it is the same
 * depth-first truth the correlation engine ranks on (more domains in one story = rarer),
 * with correlation strength breaking ties inside a tier. The rare ones only surface as
 * the user keeps feeding the engine, which is exactly the compounding pitch made visible.
 *
 * Pure + IO-free + unit-tested (see __tests__/rarity.test.ts).
 */

import type { ScoredInsight } from './correlationEngine'

/** The OG-Fortnite spectrum, lowest to highest. Higher = deeper + rarer. */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic'

/** A strong finding: a high absolute correlation backed by real evidence. Sign is
 *  ignored (a strong inverse link is just as strong as a strong positive one). */
function isStrong(i: ScoredInsight): boolean {
  return Math.abs(i.r) >= 0.7 && i.n >= 12
}

/**
 * The rarity of an insight, from its depth (distinct life domains it ties into one
 * story) and strength. A single cross-domain link is uncommon (the first wiring brick),
 * a two-or-three-domain convergence is rare/epic ("one spiral, not three problems"),
 * and the deepest, strongest spirals are legendary/mythic ("the one you would kill to
 * know"). A lone single-domain signal is a common nudge.
 */
export function rarityOf(i: ScoredInsight): Rarity {
  const depth = new Set(i.domains).size
  const strong = isStrong(i)
  if (depth <= 1) return 'common'
  if (depth === 2) return strong ? 'rare' : 'uncommon'
  if (depth === 3) return strong ? 'epic' : 'rare'
  return strong ? 'mythic' : 'legendary'
}

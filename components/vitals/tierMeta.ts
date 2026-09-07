import type { Tier } from '@/lib/vitals/score'

/** Tier → how many of the five pips are filled. */
export const TIER_PIPS: Record<Tier, number> = {
  'needs-care': 1,
  low: 2,
  steady: 3,
  strong: 4,
  peak: 5,
}

/** Plain-English tier word (the primary, colorblind-safe signal alongside the
 *  pip count). */
export const TIER_WORD: Record<Tier, string> = {
  'needs-care': 'needs care',
  low: 'low',
  steady: 'steady',
  strong: 'strong',
  peak: 'peak',
}

/** Tier hue, as CSS variables so each resolves against the azure page scope.
 *  amber (caution) → neutral → azure (good) → mint (peak only). No red, no
 *  rainbow: meaning rides on the pip count + word, colour only reinforces. */
export const TIER_COLOR: Record<Tier, string> = {
  'needs-care': 'var(--amber-warm)',
  low: 'var(--amber)',
  steady: 'var(--muted-strong)',
  strong: 'var(--accent)',
  peak: 'var(--mint)',
}

/** Font weight rises with tier — a fourth, hue-independent channel. */
export const TIER_WEIGHT: Record<Tier, number> = {
  'needs-care': 400,
  low: 400,
  steady: 500,
  strong: 600,
  peak: 700,
}

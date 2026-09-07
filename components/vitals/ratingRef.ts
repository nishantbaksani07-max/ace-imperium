import type { Tier } from '@/lib/vitals/score'

/**
 * Per-metric rating reference. Tapping a tile's rating opens a card (RatingSheet)
 * that explains what the rating means FOR THAT METRIC:
 *   - measure: a plain one-liner of what the number is
 *   - dir: the good direction (↑ higher better, ↓ lower better, ↔ balanced) so a
 *     "low" rating never reads as bad (e.g. a 39bpm resting HR is elite)
 *   - ladder: what each of the five tiers means for this metric (the direction
 *     row already establishes "vs your baseline", so the rungs stay terse)
 *   - note: one warm, educational line — no fake numbers, robust to live data
 * Keyed by the metric display name used on the dashboard tiles.
 */
export interface RatingRef {
  measure: string
  dir: { ar: '↑' | '↓' | '↔'; text: string }
  ladder: Record<Tier, string>
  note: string
}

export const RATING_REF: Record<string, RatingRef> = {
  Sleep: {
    measure: 'how efficiently you slept last night',
    dir: { ar: '↑', text: 'higher is better' },
    ladder: {
      peak: 'a near-perfect night',
      strong: 'solid and restful',
      steady: 'an okay night',
      low: 'restless or short',
      'needs-care': 'rough, prioritise rest',
    },
    note: 'A high score means most of your time in bed was real sleep, not lying awake.',
  },
  HRV: {
    measure: 'heart rate variability, your recovery readiness',
    dir: { ar: '↑', text: 'higher is better · vs your baseline' },
    ladder: {
      peak: 'well above',
      strong: 'above',
      steady: 'right around',
      low: 'a little under',
      'needs-care': 'well under, ease in',
    },
    note: 'Higher HRV means a more recovered nervous system. Yours reads against your own recent baseline, so a strong number can still sit low on a good day.',
  },
  'Resting HR': {
    measure: 'your resting heart rate, calmer hearts run lower',
    dir: { ar: '↓', text: 'lower is better · vs your baseline' },
    ladder: {
      peak: 'well below',
      strong: 'below',
      steady: 'right around',
      low: 'a little above',
      'needs-care': 'well above, rest up',
    },
    note: 'Lower means a calmer, more recovered heart. Read against your own baseline, so a great number can still tick up on any given day.',
  },
  Strain: {
    measure: 'how well today’s load matched your recovery',
    dir: { ar: '↔', text: 'balanced to your recovery' },
    ladder: {
      peak: 'matched your recovery',
      strong: 'well matched',
      steady: 'a fair match',
      low: 'a bit much today',
      'needs-care': 'overreached',
    },
    note: 'Strain is not good or bad on its own. What matters is whether the load matched what your recovery could handle.',
  },
  'Time asleep': {
    measure: 'total hours you were actually asleep',
    dir: { ar: '↑', text: 'higher is better' },
    ladder: {
      peak: 'a full recharge',
      strong: 'a healthy amount',
      steady: 'enough to get by',
      low: 'a little short',
      'needs-care': 'too little, protect tonight',
    },
    note: 'Total time actually asleep, not just time in bed. More gives your body more room to recover.',
  },
  Recovery: {
    measure: 'how recovered your body is today, from HRV, resting HR and sleep',
    dir: { ar: '↑', text: 'higher is better' },
    ladder: {
      peak: 'fully recharged, ready for more',
      strong: 'well recovered',
      steady: 'a middling, workable day',
      low: 'running a bit low',
      'needs-care': 'depleted, prioritise rest',
    },
    note: 'Recovery blends your HRV, resting heart rate and sleep into one readiness score. Higher means more in the tank today.',
  },
}

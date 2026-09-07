import type { Category } from '@/app/app/fitness/log/splitData'

/**
 * Tech-minimal split-day glyphs for the SessionMenu cards.
 *
 * All six marks are built from the same primitive family as the rest of
 * the icon system (V, Check, Plus, Hex, Chevron, Dot, Pulse, Ascend,
 * Sine, Crescent, etc.) — open strokes, no fills, lines + chevrons +
 * arcs + dots only. 48² viewBox, stroke="currentColor" so the parent
 * card controls the tint.
 *
 *   push  = chevron above bar (force above baseline)
 *   pull  = bar above chevron (force below baseline)
 *   legs  = arched gateway (foundation / Π)
 *   upper = stacked upward chevrons (double-up · top half)
 *   lower = stacked downward chevrons (double-down · base half)
 *   rest  = ellipsis (three dots · breath held)
 *
 * Path data is mirrored as canvas in design-iterations/crystal-library
 * under GLYPHS.PUSH / PULL / LEGS / UPPER / LOWER.
 */

export type SplitGlyphKind = Category | 'upper' | 'lower'

interface SplitGlyphProps {
  kind: SplitGlyphKind
  size?: number
  className?: string
}

const PATHS: Record<SplitGlyphKind, React.ReactNode> = {
  push: (
    <>
      <polyline points="14,20 24,12 34,20" />
      <line x1="10" y1="32" x2="38" y2="32" />
    </>
  ),
  pull: (
    <>
      <line x1="10" y1="16" x2="38" y2="16" />
      <polyline points="14,28 24,36 34,28" />
    </>
  ),
  legs: (
    <path d="M14 35 L14 18 A10 10 0 0 1 34 18 L34 35" />
  ),
  upper: (
    <>
      <polyline points="14,17 24,9 34,17" />
      <polyline points="14,29 24,21 34,29" />
    </>
  ),
  lower: (
    <>
      <polyline points="14,19 24,27 34,19" />
      <polyline points="14,31 24,39 34,31" />
    </>
  ),
  rest: (
    <>
      <circle cx="14" cy="24" r="1.8" />
      <circle cx="24" cy="24" r="1.8" />
      <circle cx="34" cy="24" r="1.8" />
    </>
  ),
}

export default function SplitGlyph({ kind, size = 36, className }: SplitGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[kind]}
    </svg>
  )
}

/**
 * Pick the right glyph for a SplitDay. Prefers the explicit category,
 * but falls back to a name-based match so legacy/custom splits with
 * "Upper" or "Lower" in the day name still get the right icon.
 */
export function getSplitGlyphKind(day: { name: string; category: Category }): SplitGlyphKind {
  const name = day.name.toLowerCase()
  if (name.includes('upper')) return 'upper'
  if (name.includes('lower')) return 'lower'
  return day.category
}

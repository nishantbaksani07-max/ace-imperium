import type { ReactNode } from 'react'
import type { GoalCategory } from '@/lib/goals/categories'

/**
 * CategoryIcon — the nine SF-style flat-line glyphs for the goal triage (BUILD47).
 * Always `currentColor` (the consumer sets iris), one cohesive 24-unit grid +
 * 1.7 stroke so the set reads as one family. Presentational, no hooks.
 */

const PATHS: Record<GoalCategory, ReactNode> = {
  fitness: <path d="M-9 -4 V4 M9 -4 V4 M-9 0 H9 M-6 -6 V6 M6 -6 V6" />,
  health: <path d="M0 8 C-9 1 -9 -7 -3.5 -7 C-1 -7 0 -5 0 -3.5 C0 -5 1 -7 3.5 -7 C9 -7 9 1 0 8Z" />,
  mind: <><path d="M0 -7 C-3 -9 -8 -8 -9 -6 V6 C-8 4 -3 3 0 5 C3 3 8 4 9 6 V-6 C8 -8 3 -9 0 -7Z" /><path d="M0 -7 V5" /></>,
  money: <><circle cx="0" cy="0" r="8.5" /><path d="M3 -3.5 C3 -5.5 -3 -5.5 -3 -3 C-3 -.5 3 -.5 3 3 C3 5.5 -3 5.5 -3 3.5 M0 -6.5 V-5 M0 5 V6.5" /></>,
  career: <><rect x="-9" y="-4" width="18" height="12" rx="2" /><path d="M-4 -4 V-7 a2 2 0 0 1 2 -2 h4 a2 2 0 0 1 2 2 V-4" /></>,
  craft: <><path d="M-2 -9 L2 -9 L4 3 L0 9 L-4 3 Z" /><path d="M-3.2 -2 H3.2" /></>,
  audience: <><circle cx="-4" cy="0" r="2.2" /><path d="M1 -6 a8 8 0 0 1 0 12 M4 -9 a12 12 0 0 1 0 18" /></>,
  people: <><circle cx="-4" cy="-3" r="3" /><circle cx="5" cy="-2" r="2.5" /><path d="M-10 8 C-10 1 2 1 2 8 M3 8 C3 3 11 3 11 8" /></>,
  general: <><circle cx="0" cy="0" r="8.5" /><path d="M0 -4.5 V0 L3 2.5" /></>,
}

export default function CategoryIcon({ category, size = 22 }: { category: GoalCategory; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[category] ?? PATHS.general}
    </svg>
  )
}

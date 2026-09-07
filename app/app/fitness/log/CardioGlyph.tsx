/**
 * Line-icon glyphs for each cardio type, drawn to the same 24×24, 1.6-stroke
 * spec as the rest of the logger's icons. Mint via currentColor. Clean
 * geometric forms (not figurative) so they read crisply at 22px.
 */
import type { ReactNode } from 'react'

const PATHS: Record<string, ReactNode> = {
  walk: (
    <>
      <ellipse cx="9" cy="9" rx="2" ry="3" />
      <ellipse cx="9" cy="13.4" rx="1.1" ry="0.8" />
      <ellipse cx="15" cy="13" rx="2" ry="3" />
      <ellipse cx="15" cy="17.4" rx="1.1" ry="0.8" />
    </>
  ),
  incline_walk: (
    <>
      <path d="M5 18.5 L18.5 6" />
      <path d="M18.5 6 L12.5 6.3" />
      <path d="M18.5 6 L18.2 12" />
    </>
  ),
  run: (
    <>
      <path d="M6 7l5 5-5 5" />
      <path d="M13 7l5 5-5 5" />
    </>
  ),
  cycle: (
    <>
      <circle cx="6" cy="17" r="3.1" />
      <circle cx="18" cy="17" r="3.1" />
      <path d="M6 17l4-6h5l-3 6" />
      <path d="M10 11l2-3h3" />
    </>
  ),
  row: (
    <>
      <path d="M4 9c2.5 2 5.5 2 8 0s5.5-2 8 0" />
      <path d="M4 15c2.5 2 5.5 2 8 0s5.5-2 8 0" />
    </>
  ),
  stairs: <path d="M4 19h4v-3h4v-3h4v-3h4" />,
  elliptical: (
    <>
      <circle cx="16.6" cy="8" r="2.4" />
      <path d="M15 9.8 L5.5 17.8" />
      <path d="M4.4 17.6 H8" />
      <path d="M17.4 5.9 L12.6 4" />
    </>
  ),
  other: <path d="M3 12h4l2 6 4-14 2 8h6" />,
}

export default function CardioGlyph({ type, className }: { type: string; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[type] ?? PATHS.other}
    </svg>
  )
}

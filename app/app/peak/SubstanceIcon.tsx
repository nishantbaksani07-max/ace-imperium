import type { SubstanceCategory } from './types'

/**
 * Vitality line-art icons for substance categories — replaces the emoji
 * glyphs (☕ 💧 🌙 💊 🏋) that used to render in the Peak substance surfaces.
 * Style matches the app icon vocabulary: viewBox 0 0 24 24, no fill, mint
 * `currentColor` stroke at 1.7, round caps/joins. Colour the icon by setting
 * `color` on the wrapper (mint by default). No emojis anywhere — see the
 * crystal/icon library + the logger/setup icons for the canonical look.
 */

interface Props {
  category: SubstanceCategory
  size?: number
  className?: string
}

const PATHS: Record<SubstanceCategory, JSX.Element> = {
  // teardrop
  hydration: (
    <path d="M12 3.2c0 0 6.2 6.7 6.2 11a6.2 6.2 0 1 1-12.4 0c0-4.3 6.2-11 6.2-11Z" />
  ),
  // coffee cup + steam
  caffeine: (
    <>
      <path d="M5 9h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9Z" />
      <path d="M16 10h1.8a2.4 2.4 0 0 1 0 4.8H16" />
      <path d="M8 3.4v2M11 3.4v2M14 3.4v2" />
    </>
  ),
  // crescent moon (downers / sleep)
  depressant: (
    <path d="M19 14.6A7.5 7.5 0 1 1 11 5a6 6 0 0 0 8 9.6Z" />
  ),
  // capsule / pill with divider
  supplement: (
    <>
      <path d="M6.5 9.5h11a3 3 0 0 1 0 6h-11a3 3 0 0 1 0-6Z" />
      <path d="M12 9.5v6" />
    </>
  ),
  // dumbbell
  workout: (
    <>
      <path d="M3.5 12h17" />
      <path d="M6 8.5v7M9 10v4M15 10v4M18 8.5v7" />
    </>
  ),
  // lightning bolt (stimulant / ADHD meds)
  adhd: (
    <path d="M13 3 6 13.2h4.4L10 21l7-10.2h-4.4L13 3Z" />
  ),
  // hexagon (nicotine)
  nicotine: (
    <path d="M12 3.6 18.4 7.2v7.6L12 18.4 5.6 14.8V7.2L12 3.6Z" />
  ),
}

export default function SubstanceIcon({ category, size = 20, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[category] ?? <circle cx="12" cy="12" r="2.4" />}
    </svg>
  )
}

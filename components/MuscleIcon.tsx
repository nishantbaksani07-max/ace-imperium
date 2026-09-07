/**
 * Muscle group glyphs — twelve SVGs cropped tight to the muscle belly.
 * Mint stroke + soft mint fill, single weight, round caps/joins.
 *
 * Source: public/muscle-icons-preview.html (Claude Design handoff).
 * The standalone preview at public/muscle-icons-preview.html shows the
 * full library + in-card chip row + recommend-modal mocks at every size.
 */

export type MuscleIconKey =
  | 'chest' | 'back' | 'shoulders'
  | 'biceps' | 'triceps' | 'forearms'
  | 'quads' | 'hamstrings' | 'glutes' | 'calves'
  | 'core' | 'traps'

interface GlyphParts {
  ms: string[]
  ln?: string[]
}

const GLYPHS: Record<MuscleIconKey, GlyphParts> = {
  chest: {
    ms: [
      'M48 30 L48 61 C38 60 27 55 19 46 C25 37 36 31 48 30 Z',
      'M52 30 L52 61 C62 60 73 55 81 46 C75 37 64 31 52 30 Z',
    ],
  },
  back: {
    ms: ['M24 32 C28 50 36 64 47 78 L53 78 C64 64 72 50 76 32 C66 38 58 40 50 40 C42 40 34 38 24 32 Z'],
    ln: [
      'M50 40 L50 78',
      'M33 36 C37 52 42 64 48 76',
      'M67 36 C63 52 58 64 52 76',
    ],
  },
  shoulders: {
    ms: ['M28 64 C26 40 40 27 50 27 C60 27 74 40 72 64 C61 69 39 69 28 64 Z'],
    ln: [
      'M43 29 C39 44 38 56 37 65',
      'M57 29 C61 44 62 56 63 65',
    ],
  },
  biceps: {
    ms: ['M50 27 C45 22 39 23 39 31 C33 42 35 53 43 64 C46 70 48 74 50 80 C52 74 54 70 57 64 C65 53 67 42 61 31 C61 23 55 22 50 27 Z'],
    ln: ['M50 30 L50 78'],
  },
  triceps: {
    ms: ['M30 76 C25 44 36 24 50 24 C64 24 75 44 70 76 L60 76 C64 48 60 38 50 38 C40 38 36 48 40 76 Z'],
    ln: ['M50 24 L50 38'],
  },
  quads: {
    ms: ['M30 26 C24 48 34 70 44 82 L56 82 C66 70 76 48 70 26 C62 31 54 33 50 33 C46 33 38 31 30 26 Z'],
    ln: [
      'M50 33 L50 80',
      'M40 30 C40 50 43 68 47 80',
      'M60 30 C60 50 57 68 53 80',
    ],
  },
  hamstrings: {
    ms: [
      'M44 22 C34 30 34 56 40 80 C43 82 46 82 48 80 C50 56 49 32 48 22 C47 21 45 21 44 22 Z',
      'M56 22 C66 30 66 56 60 80 C57 82 54 82 52 80 C50 56 51 32 52 22 C53 21 55 21 56 22 Z',
    ],
  },
  glutes: {
    ms: [
      'M49 36 C41 28 24 28 19 42 C15 54 22 70 35 71 C44 72 49 64 49 54 Z',
      'M51 36 C59 28 76 28 81 42 C85 54 78 70 65 71 C56 72 51 64 51 54 Z',
    ],
    ln: ['M50 34 L50 66'],
  },
  calves: {
    ms: ['M50 22 C36 26 29 39 34 51 C37 59 45 65 49 82 L51 82 C55 65 63 59 66 51 C71 39 64 26 50 22 Z'],
    ln: [
      'M50 25 C46 38 47 52 49 80',
      'M50 25 C54 38 53 52 51 80',
    ],
  },
  core: {
    ms: ['M35 26 C35 24 37 23 40 23 L60 23 C63 23 65 24 65 26 C66 46 65 64 60 76 C58 79 42 79 40 76 C35 64 34 46 35 26 Z'],
    ln: [
      'M50 24 L50 77',
      'M36 41 L64 41',
      'M37 58 L63 58',
    ],
  },
  traps: {
    ms: ['M50 20 C44 28 33 36 24 41 C34 50 43 64 50 82 C57 64 66 50 76 41 C67 36 56 28 50 20 Z'],
    ln: [
      'M50 24 L50 78',
      'M30 42 C40 44 60 44 70 42',
    ],
  },
  forearms: {
    ms: ['M38 24 C30 30 30 44 35 52 C42 62 48 70 52 80 L58 79 C61 64 60 46 56 32 C54 26 50 22 46 22 C43 22 40 23 38 24 Z'],
    ln: ['M40 28 C38 42 42 58 52 78'],
  },
}

export const MUSCLE_ICON_KEYS = Object.keys(GLYPHS) as MuscleIconKey[]

/** Display label for each icon key — used by the custom-lift body-part picker
 *  and to label custom lifts (which have no fine-grained muscle attribution). */
export const MUSCLE_ICON_LABEL: Record<MuscleIconKey, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
  traps: 'Traps',
}

interface MuscleIconProps {
  name: MuscleIconKey
  size?: number
  className?: string
  /** Visual title for screen readers. Defaults to the muscle name. */
  ariaLabel?: string
}

/**
 * Renders a muscle glyph at the given size (px square). The viewBox is
 * 0 0 100 100 so any pixel size works; stroke thickness scales with the
 * SVG. Mint stroke `#6EE7B7` + soft mint fill `rgba(110,231,183,0.14)`.
 */
export default function MuscleIcon({ name, size = 22, className, ariaLabel }: MuscleIconProps) {
  const glyph = GLYPHS[name]
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      role="img"
      aria-label={ariaLabel ?? name}
      className={className}
      style={{ display: 'block' }}
    >
      <g
        fill="rgba(110, 231, 183, 0.14)"
        stroke="#6EE7B7"
        strokeWidth={3}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {glyph.ms.map((d, i) => (
          <path key={`ms-${i}`} d={d} />
        ))}
      </g>
      {glyph.ln && (
        <g
          fill="none"
          stroke="#6EE7B7"
          strokeWidth={2.55}
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          {glyph.ln.map((d, i) => (
            <path key={`ln-${i}`} d={d} />
          ))}
        </g>
      )}
    </svg>
  )
}

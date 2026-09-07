/**
 * Design tokens — every raw value in the system, in one place.
 *
 * Plain JS object so it can be imported anywhere:
 *   import { tokens } from './tokens.js'
 *   tokens.color.mint            // '#6EE7B7'
 *
 * The same values are mirrored as CSS custom properties in `theme.css`
 * (e.g. `var(--mint)`) and wired into Tailwind via `tailwind.preset.js`.
 * Edit here and keep the three in sync, or generate the others from this file.
 */

export const tokens = {
  /* ---- Color ---- */
  color: {
    bg: '#000000',            // pure black canvas
    bgElevated: '#0a0a0a',    // raised surface
    fg: '#ffffff',            // primary text

    mint: '#6EE7B7',          // signature accent
    mintHover: '#5dd6a6',
    mintDeep: '#1f4d3d',      // dark teal partner to mint
    mintGlow: 'rgba(110, 231, 183, 0.4)',

    amber: '#F59E0B',         // secondary accent
    amberWarm: '#d97706',     // deeper amber for gradients
    wine: '#7c2d12',          // deep red-brown, partners with amber
    red: '#EF4444',           // error / destructive

    // text + surface tints (alpha over the black canvas)
    muted: 'rgba(255, 255, 255, 0.5)',
    mutedStrong: 'rgba(255, 255, 255, 0.7)',
    border: 'rgba(255, 255, 255, 0.08)',
    borderStrong: 'rgba(255, 255, 255, 0.16)',
    card: 'rgba(255, 255, 255, 0.02)',
    cardElevated: 'rgba(255, 255, 255, 0.04)',
  },

  /* ---- Spacing (4px base scale) ---- */
  space: {
    1: '0.25rem',  // 4
    2: '0.5rem',   // 8
    3: '0.75rem',  // 12
    4: '1rem',     // 16
    5: '1.25rem',  // 20
    6: '1.5rem',   // 24
    8: '2rem',     // 32
    10: '2.5rem',  // 40
    12: '3rem',    // 48
    16: '4rem',    // 64
  },

  /* ---- Radius ---- */
  radius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '18px',     // poster / tile corner
    pill: '999px',
  },

  /* ---- Type scale ---- */
  fontSize: {
    xs: '0.75rem',    // 12
    sm: '0.875rem',   // 14
    base: '1rem',     // 16
    lg: '1.125rem',   // 18
    xl: '1.375rem',   // 22
    '2xl': '1.75rem', // 28
    '3xl': '2.5rem',  // 40
  },

  fontFamily: {
    // Body / UI. Swap for any clean grotesk.
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    // Editorial display — italic is where the personality lives.
    serif: "'Instrument Serif', 'Times New Roman', Georgia, serif",
    // Eyebrows, captions, numeric labels.
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  },

  fontWeight: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  /* ---- Motion ---- */
  ease: {
    base: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    premium: 'cubic-bezier(0.16, 1, 0.3, 1)',   // signature easing for state changes
    outSoft: 'cubic-bezier(0.32, 0.72, 0, 1)',  // smooth lift / float
  },
  duration: {
    fast: '120ms',
    base: '180ms',
    lift: '480ms',
  },
}

export default tokens

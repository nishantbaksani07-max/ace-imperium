/**
 * Design tokens as a plain JS object.
 *
 * Same values as tokens.css, for when you need them in JS/TS —
 * inline styles, chart libraries, canvas, animation configs, etc.
 *
 *   import { tokens } from './tokens/tokens.js'
 *   <svg stroke={tokens.color.accent} />
 */

export const tokens = {
  color: {
    bg: '#000000',
    bgElevated: '#0a0a0a',
    fg: '#ffffff',

    accent: '#6EE7B7',
    accentHover: '#5dd6a6',
    accentDeep: '#1f4d3d',
    accentGlow: 'rgba(110, 231, 183, 0.4)',

    amber: '#F59E0B',
    amberWarm: '#d97706',
    wine: '#7c2d12',
    red: '#EF4444',

    muted: 'rgba(255, 255, 255, 0.5)',
    mutedStrong: 'rgba(255, 255, 255, 0.7)',

    border: 'rgba(255, 255, 255, 0.08)',
    borderStrong: 'rgba(255, 255, 255, 0.16)',

    card: 'rgba(255, 255, 255, 0.02)',
    cardElevated: 'rgba(255, 255, 255, 0.04)',
  },

  space: {
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    5: '1.25rem',
    6: '1.5rem',
    8: '2rem',
    10: '2.5rem',
    12: '3rem',
    16: '4rem',
  },

  radius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    pill: '999px',
  },

  text: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.375rem',
    '2xl': '1.75rem',
    '3xl': '2.5rem',
  },

  font: {
    sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    serif: "'Times New Roman', Georgia, serif",
    mono: "ui-monospace, 'SFMono-Regular', Menlo, monospace",
  },

  motion: {
    ease: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    easePremium: 'cubic-bezier(0.16, 1, 0.3, 1)',
    easeOutSoft: 'cubic-bezier(0.32, 0.72, 0, 1)',
    durationFast: '120ms',
    duration: '180ms',
    durationLift: '480ms',
  },
}

export default tokens

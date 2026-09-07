/**
 * Tailwind preset — exposes the design tokens as Tailwind theme values so you
 * can write `bg-bg`, `text-mint`, `rounded-xl`, `font-serif`, etc. alongside
 * (or instead of) the `dk-` classes from theme.css.
 *
 * tailwind.config.js:
 *   import designKit from './design-kit/tailwind.preset.js'
 *   export default { presets: [designKit], content: [...] }
 *
 * You still import `theme.css` once for the CSS custom properties + the
 * component classes / animations. This preset is purely additive for Tailwind
 * users who want utility access to the same scale.
 */
import { tokens } from './tokens.js'

const preset = {
  theme: {
    extend: {
      colors: {
        bg: tokens.color.bg,
        'bg-elevated': tokens.color.bgElevated,
        fg: tokens.color.fg,
        mint: { DEFAULT: tokens.color.mint, hover: tokens.color.mintHover, deep: tokens.color.mintDeep },
        amber: { DEFAULT: tokens.color.amber, warm: tokens.color.amberWarm },
        wine: tokens.color.wine,
        red: tokens.color.red,
        muted: tokens.color.muted,
        'muted-strong': tokens.color.mutedStrong,
        card: tokens.color.card,
        'card-elevated': tokens.color.cardElevated,
        border: tokens.color.border,
        'border-strong': tokens.color.borderStrong,
      },
      fontFamily: {
        sans: [tokens.fontFamily.sans],
        serif: [tokens.fontFamily.serif],
        mono: [tokens.fontFamily.mono],
      },
      fontSize: {
        xs: tokens.fontSize.xs,
        sm: tokens.fontSize.sm,
        base: tokens.fontSize.base,
        lg: tokens.fontSize.lg,
        xl: tokens.fontSize.xl,
        '2xl': tokens.fontSize['2xl'],
        '3xl': tokens.fontSize['3xl'],
      },
      spacing: {
        1: tokens.space[1], 2: tokens.space[2], 3: tokens.space[3], 4: tokens.space[4],
        5: tokens.space[5], 6: tokens.space[6], 8: tokens.space[8], 10: tokens.space[10],
        12: tokens.space[12], 16: tokens.space[16],
      },
      borderRadius: {
        sm: tokens.radius.sm,
        md: tokens.radius.md,
        lg: tokens.radius.lg,
        xl: tokens.radius.xl,
        pill: tokens.radius.pill,
      },
      transitionTimingFunction: {
        premium: tokens.ease.premium,
        'out-soft': tokens.ease.outSoft,
      },
    },
  },
}

export default preset

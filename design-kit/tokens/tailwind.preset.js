/**
 * Tailwind preset — maps the design tokens into Tailwind's theme so you
 * can use them as utility classes (bg-accent, text-muted, rounded-lg,
 * p-6, ease-premium, etc.) in a Tailwind project.
 *
 * Usage in tailwind.config.js:
 *
 *   module.exports = {
 *     presets: [require('./design-kit/tokens/tailwind.preset.js')],
 *     content: ['./src/**\/*.{js,ts,jsx,tsx}'],
 *   }
 *
 * NOTE: The kit's components do NOT depend on Tailwind — they ship with
 * their own scoped CSS (components/styles.css) and work with or without
 * it. This preset is purely so YOUR app code can use the same tokens.
 */

module.exports = {
  theme: {
    extend: {
      colors: {
        bg: '#000000',
        'bg-elevated': '#0a0a0a',
        fg: '#ffffff',
        accent: {
          DEFAULT: '#6EE7B7',
          hover: '#5dd6a6',
          deep: '#1f4d3d',
        },
        amber: { DEFAULT: '#F59E0B', warm: '#d97706' },
        wine: '#7c2d12',
        red: '#EF4444',
        muted: {
          DEFAULT: 'rgba(255, 255, 255, 0.5)',
          strong: 'rgba(255, 255, 255, 0.7)',
        },
        card: {
          DEFAULT: 'rgba(255, 255, 255, 0.02)',
          elevated: 'rgba(255, 255, 255, 0.04)',
        },
      },
      borderColor: {
        DEFAULT: 'rgba(255, 255, 255, 0.08)',
        strong: 'rgba(255, 255, 255, 0.16)',
      },
      spacing: {
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
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '12px',
        pill: '999px',
      },
      fontSize: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.375rem',
        '2xl': '1.75rem',
        '3xl': '2.5rem',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', "'Segoe UI'", 'sans-serif'],
        serif: ["'Times New Roman'", 'Georgia', 'serif'],
        mono: ['ui-monospace', "'SFMono-Regular'", 'Menlo', 'monospace'],
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        premium: 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-soft': 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      transitionDuration: {
        fast: '120ms',
        DEFAULT: '180ms',
        lift: '480ms',
      },
    },
  },
}

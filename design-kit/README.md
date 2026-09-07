# Design Kit

A dark, editorial, mint-accented React design system — **tokens + components**,
drop into any React app. No app logic, no data layer, no backend. Just the
design layer.

- 🎨 One token source → CSS vars, a JS object, **and** a Tailwind preset
- 🧩 8 standalone components, styled with their own scoped CSS
- ⚛️ Works in **any React app** (Next, Vite, CRA, Remix) — Tailwind optional
- 📦 Zero runtime dependencies beyond React itself

See [`DESIGN.md`](DESIGN.md) for the full system (color, type, spacing, motion).

---

## What's inside

```
design-kit/
├── DESIGN.md                 # the system, written out
├── README.md                 # you are here
├── package.json              # react/react-dom peer deps only
├── tokens/
│   ├── tokens.css            # :root CSS custom properties — the source of truth
│   ├── tokens.js             # same values as a JS object (for inline styles, charts)
│   └── tailwind.preset.js    # tokens → Tailwind theme (optional)
├── components/
│   ├── styles.css            # scoped component CSS (uses the token vars)
│   ├── index.ts              # barrel export
│   ├── Button.tsx            # primary / ghost / pill / link
│   ├── Card.tsx              # translucent surface (+ elevated, interactive)
│   ├── Input.tsx             # Input + Textarea, mint focus ring
│   ├── Badge.tsx             # pill chip — accent / amber / red / neutral
│   ├── Ring.tsx              # SVG progress gauge (0–100), the signature piece
│   ├── Ticker.tsx            # scrolling stat marquee
│   ├── PageShell.tsx         # page canvas + ambient glow + centered column
│   └── PosterGrid.tsx        # animated bento grid w/ cursor parallax
└── examples/
    └── Showcase.tsx          # one page rendering every component
```

---

## Install (copy-paste, 2 minutes)

### 1. Copy the folder

Drop the whole `design-kit/` folder into your project (e.g. `src/design-kit/`).

### 2. Make sure you have React

The kit's only requirement:

```bash
npm install react react-dom
```

(You almost certainly already have these.) **That's the entire dependency list.**

### 3. Import the styles once, at your app root

```ts
// e.g. main.tsx / _app.tsx / layout.tsx / index.tsx
import './design-kit/tokens/tokens.css'      // the design tokens (CSS vars)
import './design-kit/components/styles.css'  // the component styles
```

### 4. Use the components anywhere

```tsx
import { Button, Card, Ring, Badge } from './design-kit/components'

export default function Example() {
  return (
    <Card eyebrow="Right now" title="Today">
      <Ring value={75} label="Overall" />
      <Badge tone="accent" dot>Live</Badge>
      <Button variant="primary" onClick={() => alert('hi')}>
        Do the thing
      </Button>
    </Card>
  )
}
```

### 5. (Optional) See everything at once

Render the showcase on any route:

```tsx
import Showcase from './design-kit/examples/Showcase'
export default function Page() { return <Showcase /> }
```

---

## Fonts (recommended)

The kit ships with **system fallbacks**, so it works with zero font setup. To
get the intended look, supply three faces via the font vars — any method works
(Google Fonts `<link>`, `@font-face`, `next/font`). Point these vars at your
loaded families:

```css
:root {
  --font-inter:     'Inter', sans-serif;       /* --font-sans  */
  --font-newsreader:'Newsreader', serif;        /* --font-serif (the italic personality) */
  --font-jetbrains: 'JetBrains Mono', monospace;/* --font-mono  */
}
```

Or just override `--font-sans` / `--font-serif` / `--font-mono` directly. The
serif is the important one — it's where the system's character lives.

---

## Using the tokens in your own code

**CSS / any framework** — the vars are global after step 3:

```css
.my-thing { color: var(--accent); padding: var(--space-6); border-radius: var(--radius-lg); }
```

**JavaScript / TS** (charts, canvas, inline styles):

```ts
import { tokens } from './design-kit/tokens/tokens.js'
<svg stroke={tokens.color.accent} />
```

**Tailwind** (optional) — register the preset so `bg-accent`, `text-muted`,
`rounded-lg`, `p-6`, `ease-premium` etc. map to the same tokens:

```js
// tailwind.config.js
module.exports = {
  presets: [require('./design-kit/tokens/tailwind.preset.js')],
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
}
```

> The components don't need Tailwind — they bring their own scoped CSS. The
> preset is only so **your** app code can use the same design values.

---

## Components at a glance

| Component | Key props |
|---|---|
| `Button` | `variant` `'primary' \| 'ghost' \| 'pill' \| 'link'`, `block`, + native button props |
| `Card` | `elevated`, `interactive`, `eyebrow`, `title` |
| `Input` / `Textarea` | `label`, `error`, + native input/textarea props |
| `Badge` | `tone` `'accent' \| 'amber' \| 'red' \| 'neutral'`, `dot` |
| `Ring` | `value` (0–100), `size`, `stroke`, `label`, `display` |
| `Ticker` | `items: {label, value, live?}[]`, `showLive` |
| `PageShell` | `maxWidth`, wraps page content |
| `PosterGrid` | `posters: PosterConfig[]`, `onSelect(id, index)` |

All components are prop-driven with dummy/static data — **no app, API, or state
dependencies.** Wire them to your own data at the call site.

---

## Dependencies

| Package | Why | Required? |
|---|---|---|
| `react`, `react-dom` | the components are React | **Yes** (peer) |
| `tailwindcss` | only if you use `tailwind.preset.js` | Optional |

No Supabase, no fetch, no env vars, no three.js, nothing else.

---

## License

Yours to use. Adapt freely.

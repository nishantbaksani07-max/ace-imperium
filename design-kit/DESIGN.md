# Design System

A dark, editorial, mint-accented system. Pure black canvas, restrained
neutrals, one confident accent. The personality lives in a **serif italic**
display face used sparingly — everything else is quiet so the italic and the
mint accent carry the weight.

> All values are defined once in [`tokens/tokens.css`](tokens/tokens.css) and
> mirrored in [`tokens/tokens.js`](tokens/tokens.js) and
> [`tokens/tailwind.preset.js`](tokens/tailwind.preset.js). Components read the
> CSS vars — never hardcode a hex.

---

## Color

| Token | Value | Use |
|---|---|---|
| `--bg` | `#000000` | Page background. True black. |
| `--bg-elevated` | `#0a0a0a` | Raised panels / modals. |
| `--fg` | `#ffffff` | Primary text. |
| `--accent` | `#6EE7B7` | **Signature mint.** Primary actions, active states, focus, data viz. |
| `--accent-hover` | `#5dd6a6` | Hover for mint fills. |
| `--accent-deep` | `#1f4d3d` | Dark teal partner — gradient depth. |
| `--accent-glow` | `rgba(110,231,183,.4)` | Glow shadows behind mint elements. |
| `--amber` | `#F59E0B` | Warnings, secondary highlight. |
| `--amber-warm` | `#d97706` | Deeper amber for duotone gradients. |
| `--wine` | `#7c2d12` | Deep red-brown, partners with amber. |
| `--red` | `#EF4444` | Errors, destructive, "over limit". |
| `--muted` | `rgba(255,255,255,.5)` | Secondary text. |
| `--muted-strong` | `rgba(255,255,255,.7)` | Body text on dark. |
| `--border` | `rgba(255,255,255,.08)` | Default hairline borders. |
| `--border-strong` | `rgba(255,255,255,.16)` | Hover / emphasis borders. |
| `--card` | `rgba(255,255,255,.02)` | Card fill — barely-there translucency. |
| `--card-elevated` | `rgba(255,255,255,.04)` | Raised card fill. |

**Principle:** surfaces are translucent white at very low alpha over black, not
solid grays. Borders do the separating, not fills.

---

## Typography

Three families, supplied by **you** via the font vars (the kit only ships
fallbacks — see README "Fonts"):

| Var | Role | Notes |
|---|---|---|
| `--font-sans` | UI + body | The workhorse. (Source app uses Inter.) |
| `--font-serif` | Display, **italic** | Where the personality lives. Titles, numbers, labels. Use sparingly. (Source app uses Newsreader.) |
| `--font-mono` | Eyebrows, data, chips | Uppercase, wide letter-spacing for kickers + tickers. (Source app uses JetBrains Mono.) |

### Scale

| Token | Size |
|---|---|
| `--text-xs` | 0.75rem |
| `--text-sm` | 0.875rem |
| `--text-base` | 1rem |
| `--text-lg` | 1.125rem |
| `--text-xl` | 1.375rem |
| `--text-2xl` | 1.75rem |
| `--text-3xl` | 2.5rem |

**Headings:** weight 600, `letter-spacing: -0.01em` to `-0.025em`, line-height 1.05–1.2.
**Eyebrows/kickers:** mono, `--text-xs`, `letter-spacing: 0.18em`, uppercase, `--muted`.
**Serif italic:** `letter-spacing: -0.015em`, weight 400–500. Big numbers in rings/scores use it.

---

## Spacing

A 4px-based rem scale. Use these, not arbitrary values.

`--space-1` .25 · `--space-2` .5 · `--space-3` .75 · `--space-4` 1 · `--space-5` 1.25 ·
`--space-6` 1.5 · `--space-8` 2 · `--space-10` 2.5 · `--space-12` 3 · `--space-16` 4 (rem)

- Card padding: `--space-6`.
- Page padding: `--space-10` top, `--space-6` sides, `--space-16` bottom.
- Vertical rhythm between page sections: `--space-10`.

---

## Radius

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 6px | Inputs. |
| `--radius-md` | 8px | Buttons. |
| `--radius-lg` | 12px | Cards, tickers. |
| `--radius-pill` | 999px | Pills, badges, chips. |
| (poster tiles) | 18px | Bento posters use a one-off 18px. |

---

## Motion

| Token | Curve | Use |
|---|---|---|
| `--ease` | `cubic-bezier(.2,.8,.2,1)` | Default transitions (color, border). |
| `--ease-premium` | `cubic-bezier(.16,1,.3,1)` | **Signature.** Meaningful state changes, entrances, ring fills. |
| `--ease-out-soft` | `cubic-bezier(.32,.72,0,1)` | Lift / float / parallax. |
| `--duration-fast` | 120ms | Press feedback. |
| `--duration` | 180ms | Standard hover/color. |
| `--duration-lift` | 480ms | Entrances, ring fills, poster reveal. |

All decorative/looping animation respects `prefers-reduced-motion: reduce`.

---

## Component styles (anatomy)

All scoped under the `dk-` prefix in
[`components/styles.css`](components/styles.css).

- **Button** — `primary` (mint fill, black text), `ghost` (bordered, transparent),
  `pill` (mono uppercase chip, used for back/nav), `link` (muted text). Mint focus ring.
- **Card** — translucent `--card` fill, `--border` hairline, `--radius-lg`, `--space-6`
  padding. `elevated` brightens the fill; `interactive` adds the mint hover glow
  (`0 0 40px accent-glow`) + pointer cursor. Optional mono eyebrow + serif-italic title.
- **Input / Textarea** — `--card` fill, focus moves the border to `--accent` and washes
  the fill with faint mint. Uppercase mono-ish label, red error line.
- **Badge** — pill in four tones (accent / amber / red / neutral), each a 10%-alpha fill
  + 28%-alpha border of its hue. Optional leading status dot.
- **Ring** — SVG arc rotated −90° so it starts at 12 o'clock; mint fill with
  `drop-shadow` glow over a faint track; serif-italic number centered. Arc length is
  `strokeDashoffset` driven by a 0–100 value, animated with `--ease-premium`.
- **Ticker** — horizontal marquee; the track is duplicated and translated −50% so the
  loop is seamless. Pauses on hover. Optional pulsing "Live" pip.
- **PageShell** — the full-bleed canvas: black bg + two drifting radial mint glows
  (`::before`), centered max-width inner column with `--space-10` gaps.
- **PosterGrid** — 4×3 bento that collapses to 2-col then 1-col. Tiles animate in with a
  staggered reveal; artwork gets cursor-tracking parallax (translate up to 8px). Five
  animated art backgrounds: `aurora`, `grid`, `dots`, `duotone`, `frosted`.

---

## Doing it right

- **Lead with black + neutrals.** Mint is a seasoning, not a base. One mint thing per view draws the eye where you want it.
- **Italic serif = personality, used once or twice per screen** (a title, a big number). Overuse kills it.
- **Borders separate, fills don't.** Keep surfaces translucent.
- **Use `--ease-premium` for anything the user will notice changing.** It's the house feel.
- **Respect reduced motion** — already handled in the kit's CSS; do the same in your own.

/**
 * tileRecolor - swap a scaffolded tile's single accent from mint to another
 * on-brand accent, purely by string replacement on the sealed HTML.
 *
 * Why this is safe. Every deterministic template (mcp/src/tiles/templates.ts)
 * paints from ONE accent - the `--mint*` custom properties plus a handful of
 * hardcoded mint rgba/hex literals - and keeps CAUTION on its own separate
 * `--amber` token. So recoloring the accent never touches the caution color,
 * and the color LAW (mint/accent = good, amber = caution, never red) holds.
 *
 * We deliberately DO NOT offer gold: gold (#FCD34D) is a near-twin of the amber
 * caution (#F59E0B), so a gold accent would collide with "amber means caution."
 * Mint stays the signature; iris, azure, violet, rose, and seafoam are the
 * alternates, each picked to stay unambiguous against amber on pure black.
 *
 * The swap is a fixed set of literal replacements - the exact strings the
 * templates emit - so it is deterministic and cannot partially recolor. Each
 * accent supplies a full six-literal palette (base, hover, deep, ink, and the
 * two rgb triplets) so no mint ever bleeds through a recolor.
 */

export type TileAccent = 'mint' | 'iris' | 'azure' | 'violet' | 'rose' | 'seafoam'

export interface AccentSwatch {
  /** The accent id. */
  id: TileAccent
  /** The base accent hex, for the dashboard poster skin + the builder swatch. */
  hex: string
  /** rgba glow triplet, shown behind the swatch in the builder UI. */
  glow: string
}

export const ACCENTS: Record<TileAccent, AccentSwatch> = {
  mint: { id: 'mint', hex: '#6EE7B7', glow: 'rgba(110,231,183,.5)' },
  iris: { id: 'iris', hex: '#A5B4FC', glow: 'rgba(165,180,252,.5)' },
  azure: { id: 'azure', hex: '#6EA8FF', glow: 'rgba(110,168,255,.5)' },
  violet: { id: 'violet', hex: '#B794F6', glow: 'rgba(183,148,246,.5)' },
  rose: { id: 'rose', hex: '#F49AC2', glow: 'rgba(244,154,194,.5)' },
  seafoam: { id: 'seafoam', hex: '#7FE3D0', glow: 'rgba(127,227,208,.5)' },
}

/** The six literal roles every template paints its accent with. */
interface AccentPalette {
  base: string // --mint (base accent)
  hover: string // --mint-hover
  deep: string // --mint-deep (dark shell tint)
  ink: string // --mint-ink (dark text on the accent)
  baseRgb: string // rgb triplet used in every rgba(...) accent glow / fill
  deepRgb: string // rgb triplet in the secondary shell radial
}

/** The exact mint literals the templates emit - the "from" side of every swap. */
const MINT: AccentPalette = {
  base: '#6EE7B7',
  hover: '#5dd6a6',
  deep: '#1f4d3d',
  ink: '#042a1c',
  baseRgb: '110,231,183',
  deepRgb: '31,77,61',
}

/** Deep / hover / ink variants hand-picked to read well on pure black, with the
 *  same relative weight as the mint originals. NEVER gold or red (color law). */
const PALETTES: Record<Exclude<TileAccent, 'mint'>, AccentPalette> = {
  iris: {
    base: '#A5B4FC', hover: '#8b9cf9', deep: '#2c3566', ink: '#0a1030',
    baseRgb: '165,180,252', deepRgb: '44,53,102',
  },
  azure: {
    base: '#6EA8FF', hover: '#5d97f0', deep: '#1f3a66', ink: '#04182e',
    baseRgb: '110,168,255', deepRgb: '31,58,102',
  },
  violet: {
    base: '#B794F6', hover: '#a683e8', deep: '#3a2c5e', ink: '#160a30',
    baseRgb: '183,148,246', deepRgb: '58,44,94',
  },
  rose: {
    base: '#F49AC2', hover: '#e689b1', deep: '#5e2c44', ink: '#300a1e',
    baseRgb: '244,154,194', deepRgb: '94,44,68',
  },
  seafoam: {
    base: '#7FE3D0', hover: '#6dd2bf', deep: '#1f4d46', ink: '#042a25',
    baseRgb: '127,227,208', deepRgb: '31,77,70',
  },
}

/** The role order for the literal swap. Roles are disjoint strings and no
 *  replacement value contains a mint literal, so the pass can never cascade. */
const ROLES: ReadonlyArray<keyof AccentPalette> = ['base', 'hover', 'deep', 'ink', 'baseRgb', 'deepRgb']

/**
 * Return the tile HTML recolored to `accent`. 'mint' returns the input unchanged
 * (it is the templates' native accent); any other accent swaps every mint
 * literal to that accent's palette.
 */
export function recolorTile(html: string, accent: TileAccent): string {
  if (accent === 'mint') return html
  const palette = PALETTES[accent]
  if (!palette) return html
  let out = html
  for (const role of ROLES) {
    out = out.split(MINT[role]).join(palette[role])
  }
  return out
}

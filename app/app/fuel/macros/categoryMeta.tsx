// Per-category icon + colour for the food-search picker. Each food category gets
// a distinct glyph AND a tint so the type reads at a glance (and stays
// colourblind-safe via the shape). Tones are muted/premium on black — mint stays
// the brand. Used by FoodSearchPicker (result-row badges + browse-by-type grid).

import type { ReactNode } from 'react'

interface CatMeta {
  color: string
  /** short label for the compact browse grid */
  short: string
  /** inner SVG (paths) — rendered inside a shared 24×24 stroke wrapper */
  glyph: ReactNode
}

const G = {
  apple: (<><path d="M12 8.4C10.5 5.6 6.1 6.2 6.4 9.7c.2 2.6 2.7 5.6 5.6 7.7 2.9-2.1 5.4-5.1 5.6-7.7C17.9 6.2 13.5 5.6 12 8.4Z" /><path d="M12 8.4c-.2-1.8.8-3.1 2.6-3.3" /></>),
  leaf: (<><path d="M11 19.5C6.3 19.5 4.5 14 4.5 9.3c4.7 0 8.4 1 10.3 3.7 1.6 2.4 1 5-.1 6.5Z" /><path d="M4.5 9.3c3.8 1.4 5.7 3.8 6.6 10.2" /></>),
  drumstick: (<path d="M14.4 4.2a4.3 4.3 0 0 1 3.2 7.1c-1.2 1.3-3.1 1.1-4.3 2.1L8.1 18.5a2.4 2.4 0 1 1-2.8-2.8l5.1-5.1c1-1.2.8-3.1 2.1-4.3a4.3 4.3 0 0 1 1.9-1.1Z" />),
  steak: (<><path d="M5 9.5C5 7 8.1 5.5 12 5.5s7 1.5 7 4-3.1 5-7 5-7-2.5-7-5Z" /><circle cx="9" cy="9.7" r="1.5" /></>),
  bacon: (<><path d="M4 8.5c2-2 4 1.6 6 0s4-1.6 6 0 4 1.6 4 1.6" /><path d="M4 13c2-2 4 1.6 6 0s4-1.6 6 0 4 1.6 4 1.6" /></>),
  fish: (<><path d="M3 12c3-3.3 8-3.3 11 0-3 3.3-8 3.3-11 0Z" /><path d="m14 12 4.5-3v6L14 12Z" /><circle cx="7.2" cy="12" r=".8" fill="currentColor" stroke="none" /></>),
  egg: (<path d="M12 4.5c2.9 0 5.3 4.8 5.3 8.6a5.3 5.3 0 0 1-10.6 0C6.7 9.3 9.1 4.5 12 4.5Z" />),
  wheat: (<><path d="M12 21V8.5" /><path d="M12 8.5c0-1.9-1.4-3.3-3.3-3.3C8.3 7.1 9.7 8.5 12 8.5Zm0 0c0-1.9 1.4-3.3 3.3-3.3C15.7 7.1 14.3 8.5 12 8.5Z" /><path d="M12 13.5c0-1.9-1.4-3.3-3.3-3.3C8.3 12.1 9.7 13.5 12 13.5Zm0 0c0-1.9 1.4-3.3 3.3-3.3C15.7 12.1 14.3 13.5 12 13.5Z" /></>),
  peanut: (<><circle cx="12" cy="8" r="3.6" /><circle cx="12" cy="15" r="4.2" /></>),
  burger: (<><path d="M4.5 10c0-2.8 3.4-4.8 7.5-4.8s7.5 2 7.5 4.8" /><path d="M4.5 13.8h15" /><path d="M5.5 16.6h13a2 2 0 0 1-2 2.1H7.5a2 2 0 0 1-2-2.1Z" /></>),
  candy: (<><circle cx="12" cy="12" r="3.6" /><path d="m5.5 5.5 3.4 3.4M18.5 5.5 15 9M5.5 18.5 9 15M18.5 18.5 15 15" /></>),
  cup: (<><path d="M6.5 8h11l-1 11.2a2 2 0 0 1-2 1.8H9.4a2 2 0 0 1-2-1.8L6.5 8Z" /><path d="M9 8V6.2a3 3 0 0 1 6 0V8" /></>),
  friedegg: (<><path d="M9.2 6c2.8-1.8 6.4-.2 6.6 3.4 2.9.8 3.5 4.8.8 6.6-.7 3.4-6 3.6-8 .8-3.7.1-4.9-4.5-1.9-6.6-.3-2.8 1-4 2.5-4.2Z" /><circle cx="11" cy="11" r="2.2" fill="currentColor" stroke="none" /></>),
  bottle: (<><path d="M10 3.5h4v2.6l1 2V19a1.9 1.9 0 0 1-1.9 1.9h-2.2A1.9 1.9 0 0 1 9 19V8.1l1-2V3.5Z" /><path d="M9.4 11.3h5.2" /></>),
  utensils: (<><path d="M7 3v7m0 0a2 2 0 0 0 2-2V3M7 10v11M16 3c-1.3 0-2.3 2-2.3 4.5S14.7 12 16 12s2.3-2 2.3-4.5S17.3 3 16 3Zm0 9v9" /></>),
}

export const CATEGORY_META: Record<string, CatMeta> = {
  'Fruits': { color: '#e893b0', short: 'Fruits', glyph: G.apple },
  'Vegetables': { color: '#8fd28a', short: 'Veggies', glyph: G.leaf },
  'Poultry': { color: '#e6bd72', short: 'Poultry', glyph: G.drumstick },
  'Beef & lamb': { color: '#d98c7a', short: 'Beef & lamb', glyph: G.steak },
  'Pork': { color: '#e3a3ad', short: 'Pork', glyph: G.bacon },
  'Seafood': { color: '#7fb8e8', short: 'Seafood', glyph: G.fish },
  'Eggs & dairy': { color: '#ecd285', short: 'Eggs & dairy', glyph: G.egg },
  'Grains, bread & pasta': { color: '#d4b483', short: 'Grains', glyph: G.wheat },
  'Legumes, nuts, seeds & fats': { color: '#b6c47d', short: 'Nuts & beans', glyph: G.peanut },
  'Fast food & restaurant': { color: '#f0a45e', short: 'Fast food', glyph: G.burger },
  'Snacks & sweets': { color: '#c3a6e6', short: 'Snacks', glyph: G.candy },
  'Beverages': { color: '#84cbe0', short: 'Drinks', glyph: G.cup },
  'Breakfast & prepared': { color: '#f0b27a', short: 'Breakfast', glyph: G.friedegg },
  'Condiments, sauces & spreads': { color: '#7fcdb8', short: 'Condiments', glyph: G.bottle },
}

const FALLBACK: CatMeta = { color: 'rgba(255,255,255,0.55)', short: 'Food', glyph: G.utensils }

export function catMeta(category?: string): CatMeta {
  return (category && CATEGORY_META[category]) || FALLBACK
}

/** hex (or rgba passthrough) → rgba with the given alpha, for badge tints. */
export function tint(color: string, alpha: number): string {
  if (color.startsWith('rgba')) return color
  const h = color.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function CategoryGlyph({ category, size = 20 }: { category?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {catMeta(category).glyph}
    </svg>
  )
}

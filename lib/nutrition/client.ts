// Browser-side wrappers for the nutrition API routes. Client components import
// these instead of calling fetch directly. Each throws an Error whose message
// is safe to surface to the user (the routes return { error } with a friendly
// string; 402 maps to a "needs Pro" message so the UI can upsell).

import type { ParsedMeal, UsdaMatch, UsdaCandidate, OffMatch } from './types'
import type { MacroSearchFn, ResolvedMeal } from './macros'

export class NeedsProError extends Error {
  constructor(message = 'Photo analysis and food search are Pro features.') {
    super(message)
    this.name = 'NeedsProError'
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 402) throw new NeedsProError()
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data && data.error) || `request failed (${res.status})`)
  return data as T
}

// Photo → Claude vision parse (foods + portions + clarifying questions).
// The route also resolves macros server-side (in parallel) and returns them as
// `resolved` so the client doesn't have to run the USDA waterfall itself.
// `resolved` is null only if USDA is unconfigured or errored server-side.
export async function parseMealPhoto(
  imageBase64: string,
  mediaType: string,
  caption?: string,
  mealTypeHint?: string,
  opts?: { escalate?: boolean; sourceHint?: string }
): Promise<{ parsed: ParsedMeal; resolved: ResolvedMeal | null }> {
  const data = await postJson<{ parsed: ParsedMeal; resolved: ResolvedMeal | null }>(
    '/api/nutrition/parse-meal',
    { imageBase64, mediaType, caption, mealTypeHint, sourceHint: opts?.sourceHint, escalate: opts?.escalate }
  )
  return { parsed: data.parsed, resolved: data.resolved ?? null }
}

// "What is this?" — a friendly one-line explanation of an unfamiliar food.
export async function explainFood(name: string, usdaDescription?: string): Promise<string> {
  const data = await postJson<{ text: string }>('/api/nutrition/explain-food', { name, usdaDescription })
  return data.text
}

// Single best USDA match for one search hint.
export async function usdaSearchBest(hint: string): Promise<UsdaMatch | null> {
  const data = await postJson<{ match: UsdaMatch | null }>('/api/nutrition/usda-search', { hint })
  return data.match
}

// Up to `max` ranked candidates for the manual-pick UI.
export async function usdaSearchMany(
  query: string,
  max = 5,
  mode: 'basic' | 'advanced' = 'basic'
): Promise<UsdaCandidate[]> {
  const data = await postJson<{ results: UsdaCandidate[] }>('/api/nutrition/usda-search', {
    query,
    many: true,
    max,
    mode,
  })
  return data.results
}

// Barcode → Open Food Facts product.
export async function offLookup(barcode: string): Promise<OffMatch | null> {
  const data = await postJson<{ match: OffMatch | null }>('/api/nutrition/off-lookup', { barcode })
  return data.match
}

// Adapter so lib/nutrition/macros.lookupMacrosForMeal can resolve foods over
// the network in the browser.
export const macroSearchFn: MacroSearchFn = (hint: string) => usdaSearchBest(hint)

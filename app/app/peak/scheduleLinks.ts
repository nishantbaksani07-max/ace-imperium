/**
 * Smart schedule-block links. A timed block whose title names one of the
 * user's brands (or reads like a workout) becomes a deep-link to that module:
 * the calendar row shows a small ↗ that jumps straight there, tinted with the
 * brand's accent. Pure matching here; the brand list is read client-side from
 * the same localStorage the Brand module owns (`vitality_brand_v1`).
 */

import { ARCHETYPE_ACCENTS } from '../brand/archetypes'
import type { Brand } from '../brand/types'

const BRAND_LS_KEY = 'vitality_brand_v1'
const HOUSE_MINT = '#6EE7B7'

/** The slice of a Brand the schedule needs to match + link + tint. */
export interface BrandLite {
  id: string
  name: string
  color: string
}

export interface ResolvedLink {
  kind: 'brand' | 'workout'
  href: string
  /** Human label for the tooltip / aria ("Open sam"). */
  label: string
  /** Accent hue for the ↗ button. */
  color: string
}

/** Workout-flavoured titles → the training logger (same target as the Train tile). */
const WORKOUT_RE = /\b(gym|workout|work\s?out|lift|lifting|train|training|cardio|legs|push|pull|squat|bench|deadlift)\b/i

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Read the user's brands from localStorage (non-archived, named only) as the
 * lightweight {id, name, color} the schedule needs. Returns [] on any read /
 * parse failure or on the server (no localStorage) — the feature just stays
 * dark rather than throwing.
 */
export function loadBrandLites(): BrandLite[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(BRAND_LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { brands?: Brand[] }
    const brands = Array.isArray(parsed?.brands) ? parsed.brands : []
    return brands
      .filter((b): b is Brand => !!b && !b.archived && typeof b.name === 'string' && b.name.trim().length > 0)
      .map((b) => ({
        id: b.id,
        name: b.name.trim(),
        color: ARCHETYPE_ACCENTS[b.archetype]?.hex ?? HOUSE_MINT,
      }))
  } catch {
    return []
  }
}

/**
 * Resolve a block title to a module link, or null. Brands win over the workout
 * keywords (a brand literally named "gym" should open the brand). A brand
 * matches on an exact title or as a whole word inside it ("sam", "ship sam").
 */
export function resolveBlockLink(title: string, brands: BrandLite[]): ResolvedLink | null {
  const t = title.trim().toLowerCase()
  if (!t) return null

  let hit = brands.find((b) => b.name.toLowerCase() === t)
  if (!hit) {
    hit = brands.find((b) => new RegExp(`\\b${escapeRegExp(b.name.toLowerCase())}\\b`).test(t))
  }
  if (hit) {
    return { kind: 'brand', href: `/app/brand/${hit.id}`, label: hit.name, color: hit.color }
  }

  if (WORKOUT_RE.test(title)) {
    return { kind: 'workout', href: '/app/fitness/log', label: 'training logger', color: HOUSE_MINT }
  }
  return null
}

/**
 * Type defs for the Progress module — weight log + progress photos.
 *
 * Weights are persisted to the Supabase `weights` table (BUILD02 schema:
 * unique on user_id+date, weight stored in kg regardless of display unit).
 * Progress photos live in localStorage for v1 (matches BUILD12 finance
 * pattern); a future build will move them to Supabase Storage with RLS.
 */

export type Units = 'kg' | 'lb'

/** A row from public.weights, projected to the fields the module reads. */
export interface WeightEntry {
  /** Local-date YYYY-MM-DD as stored in the `weights.date` column. */
  dateKey: string
  /** Canonical kilograms. UI converts to lb at the boundary. */
  weightKg: number
}

/** Local-only progress photo record (localStorage). */
export interface ProgressPhoto {
  id: string
  /** Data URL (compressed JPEG, max ~1080px). */
  dataUrl: string
  /** Local-date YYYY-MM-DD when the photo was added. */
  dateKey: string
  /** Snapshot of the user's most recent weight at capture time, e.g. "82.3 kg". Null if no weight logged yet. */
  weightLabel: string | null
}

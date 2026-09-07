// Canonical types for the CozyLoader content library. The CozyLoader component
// imports ToneKey + CozyItem from here so there is a single source of truth.

export type ToneKey = 'mint' | 'blue' | 'amber' | 'violet' | 'rose'

export interface CozyItem {
  /** The line of copy shown. */
  text: string
  /** An exact substring of `text` to color-emphasize. Optional. */
  highlight?: string
  /** The card tint for this item. Defaults to 'mint'. */
  tone?: ToneKey
}

/** A named content set for one section's cozy loader. */
export interface CozySet {
  /** Stable id, also the key the claude.ai prompt returns. */
  id: string
  /** Short human label for the lab. */
  label: string
  /** The loader's persistent header line (omit for bare empty states). */
  title?: string
  /** Playful rotating tags. */
  tags: string[]
  /** The tone palette this section draws from (drives the lab swatches). */
  tones: ToneKey[]
  /** The lines themselves. */
  items: CozyItem[]
}

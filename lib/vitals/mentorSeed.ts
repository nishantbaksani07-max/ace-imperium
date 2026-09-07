'use client'

/**
 * The "talk about this" bridge. The vitals page stashes a seed in sessionStorage
 * and routes to /app/mentor, which reads it once on mount and opens the chat with
 * the generated opener. Kept tiny and typed so both sides agree on the shape.
 */

const KEY = 'vitality.mentorSeed'

export interface MentorSeed {
  topic: string       // e.g. 'recovery'
  metricLabel: string // e.g. 'Recovery'
  line: string        // the insight line shown on the vitals page
  opener: string      // the assistant's opening question
}

export function stashMentorSeed(seed: MentorSeed): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(seed)) } catch { /* no-op */ }
}

/** Reads and CLEARS the seed so it only opens the conversation once. */
export function readMentorSeed(): MentorSeed | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    sessionStorage.removeItem(KEY)
    return JSON.parse(raw) as MentorSeed
  } catch { return null }
}

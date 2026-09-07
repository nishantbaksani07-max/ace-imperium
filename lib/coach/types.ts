// Food Coach — shared types.
//
// The coach is macro/nutrition in its job but omniscient in its context: it
// reads every questionnaire the user took across Vitality plus their live data,
// then scores the day's food or answers a question as *their* coach.

export type CoachMode = 'score' | 'chat'

/**
 * Client-side data the server cannot see (water + supplements live in
 * localStorage). CoachSection reads these read-only and posts them with each
 * request, the same bridge pattern the supplements recommender uses.
 */
export interface CoachSnapshot {
  water: {
    todayServings: number
    caffeineMgPerDay: number
  } | null
  supplements: {
    total: number
    takenToday: number
    names: string[]
  } | null
}

export interface CoachChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** One row of the per-user coach_memory table: the distilled long-term
 *  "what the coach knows about you" summary, refreshed as the chat grows. */
export interface CoachMemoryRow {
  summary: string
  message_count: number
  updated_at: string
}

export interface CoachRequest {
  mode: CoachMode
  /** Local YYYY-MM-DD day key the client is scoring / asking about. */
  dayKey: string
  snapshot?: CoachSnapshot | null
  /** chat mode: the running conversation (most recent last). */
  messages?: CoachChatMessage[]
  /** score mode: the cheap meal signature (count:kcal) the score is for, stored
   *  with the saved score so a reader can tell if it still matches the day. */
  sig?: string
}

/** score mode response. `score` is null when nothing is logged for the day. */
export interface CoachScoreResponse {
  score: number | null
  reason: string
}

/** chat mode response. */
export interface CoachChatResponse {
  reply: string
}

export interface CoachError {
  error: string
}

/** Output of the context assembler: the composed block + a couple of fields
 *  the route needs to make decisions (the name for warmth, today's meal count
 *  so score mode can short-circuit an empty day without a model call). */
export interface UserContext {
  text: string
  firstName: string | null
  todayMealCount: number
}

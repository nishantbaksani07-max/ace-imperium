/**
 * The Vent doorway teaser bubble. Picks the single most notable TRUE signal from
 * the user's recent data and phrases it the way Vee would — warm, specific, no
 * shame, never red. If nothing clear is there yet (a brand-new user), it returns
 * an honest SAMPLE instead of pretending it read data that doesn't exist.
 *
 * Pure + unit-tested. The same no-false-guilt rule as the drift engine: only
 * speak to a signal that is genuinely there.
 */

export interface VentSignals {
  /** nights under 6h in the last 7 (only counts nights that HAD sleep data) */
  sleepNightsUnder6: number
  /** how many of the last 7 nights actually had sleep data */
  sleepNightsTracked: number
  /** most recent recovery score, or null if no wearable */
  latestRecovery: number | null
  /** submitted workouts in the last 7 days */
  sessionsDone7d: number
}

export interface VentTeaser {
  /** the (illustrative) user vent line */
  user: string
  /** Vee's reply */
  vee: string
  /** substring of `vee` to emphasise (bold), if any */
  emphasis?: string
  /** true = built from this user's real data; false = generic sample */
  real: boolean
}

const USER_LINE = 'honestly today just feels rough, everything is off'

/** Shown to a user with no notable data yet — honestly labelled as a sample. */
export const SAMPLE_TEASER: VentTeaser = {
  user: USER_LINE,
  vee: 'Once you have logged a few days, I will notice things like a run of short nights or a heavy training week, and gently point to the one that is really weighing on you. Nothing is ever wrong with you.',
  real: false,
}

export function buildVentTeaser(s: VentSignals): VentTeaser {
  // Sleep — the most felt signal. Needs a real run of short nights, not one-off.
  if (s.sleepNightsTracked >= 3 && s.sleepNightsUnder6 >= 2) {
    const emphasis = `under 6 hours on ${s.sleepNightsUnder6} of the last ${s.sleepNightsTracked} nights`
    return {
      user: USER_LINE,
      vee: `Look at your sleep this past week. You have been ${emphasis}. That alone makes everything feel heavier than it is. Nothing is wrong with you. Want to talk about what is keeping you up?`,
      emphasis,
      real: true,
    }
  }

  // A real recovery dip today.
  if (s.latestRecovery != null && s.latestRecovery < 40) {
    const emphasis = `recovery is sitting at ${s.latestRecovery}`
    return {
      user: USER_LINE,
      vee: `Your ${emphasis} today. Your body is asking for a gentler day, and that is completely okay. None of this is you failing. Want to talk it through?`,
      emphasis,
      real: true,
    }
  }

  // A heavy training load — feeling worn down is the body keeping score.
  if (s.sessionsDone7d >= 5) {
    const emphasis = `trained ${s.sessionsDone7d} times in the last 7 days`
    return {
      user: USER_LINE,
      vee: `You have ${emphasis}. That is a serious load, and feeling worn down is your body keeping score, not you slipping. Rest is part of the work. Want to talk about it?`,
      emphasis,
      real: true,
    }
  }

  return SAMPLE_TEASER
}

/**
 * Shared contract for the "Vitality, I'm home" ritual.
 *
 * /api/home/pull returns exactly one HomePull; the shell (Homecoming.tsx)
 * fetches it once and hands the same object to every act. Acts derive every
 * number they show from this pull via the pure engines (lib/vitals/score.ts,
 * app/app/peak/curve.ts) - never invented values.
 */

/** One wearable_data row. Band rows and 'manual' rows share this shape. */
export interface PullReading {
  provider: string
  date: string
  recovery: number | null
  hrv: number | null
  rhr: number | null
  sleep_perf: number | null
  sleep_hours: number | null
  strain: number | null
}

/** One water_days row inside the 14-day presence window. */
export interface PullWaterDay {
  date: string
  count: number
}

/**
 * The Fuel stream, present only when the account has touched Macros
 * (a nutrition_goals row or any nutrition_meals row in the last 8 day keys).
 * Day sums are computed server-side so the payload stays tiny.
 */
export interface PullFuel {
  /** nutrition_goals.onboarded, false when the row is missing. */
  onboarded: boolean
  /** Today's summed meal kcal, or null when nothing is logged today. */
  todayKcal: number | null
  /** Per-day kcal sums for the last 7 logged days before today (oldest first). */
  recentDayKcals: number[]
}

export interface HomePull {
  /** Local YYYY-MM-DD (the client's clock defines "today"). */
  today: string
  /** Last 35 days of readings, all providers, date ascending. */
  readings: PullReading[]
  /** peak_state.data blob (superset of app/app/peak/types PeakState) or null. */
  peakState: unknown
  /** Servings today from water_days, or null. */
  waterToday: number | null
  /** water_days rows for the last 14 days (date ascending). Presence + pace. */
  waterRecent: PullWaterDay[]
  /** Fuel stream summary, or null when the account has never used Macros. */
  fuel: PullFuel | null
  /** Locked day_name from training_day for today, or null. */
  trainingDay: string | null
  /** training_settings.rotation_days jsonb, or null. */
  rotationDays: unknown
  /** training_settings.cycle_started_at, or null. */
  cycleStartedAt: string | null
  /** Last 14 workouts, date descending. */
  recentWorkouts: { date: string; day_name: string | null }[]
}

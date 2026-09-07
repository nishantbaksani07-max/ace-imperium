// Hand-written types matching the BUILD02 schema.
// Regenerate with `npx supabase gen types typescript --project-id <your-project-ref>`
// after the migration has been applied in the Supabase SQL editor.

export type Goal = 'recomp' | 'cut' | 'bulk' | 'maintain' | 'general_health'
export type Units = 'metric' | 'imperial'
export type Sex = 'M' | 'F'

// Focus areas — the multi-select that replaced `goal` as the last
// onboarding question. Maps to the app's module clusters: body
// (fitness, fuel/water, supplements), mind (mentor/goals/notes), peak
// (sleep/wearables), brand (audience/business), money (finance).
// Saved as text[] on user_profile.focus_areas; the dashboard reads
// it to prioritize which module tiles surface first.
export type FocusArea = 'body' | 'mind' | 'peak' | 'brand' | 'money'
export type SplitType = '3_day' | '4_day' | '5_day' | '6_day' | 'custom'
export type WearableProvider = 'whoop'
export type Tier = 'free' | 'plus' | 'pro'

// Mirrors Stripe Subscription.status. Stored as plain text so we
// don't have to migrate the schema when Stripe adds a value.
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused'

export interface Profile {
  id: string
  onboarded: boolean
  tier: Tier
  stripe_customer_id: string | null
  subscription_status: SubscriptionStatus | null
  current_period_end: string | null  // ISO timestamp
  created_at: string
}

export interface UserProfile {
  user_id: string
  first_name: string
  birthday: string          // date string YYYY-MM-DD
  sex: Sex
  height_cm: number
  starting_weight_kg: number
  units: Units
  /** Legacy single-pick goal — null for users onboarded after PATCH10
   *  switched to focus_areas. Existing data preserved. */
  goal: Goal | null
  focus_areas: FocusArea[] | null
  onboarding_step: number
  created_at: string
  updated_at: string
}

export interface Weight {
  id: string
  user_id: string
  date: string              // date string YYYY-MM-DD
  weight_kg: number
  note: string | null
  created_at: string
}

export interface WaterLog {
  id: string
  user_id: string
  date: string              // date string YYYY-MM-DD
  amount_ml: number
  logged_at: string
  created_at: string
}

export interface SupplementsStack {
  id: string
  user_id: string
  supplement_name: string
  dose: string | null
  timing: string | null
  with_food: boolean | null
  notes: string | null
  created_at: string
}

export interface WearableConnection {
  id: string
  user_id: string
  provider: WearableProvider
  provider_user_id: string
  encrypted_refresh_token: string
  encrypted_access_token: string
  access_token_expires_at: string
  connected_at: string
}

export interface WearableData {
  id: string
  user_id: string
  date: string              // date string YYYY-MM-DD
  provider: WearableProvider
  hrv: number | null
  rhr: number | null
  sleep_perf: number | null
  sleep_hours: number | null
  recovery: number | null
  strain: number | null
  raw: Record<string, unknown> | null
  created_at: string
}

export interface TrainingSettings {
  user_id: string
  split_type: SplitType
  rotation_days: Record<string, string>  // e.g. { "1": "Push", "2": "Pull", ... }
  created_at: string
  updated_at: string
}

export interface Workout {
  id: string
  user_id: string
  date: string              // date string YYYY-MM-DD
  day_name: string
  exercises: WorkoutExercise[]
  submitted_at: string | null
  created_at: string
}

export interface WorkoutExercise {
  name: string
  sets: WorkoutSet[]
}

export interface WorkoutSet {
  reps: number
  weight_kg: number
  done: boolean
  failed: boolean
}

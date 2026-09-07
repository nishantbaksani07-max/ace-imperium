import type { CardStyle } from '@/lib/vee/askLayout'
import type { ContextArea } from './contextStubs'
import type { GoalCategory } from '@/lib/goals/categories'

export interface Note {
  id: string
  body: string
  created_at: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Present when Vee asked via a cozy card instead of (or alongside) prose. */
  ask?: VeeAsk
  /** Set once the user has answered an ask card; locks it (chosen value). */
  askAnswered?: string
  /** Layout + animation chosen once when the card arrives, frozen for stability. */
  cardStyle?: CardStyle
}

/** One tappable answer on a Vee ask card. */
export interface VeeAskOption {
  label: string   // short chip text, e.g. 'Sharp'
  value: string   // sent back as the user's answer in natural words
  glyph: string   // a name in lib/vee/askGlyphs ASK_GLYPHS
}

/**
 * A structured clarifying question Vee renders as a cozy card. Produced by the
 * chat route from a hidden ===ASK=== block. `key` is the single word in `lead`
 * to highlight (the Vitals .hl sweep); optional.
 */
export interface VeeAsk {
  tag: string
  lead: string
  key?: string
  sub?: string
  options: VeeAskOption[]
  /** True for an ordered / severity question (drives the dial + meter layouts). */
  ordered?: boolean
}

/**
 * One cell of the live-data ticker that runs across the top of the
 * Mentor module. Only metrics with a real value get an item — never
 * render a placeholder like "HRV —" because that signals "broken,"
 * not "not connected."
 */
export interface MentorTickerItem {
  label: string  // mono caps, e.g. 'HRV', 'SLEEP', 'WEIGHT'
  value: string  // formatted display value, e.g. '64ms', '6.7h', '78kg'
}

/**
 * One row of "What Vee remembers" — a user_facts row trimmed for display.
 * `source` is the module that wrote the fact (train/fuel/vitals/goals/
 * money/mentor/...); the UI maps it to that tile's chip color.
 */
export interface MemoryFact {
  id: string
  source: string
  body: string
  createdAt: string
}

/**
 * One big goal, trimmed for the in-tab GoalsPeek (BUILD42 Phase 3). Goals are
 * housed in Vee, so the mentor tab shows the user's top active goals; the full
 * surface lives at /app/goals.
 */
export interface MentorGoal {
  id: string
  title: string
  cleanTitle: string | null
  category: GoalCategory | null
  targetDate: string | null
  priority: 1 | 2 | 3
  push: 'silent' | 'gentle' | 'balanced' | 'push'
  /** The goal's own measurement unit (free-text, e.g. 'lb'), the source of truth
   *  the goal-guide brain reads so a goal speaks its own unit, not the account's. */
  progressUnit: string | null
}

export interface TrainingDayOption {
  name: string
  category: string
}

export interface TrainingDayProps {
  today: string
  guessName: string | null
  reason: string
  options: TrainingDayOption[]
  alreadyConfirmed: boolean
}

/**
 * One saved context-store fact (a finished "Folded Notes" sentence), passed
 * from the server to the client. Backed by a user_facts row with
 * source='mental_health' and kind=<area>.
 */
export interface ContextFact {
  id: string
  area: ContextArea
  body: string
}

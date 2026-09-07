/**
 * Cold-start for "Vitality noticed".
 *
 * The green-light oracle only fires on a real, gated, goal-anchored convergence
 * (greenlight.ts) — which is exactly right, but means a brand-new user (the
 * person Sam's funnel sends) would see NOTHING at the §01 top of Vee until
 * weeks of data converge. That empty state is the #1 conversion risk.
 *
 * This pure helper fills it with an honest PROMISE instead of a fake finding:
 * "here is what I will watch for you." It never claims to have noticed a pattern
 * it hasn't. The card owns the discovery later; for now it owns the intent.
 *
 * IO-free + unit-tested (see __tests__/coldStart.test.ts).
 */

export interface StarterNotice {
  /** 'noGoal' = invite them to set one; 'watching' = a goal exists, watch is armed. */
  kind: 'noGoal' | 'watching'
  headline: string
  body: string
  /** Domain words shown as chips — what Vee is (or will be) watching. */
  watching: string[]
  goalTitle: string | null
}

/** What the oracle can watch the seams of, once there's data. */
const DEFAULT_WATCH = ['training', 'sleep', 'food', 'mood', 'weight']

/** "a and b" / "a, b, and c" — a warm, readable list (no Oxford-comma drama for 2). */
function readableList(items: string[]): string {
  if (items.length === 0) return 'your days'
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

export function buildStarter(input: {
  topGoalTitle: string | null
  activeGoalCount: number
  loggedDomains: string[]
}): StarterNotice {
  const { topGoalTitle, activeGoalCount, loggedDomains } = input

  if (activeGoalCount === 0) {
    return {
      kind: 'noGoal',
      headline: 'tell me what you are working toward',
      body: 'name one thing, and I start watching the seams of your days, your training, sleep, food, and mood, for the one thing that quietly moves it.',
      watching: DEFAULT_WATCH,
      goalTitle: null,
    }
  }

  const watching = loggedDomains.length > 0 ? loggedDomains : DEFAULT_WATCH
  const goal = topGoalTitle && topGoalTitle.trim() ? topGoalTitle.trim() : null
  return {
    kind: 'watching',
    headline: goal ? `I am watching ${goal}` : 'I am watching your goal',
    body: `across your ${readableList(watching)}. nothing is pulling on it yet, so keep logging and I will flag the first real thing the moment it shows.`,
    watching,
    goalTitle: goal,
  }
}

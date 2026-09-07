/**
 * Goal triage — the nine universal buckets every goal funnels into (BUILD47).
 * One word + one icon each so the system (and Vee) knows what a goal is about at
 * a glance. Colour LAW: all buckets render iris, never rainbow — meaning rides on
 * the icon shape + the word, colourblind-safe.
 *
 * Pure module: the type, the display words, a clamp, and a deterministic keyword
 * fallback used when the AI read in lib/goals/categorize.ts is unavailable.
 */

export type GoalCategory =
  | 'fitness' | 'health' | 'mind' | 'money'
  | 'career' | 'craft' | 'audience' | 'people' | 'general'

export const GOAL_CATEGORIES: GoalCategory[] = [
  'fitness', 'health', 'mind', 'money', 'career', 'craft', 'audience', 'people', 'general',
]

export const CATEGORY_WORD: Record<GoalCategory, string> = {
  fitness: 'Fitness', health: 'Health', mind: 'Mind', money: 'Money',
  career: 'Career', craft: 'Craft', audience: 'Audience', people: 'People', general: 'General',
}

/** Coerce any value to a safe category (defaults to general). */
export function clampCategory(v: unknown): GoalCategory {
  if (typeof v !== 'string') return 'general'
  const k = v.trim().toLowerCase()
  return (GOAL_CATEGORIES as string[]).includes(k) ? (k as GoalCategory) : 'general'
}

// Deterministic fallback (first match wins; order = priority). Used when the AI
// is unavailable so a goal is never left untagged. General is the catch-all.
// People runs BEFORE money so "save my marriage" reads people via 'marriage',
// never money via the bare 'save'.
const KEYWORDS: [GoalCategory, RegExp][] = [
  // note: "running"/"marathon" only — NOT bare "run" (so "run a business" isn't
  // fitness), and "5k"/"10k" only next to a running word (so "save 10k" isn't).
  // Injury/rehab words live here so "rehab my knee" reaches the gentle comeback
  // route (goalGuide isInjuryGoal), and walk/steps so "walk 10k steps" is fitness.
  ['fitness', /\b(bench|squat|deadlift|lift|lifting|gym|running|jog|marathon|\bmile\b|muscle|abs|push ?up|pull ?up|workout|train(ing)?|cardio|weights?|strong(er)?|sport|sets?|reps?|pr\b|jacked|shredded|injur\w*|rehab\w*|physio|surgery|walk(ing)?)\b|\b\d[\d,]*k? ?steps?\b|\bsteps? a day\b|\b(run|running|jog|race)\b.*?\b(5|10) ?k\b|\b(5|10) ?k\b.*?\b(run|running|jog|race)\b/i],
  ['people', /\b(family|friends?|date|dating|relationship|marriage|wife|husband|partner|community|social life|network(ing)?|connect|kids?|parent|reconnect|mom|mum|mommy|dad|daddy|mother|father|son|daughter|brother|sister|grandm\w*|grandf\w*|grandpa|grandma)\b/i],
  ['money', /\b(save|saving|savings|invest(ing)?|debt|budget|net worth|money|cash|salary|income|revenue|mrr|arr|retire|emergency fund|pay off|portfolio|crypto|stocks?)\b/i],
  ['audience', /\b(subs?|subscribers?|followers?|youtube|tiktok|instagram|\big\b|twitter|audience|brand|views?|reach|viral|channel|patreon|newsletter|subscribers)\b/i],
  ['career', /\b(job|promot\w*|career|interview|resume|cv|hired?|clients?|startup|company|freelance|raise|business|sales?)\b/i],
  ['craft', /\b(music|song|album|art|draw(ing)?|paint(ing)?|writ(e|ing)|book|novel|design|build|code|coding|app|guitar|piano|produce|content|film|video|photo(graph)?y?|pottery|woodwork)\b/i],
  ['mind', /\b(learn|read(ing)?|study(ing)?|course|skill|language|spanish|french|german|degree|exam|focus|productiv\w*|memorize|knowledge)\b/i],
  // Prefix stems carry \w* so the trailing \b can still match ("meditate",
  // "hydrated", "therapist"); a bare stem inside \b(...)\b can never fire.
  // Body-comp words (lose/weight/pounds/kg/lbs/bulk/lean) live here so
  // "lose 10 pounds" gets its weight lever instead of dying in General.
  ['health', /\b(sleep|nutrition|protein|water|hydrat\w*|recover(y)?|stress|meditat\w*|mindful\w*|quit|smok(e|es|ing|er)?|vap(e|es|ing)|sober|drink less|mental health|therap\w*|calories|diet|eat (better|healthy)|fast(ing)?|posture|lose|weight|pounds?|\bkg\b|\blbs?\b|bulk(ing)?|lean(er)?|shred(ded|ding)?)\b/i],
]

export function guessCategory(title: string): GoalCategory {
  const t = title || ''
  for (const [cat, re] of KEYWORDS) if (re.test(t)) return cat
  return 'general'
}

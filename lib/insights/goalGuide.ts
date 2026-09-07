/**
 * The per-goal "how Vitality gets you there" guide, the recommendation set that
 * fills a goal's dropdown (Layer B of the goal surface).
 *
 * The locked safety rule mirrors the ticker: every recommendation points to a
 * REAL, shipped Vitality feature from a fixed whitelist. The brain may pick and
 * order from that list per goal, but can NEVER invent a feature. So across any
 * goal from any user, the worst case is a real-but-imperfect suggestion, never
 * vaporware, never a dead link.
 *
 * Each item is either a "quick-link" (the user already logs this domain, a fast
 * route in) or a "demo" (they don't yet, a tile that sells why to start). Pure +
 * IO-free + unit-tested (see __tests__/goalGuide.test.ts).
 *
 * THE BRAIN (deterministic). On top of the fresh/active copy swap, a context-rich
 * goal gets a hyper-personal call-out computed from the user's real data: a
 * train-led goal whose lifts have gone flat reads "your bench has not moved in a
 * month, push harder" instead of the generic "beat last time". The strike is rare
 * and earned (a 3+ week stall) so it lands like the golden-URL "Vitality noticed"
 * moment. Rules over data, instant and free, the deep AI version stays on the
 * golden URL. Reuses the canonical `liftStall` + `matchGoalToLift` (no second
 * source of truth). More holes (macros, weigh-in timing, missed days) plug in here.
 */

import { liftStall, type LiftSession } from '@/mcp/src/insights'
import { matchGoalToLift } from '@/lib/oracle/goalMatch'
import { exerciseReferences } from '@/lib/exerciseReferences'
import { weeklyWeightRate } from '@/lib/insights/ticker'
import { kgToDisplay, unitLabel, type Units } from '@/lib/units'
import { detectGoalUnit, normalizeGoalUnit } from '@/lib/goals/goalUnit'
import { guessCategory } from '@/lib/goals/categories'
import { inferBodyDirection } from '@/lib/goals/direction'
// The registry imports only `type GuideModule` back from this file (type-only,
// erased at compile), so this value import can never form a runtime cycle.
import { MODULE_PRIMARY, bindingOptionsForCategory } from '@/lib/insights/metricRegistry'

export type GuideModule =
  | 'train' | 'macros' | 'weight' | 'water' | 'recovery' | 'supplements' | 'brand' | 'finance'
  | 'notes'

/** The tiny mini-preview sketch drawn on a demo tile (abstract, not a replica). */
export type GuidePreview = 'bars' | 'line' | 'ring' | 'wave'

export interface GuideItem {
  module: GuideModule
  /** Short action label, the feature we're selling. */
  label: string
  /** The SMART, non-obvious reason this moves the goal. Short, powerful, no em
   *  dashes. The deep, personalised version lives in the golden URL (talk in
   *  Claude). `key` is a verbatim substring of `why`, the UI highlights it and
   *  makes it the demo trigger. */
  why: string
  /** The phrase inside `why` to highlight + turn into the demo trigger. */
  key: string
  /** A real, shipped Vitality route. */
  href: string
  /** Already logging this domain → a compact quick-link; else → a demo tile. */
  using: boolean
  /** Which animated mini-demo + sketch to show. */
  preview: GuidePreview
}

/**
 * The whitelist. Every href is a real /app route. Copy is DIRECT and actionable
 * (never a clever saying), short and scannable, no em dashes. `key` must appear
 * verbatim inside `why`.
 *
 * Each feature carries TWO copy variants and the guide picks one from the user's
 * state: `fresh` for someone not logging this yet (start here), `active` for
 * someone who already logs it (a deeper, more personal push). This is the first
 * step of the adaptive brain: the recommendation stays, the sentence evolves.
 */
type Copy = { why: string; key: string }
const FEATURES: Record<GuideModule, { label: string; href: string; preview: GuidePreview; fresh: Copy; active: Copy }> = {
  train: {
    label: 'Log your lifts', href: '/app/fitness/log', preview: 'bars',
    fresh: { why: 'Log your lifts. Beat last time by one rep or a little weight, every session.', key: 'Beat last time by one rep or a little weight' },
    active: { why: 'You log already. If a lift stalls two weeks, force it up with a rep or a little weight.', key: 'If a lift stalls two weeks' },
  },
  macros: {
    label: 'Hit your protein', href: '/app/fuel/macros', preview: 'bars',
    fresh: { why: 'Log every meal. Hit your protein target every single day.', key: 'Hit your protein target every single day' },
    active: { why: 'You track meals. Pull more protein from whole foods, not bars, and plug your low days.', key: 'more protein from whole foods, not bars' },
  },
  weight: {
    label: 'Track your weight', href: '/app/fitness/progress', preview: 'line',
    fresh: { why: 'Weigh in daily, same time each morning, before food or water.', key: 'same time each morning' },
    active: { why: 'You weigh in already. Trust the trend line, not the daily jump.', key: 'the trend line, not the daily jump' },
  },
  water: {
    label: 'Stay hydrated', href: '/app/fuel/water', preview: 'ring',
    fresh: { why: 'Log your water across the day, not all at once.', key: 'not all at once' },
    active: { why: 'You track water. Stay ahead of it, you lose strength before you feel thirsty.', key: 'before you feel thirsty' },
  },
  recovery: {
    label: 'See your recovery', href: '/app/vitals', preview: 'line',
    fresh: { why: 'Track your sleep and recovery every day.', key: 'your sleep and recovery' },
    active: { why: 'You track recovery. Compare your average to your baseline to catch a slump early.', key: 'Compare your average to your baseline' },
  },
  supplements: {
    label: 'Dial your stack', href: '/app/fitness/supplements', preview: 'ring',
    fresh: { why: 'Track your stack and take it the same time every day.', key: 'the same time every day' },
    active: { why: 'You track your stack. Hold the streak, a supplement only works when it is consistent.', key: 'only works when it is consistent' },
  },
  brand: {
    label: 'Grow your brand', href: '/app/brand', preview: 'line',
    fresh: { why: 'Save a follower snapshot every week.', key: 'follower snapshot every week' },
    active: { why: 'You track followers. Watch the slope between snapshots, not the raw count.', key: 'the slope between snapshots' },
  },
  finance: {
    label: 'Build net worth', href: '/app/finance', preview: 'line',
    fresh: { why: 'Update your net worth every week.', key: 'net worth every week' },
    active: { why: 'You track net worth. Read the trend to catch the months money leaks.', key: 'the months money leaks' },
  },
  // The honest floor lever (TRAIN 4): when no module can measure a goal, notes
  // can. One line a day is real data Vee reads, so NO goal is ever leverless -
  // and it never over-promises (a note is a pulse, not a graph).
  notes: {
    label: 'Write a note in Vee', href: '/app/mentor', preview: 'wave',
    fresh: { why: 'Write a note each day and I measure your good days.', key: 'I measure your good days' },
    active: { why: 'Keep the daily notes coming. Each one is a real datapoint I read for this goal.', key: 'a real datapoint I read' },
  },
}

/**
 * The per-module "feed me" ask, what to log so THIS lever's module comes to
 * life. Used by the panel when a goal has a lever but no series yet, so the
 * paragraph and the lightbulb always name the SAME tracker (the old
 * category-level line asked for a weigh-in above a sleep lever). Each line
 * promises only what the engine actually does with that data.
 */
export const MODULE_FEED_ME: Record<GuideModule, string> = {
  train: 'log your first session in Train and this becomes a live graph.',
  weight: 'log a weigh-in and I will start drawing this.',
  macros: 'log a meal in Fuel and I start reading how you eat.',
  water: 'log your water in Fuel and I start counting your days.',
  recovery: 'track a night of sleep in Vitals and I start reading your recovery.',
  supplements: 'tick your stack in Fuel and I start watching the streak.',
  brand: 'save a follower snapshot in Brand and I start reading your growth.',
  finance: 'update your net worth in Finance and I start watching where your money is heading.',
  notes: 'write a note in Vee each day and I will start measuring your good days.',
}

/**
 * Map a goal to an ordered set of modules. Most-specific themes first (brand /
 * finance / sleep / recovery / cardio / hydration / nutrition) so they win over
 * the broad strength / body-comp catch-alls; a vague goal falls to the honest
 * category fallback (which is often an EMPTY guide, on purpose).
 *
 * Two-tier matching, all word-bound (no substring hits: 'create' is not 'eat',
 * 'grow' is not 'row', 'smile' is not 'mile'):
 *   - STRONG words name the domain unambiguously ('protein', 'net worth',
 *     'subscribers') and win for any category.
 *   - LOOSE words are everyday verbs ('save', 'spend', 'eat', 'cut', 'gain',
 *     'tired') that only count when the goal's category AGREES with the theme's
 *     domain, or the goal is still uncategorized. So "save my marriage" (people)
 *     never earns the net-worth lever, while "save 10k" (money) still does.
 */
type ThemeRule = {
  modules: GuideModule[]
  /** Unambiguous domain words, win regardless of category. */
  strong: RegExp
  /** Everyday verbs/idioms, win only when the category agrees (or is unknown). */
  loose?: RegExp
  /** Categories that let the loose words count. */
  looseCats?: string[]
  /** Categories that trigger this rule on their own, keyword or not (the
   *  fitness bucket earns the strength set even from a wordless title). */
  cats?: string[]
  /** Categories this theme is naturally at home in. On a LONG multi-domain
   *  title (a rant), a strong word only wins when the goal's category agrees -
   *  otherwise the first strong word in rule order hijacks the lever away from
   *  the goal's real domain ("...bank account... make money... see my friends"
   *  is a people goal, not a net-worth one). Short titles are unaffected. */
  domainCats: string[]
  /** Per-rule copy overrides: a module whose generic FEATURES copy reads wrong
   *  for THIS theme gets its own fresh/active pair (cardio must never say
   *  "beat last time by one rep"), and optionally its own action label. */
  copy?: Partial<Record<GuideModule, { label?: string; fresh: Copy; active: Copy }>>
}

/** Cardio's own train copy: the module is right (Train logs sessions), the
 *  barbell sentence is not. Fixed variants, registered as canned. */
const CARDIO_TRAIN_COPY = {
  label: 'Log your cardio',
  fresh: { why: 'Log your cardio sessions in Train. Add a little distance or pace each week.', key: 'a little distance or pace each week' },
  active: { why: 'You log already. Nudge the distance or the pace up a little each week and the engine builds.', key: 'the distance or the pace up a little' },
}

const THEME_RULES: ThemeRule[] = [
  {
    modules: ['brand'],
    strong: /\b(followers?|subscribers?|subs|audience|youtube|channel|creator|tiktok|instagram|reels?|views|newsletter|patreon|brand)\b|\bgrow(ing)? my (account|channel|audience|following)\b/,
    // no 'engagement': it is a wedding word as often as a metrics word, and as a
    // metric it nearly always rides with a strong word (followers / content).
    loose: /\b(content|posts?|posting|follow(ing)?)\b/,
    looseCats: ['audience'],
    domainCats: ['audience', 'career', 'craft'],
  },
  {
    modules: ['finance'],
    strong: /\b(net ?worth|invest(ing|ment|ments)?|wealth|debt|budget(ing)?|income|revenue|mrr|arr|money|cash|rich|salary|savings|financ\w*)\b/,
    loose: /\b(save|saving|spend(ing)?)\b/,
    looseCats: ['money'],
    domainCats: ['money', 'career'],
  },
  {
    modules: ['recovery', 'water'],
    strong: /\b(sleep(ing)?|insomnia|bed ?time)\b/,
    loose: /\b(rest more|tired)\b/,
    looseCats: ['health'],
    domainCats: ['health', 'fitness'],
  },
  {
    modules: ['recovery', 'weight'],
    strong: /\b(recover(y|ing)?|hrv|readiness|burnout)\b/,
    loose: /\b(stress(ed)?|sore(ness)?|energy)\b/,
    looseCats: ['health', 'fitness'],
    domainCats: ['health', 'fitness'],
  },
  {
    modules: ['train', 'recovery'],
    // '5k' / '10k' are loose, not strong: on a money goal they are a currency
    // magnitude ("save 10k"), so they only count when the category can be a run.
    strong: /\b(cardio|endurance|running|jog(ging)?|marathon|conditioning)\b/,
    loose: /\b(miles?|5 ?k|10 ?k)\b/,
    looseCats: ['fitness'],
    domainCats: ['fitness', 'health'],
    copy: { train: CARDIO_TRAIN_COPY },
  },
  {
    modules: ['supplements', 'macros'],
    strong: /\b(supplements?|creatine|magnesium|vitamins?|omegas?|stack)\b/,
    domainCats: ['health', 'fitness'],
  },
  {
    modules: ['water', 'supplements'],
    strong: /\b(water|hydrate|hydrated|hydration)\b/,
    loose: /\bdrink more\b/,
    looseCats: ['health'],
    domainCats: ['health', 'fitness'],
  },
  {
    modules: ['macros', 'water', 'weight'],
    strong: /\b(diet(ing)?|macros?|protein|calories?|cals?|nutrition|sugar|carbs?|meals?|fasting)\b/,
    loose: /\b(eat(ing)?)\b/,
    looseCats: ['health', 'fitness'],
    domainCats: ['health', 'fitness'],
  },
  {
    modules: ['train', 'macros', 'weight'],
    strong: /\b(bench|squat|deadlift|ohp|lifts?|lifting|gym|workouts?|train(ing|er)?|strength|strong(er)?|muscles?|prs?|plates?|reps?)\b/,
    loose: /\b(press(es)?|curls?|pull ?ups?|rows?)\b/,
    looseCats: ['fitness'],
    cats: ['fitness'],
    domainCats: ['fitness', 'health'],
  },
  {
    modules: ['weight', 'macros', 'train'],
    strong: /\b(lean(er)?|fat|shred(ded|ding)?|bulk(ing)?|recomp|body ?comp(osition)?|body ?weight|weight|lighter)\b/,
    loose: /\b(lose|losing|cut(ting)?|gain(ing|s)?|toned?)\b/,
    looseCats: ['health', 'fitness'],
    domainCats: ['health', 'fitness'],
  },
]

/** Titles longer than this are rants: multi-domain sentences where the first
 *  strong word in rule order is usually NOT the goal's real domain. Past it,
 *  strong words need category agreement (domainCats), like loose words do. */
const LONG_TITLE = 120

/** Quit-a-vice titles inside the health bucket: the scale has nothing honest to
 *  say about vaping, so these earn silence (an empty guide) instead of the
 *  weight/macros default, unless a body word already matched a theme above.
 *  Exported so the panel's feed-me line can honor the same call (never ask for
 *  a weigh-in on a goal the guide just declared the scale mute about). Test on
 *  a LOWERCASED title (no /i flag, matching themeModules).
 *  Alcohol: "quit/stop/cut back on drinking", bare "booze/liquor/beer/wine/
 *  hangover", and "drink(ing) less" all mute the scale. The quit-context is
 *  REQUIRED before "drinking" so a hydration goal ("drink more water") is never
 *  muted - that pattern needs a quit word immediately before drink, which
 *  "drink more water" does not have. Do not add bare "drink" here. */
export const VICE_RE = /\b(vap(e|es|ing)|smok(e|es|ing)|cigs?|cigarettes?|nicotine|sober|sobriety|alcohol|booze|liquor|beer|wine|hangovers?|drink(ing)? less|(?:quit|stop|cut(?:ting)?(?: back| down)?(?: on)?|reduce|reducing|fewer|less) drink(?:ing|s)?|weed|gambl(e|ing)|porn|bad habits?|(?:quit|stop|break)(?:ping|ting|ing)? (?:my |a )?(?:bad )?habits?)\b/

/** Mind-adjacent health goals ("therapy every week", "fix my posture",
 *  "improve my mental health", "meditate daily") plus behavioral habits the AI
 *  triage plausibly files under health ("stop biting my nails", "stop
 *  doomscrolling", "less screen time", "be happier", "journal every day"):
 *  the scale has NOTHING honest to say here, so the health fallback must never
 *  hand these its weigh-in lever. Like VICE_RE they earn the notes lever
 *  instead. Exported so the panel's feed-me line honors the same call. Test on
 *  a LOWERCASED title. */
export const SCALE_MUTE_RE = /\b(therap\w*|mental health|counsel\w*|psycholog\w*|posture|meditat\w*|mindful\w*|anxiety|depress\w*|nail ?bit\w*|bit(e|ing) (my )?nails?|doomscroll\w*|screen ?time|social media|happ(y|ier|iness)|wellbeing|gratitude|journal\w*)\b/

/** Injury / rehab body goals ("rehab my knee", "recover from shoulder
 *  surgery", "squat without pain"): the LAST thing to say is "beat last time".
 *  These route to the recovery module with GENTLE copy: ease back in, let
 *  recovery lead. Exported so the panel's feed-me line honors the same call. */
export const INJURY_RE = /\b(injur\w*|rehab\w*|recover(?:y|ing)? from|surgery|physio|pain)\b/i

/** The one gentle injury/rehab copy. A fixed variant (like fresh/active), so
 *  guideGroundedWhy / guideProjectionLead can tell it apart from a data-grounded
 *  brain read and never mislabel it. `key` is verbatim inside `why`. */
const INJURY_COPY: Copy = {
  why: 'Ease back in and let recovery lead. Track your sleep and how you feel each day, and add load only when your body says yes.',
  key: 'let recovery lead',
}

/** Body-adjacent buckets where an injury word really means an injury. A mind /
 *  people / money goal that says "pain" ("the pain of studying") stays out. */
const INJURY_CATS = new Set(['fitness', 'health', 'general'])

/** True when this goal should take the gentle injury/rehab route: a
 *  body-adjacent goal whose words say injury, rehab, surgery or pain. Accepts
 *  fitness AND health ("recover from shoulder surgery" often triages health),
 *  plus general/uncategorized via the deterministic stand-in, the fallback
 *  categorizer has no crystal ball, and the gentle route must not die with it. */
export function isInjuryGoal(title: string, category: string | null): boolean {
  if (!INJURY_RE.test(title)) return false
  const cat = (category ?? '').toLowerCase() || guessCategory(title)
  return INJURY_CATS.has(cat)
}

type ThemeMatch = { modules: GuideModule[]; rule?: ThemeRule }

function themeMatch(title: string, category: string | null): ThemeMatch {
  const t = title.toLowerCase()
  // A null category (categorize failed silently / never ran) used to un-gate
  // every LOOSE word, so "save my relationship with my son" earned the
  // net-worth bulb. The deterministic guessCategory now stands in, so loose
  // words stay category-gated for every goal.
  const cat = (category ?? '').toLowerCase() || guessCategory(t)
  const long = t.length > LONG_TITLE

  // Two-pass so a LATER rule's STRONG word always beats an EARLIER rule's loose
  // one ("tired of being fat" must read body-comp via the strong 'fat', never
  // sleep via the loose 'tired'). Pass 1: strong words only, in rule order.
  // On a LONG title (a rant), a strong word additionally needs the category to
  // agree with the theme's home domain: the first strong word in a 150-char
  // multi-domain sentence is usually not what the goal is about. A long rant
  // with NO agreeing category ('general') matches no theme at all, otherwise
  // rule ORDER, not dominance, would pick its lever; it takes the notes floor.
  for (const rule of THEME_RULES) {
    if (!rule.strong.test(t)) continue
    if (long && !rule.domainCats.includes(cat)) continue
    return { modules: rule.modules, rule }
  }
  // Pass 2: category triggers + loose words, in rule order. A scale-muted or
  // vice title never earns a WORDLESS category trigger (a 'fitness'-triaged
  // "fix my posture" must not get the barbell set): with no body word and the
  // scale ruled mute, the honest lever is the notes floor below.
  const muted = VICE_RE.test(t) || SCALE_MUTE_RE.test(t)
  for (const rule of THEME_RULES) {
    if (!muted && rule.cats?.includes(cat)) return { modules: rule.modules, rule }
    if ((rule.looseCats?.includes(cat) ?? false) && rule.loose?.test(t)) return { modules: rule.modules, rule }
  }

  // Category-aware fallback. Only body-adjacent buckets earn the body-tracking
  // default; a workflow / career / craft / people / mind / general goal gets NO
  // module here (buildGoalGuide gives it the honest notes lever) instead of a
  // nonsense "weigh in daily" on a goal about someone's job. Inside health, a
  // vice goal (stop vaping / get sober) and a mind-adjacent goal (therapy /
  // posture / mental health) both mute the scale: no body word appeared, so
  // the weigh-in is not the lever, they take the notes route too.
  if (cat === 'health') return { modules: VICE_RE.test(t) || SCALE_MUTE_RE.test(t) ? [] : ['weight', 'macros'] }
  if (cat === 'money') return { modules: ['finance'] }
  if (cat === 'audience') return { modules: ['brand'] }
  return { modules: [] }
}


/** One trained lift's full top-set series (with reps), mirroring mcp
 *  `getLiftProgression`. Reps let the brain count adding-a-rep as progress. */
export interface GuideLift {
  id: string
  name: string
  sessions: LiftSession[]
}

/**
 * Pre-computed, IO-free facts about the user that the brain reads to upgrade the
 * canned copy into a specific personal call-out. The server gathers these (it
 * already pulls `getLiftProgression` for the ticker); the guide stays pure. Grows
 * as more holes get detectable (low-protein days, missed weigh-ins, ...).
 */
export interface GuideSignals {
  /** The lifts the user actually trains, for stall detection. */
  lifts?: GuideLift[]
  /** Today's local date key (YYYY-MM-DD), for projecting an ETA against a goal date. */
  today?: string
  /** The user's display unit, so projected numbers read in kg or lb (not raw). */
  units?: Units
  /** A window of weigh-ins (kg), any order, for the weight row's trend read. */
  weighIns?: { date: string; kg: number }[]
  /** The user's body-comp direction from their profile, if any. */
  weightDirection?: 'lose' | 'gain' | 'maintain' | null
  /** Recent daily protein totals (grams) + the user's target, for the protein row. */
  protein?: { perDayG: number[]; targetG: number | null }
  /** Follower snapshots from ONE primary platform (the server picks it and never
   *  sums platforms), for the brand row's growth projection. */
  social?: { platform: string | null; series: { date: string; count: number }[] }
  /** Net-worth history in canonical CHF + the user's finance currency, for the
   *  finance row's projection (per-month). */
  finance?: { series: { date: string; valueChf: number }[]; currency: string }
  /** Nightly sleep (hours) + recovery score over a ~14-day window (any order),
   *  for the recovery row's honest average + trend. */
  recovery?: { nights: { date: string; sleepH: number | null; recovery: number | null }[] }
  /** Stack adherence over the last 7 days, counting ONLY days the stack provably
   *  existed (the server floors the window at the first-ever tick). */
  supplements?: { daysDefined: number; daysHit: number; stackSize: number }
  /** Today's water vs the user's REAL personalized target (computed server-side
   *  by getWater), the recent daily average, and the user's serving unit. */
  water?: { todayServings: number; recentAvgServings: number | null; targetServings: number; unit: string }
}

/** Strike only on a real, EARNED stall: 3+ weeks with no new best. Pitched higher
 *  than liftStall's 7-day default so the bold call-out stays rare and specific. */
const STALL_OPTS = { minStalledDays: 21 }

/** Honest, human duration for a stall. Never undersells "a month". */
function weeksText(stalledDays: number): string {
  const weeks = Math.max(2, Math.round(stalledDays / 7))
  return weeks >= 5 ? 'over a month' : weeks === 4 ? 'about a month' : `${weeks} weeks`
}

/** A lift's primary muscle(s), from the real exercise DB. Empty for an unknown
 *  or custom id, the brain then simply can't reason about that lift's role. */
function liftPrimary(id: string): string[] {
  return exerciseReferences[id]?.primaryMuscles ?? []
}

/**
 * For a goal lift's primary muscle, the supporting muscles that usually CAP it -
 * standard, low-risk lifting knowledge. A weak/under-trained support is the
 * non-obvious thing holding a progressing main lift back (the "your triceps cap
 * your bench" insight). Keyed by the goal lift's primary muscle.
 */
const CAPS: Record<string, string[]> = {
  chest: ['triceps', 'shoulders'],
  shoulders: ['triceps'],
  quadriceps: ['hamstrings', 'glutes'],
  hamstrings: ['quadriceps', 'glutes'],
  lats: ['biceps'],
  'middle back': ['biceps'],
}

/**
 * THE HIDDEN WEAKNESS. The goal's main lift is progressing, so the hole is
 * elsewhere: a supporting muscle that caps it. Grounded entirely in the user's
 * REAL lifts + the exercise DB, so it can never claim a weakness that isn't
 * there. Priority: a support lift that has STALLED (most specific) beats a
 * support muscle the user never directly trains. null when every support is
 * trained and moving, we invent nothing.
 */
function findCappingWeakness(goalLift: GuideLift, lifts: GuideLift[]): Copy | null {
  const primary = liftPrimary(goalLift.id)[0]
  const caps = primary ? CAPS[primary] : undefined
  if (!caps) return null
  const goalLower = goalLift.name.toLowerCase()

  let missing: string | null = null
  for (const muscle of caps) {
    const supports = lifts.filter((l) => l.id !== goalLift.id && liftPrimary(l.id).includes(muscle))
    if (supports.length === 0) {
      if (!missing) missing = muscle
      continue
    }
    for (const s of supports) {
      const st = liftStall(s.sessions, STALL_OPTS)
      if (st?.isStalled) {
        return {
          why: `Your ${s.name} has not gone up in ${weeksText(st.stalledDays)}, and weak ${muscle} usually hold back a ${goalLower}. Push that lift and this goal moves with it.`,
          key: `weak ${muscle} usually hold back a ${goalLower}`,
        }
      }
    }
  }
  if (missing) {
    return {
      why: `You train no dedicated ${missing} lift, and ${missing} are what carry a ${goalLower} past a plateau. Add one and this goal stops stalling early.`,
      key: `no dedicated ${missing} lift`,
    }
  }
  return null
}

const LB_TO_KG = 0.453592
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Whole-day index for a YYYY-MM-DD key (UTC), differences only. */
function dayIdx(key: string): number | null {
  const t = Date.parse(`${key}T00:00:00Z`)
  return Number.isFinite(t) ? Math.round(t / 86_400_000) : null
}

/** "2026-07-18" -> "July 18". null on a bad key. */
function formatGoalDate(key: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  const month = MONTHS[Number(m[2]) - 1]
  return month ? `${month} ${Number(m[3])}` : null
}

/** Round a converted weight to a clean half-step for copy ("about 2.5 kg"). */
const half = (n: number): number => Math.round(n * 2) / 2

/** A whole count with thousands separators, locale-free so tests + prod agree:
 *  2400 -> "2,400". */
function groupInt(n: number): string {
  const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return n < 0 ? `-${s}` : s
}

/** One decimal, trailing .0 dropped: 124.875 -> "124.9", 2 -> "2". */
function trimDecimal(x: number): string {
  return `${Math.round(x * 10) / 10}`
}

/** A money magnitude in short form: 124875 -> "124.9k", 2500 -> "2.5k",
 *  1_200_000 -> "1.2M", 940 -> "940". Currency is labelled by the caller. */
function fmtMoneyShort(n: number): string {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${trimDecimal(n / 1_000_000)}M`
  if (a >= 1_000) return `${trimDecimal(n / 1_000)}k`
  return `${Math.round(n)}`
}

/** A bare 4-digit number in the plausible-year window reads as a DATE, not a
 *  target ("In 2026 I want 1000 subscribers"). A k/m suffix un-years it. */
function looksLikeYear(n: number, suffix: string | undefined): boolean {
  return !suffix && Number.isInteger(n) && n >= 2024 && n <= 2035
}

/** The target number a count/money goal aims at, parsed from its title:
 *  "Reach 1,000 Subscribers" -> 1000, "save 10k" -> 10000, "200k net worth" ->
 *  200000, "1.2M followers" -> 1200000. First NON-YEAR number wins, so both
 *  "1000 subscribers by 2026" and "In 2026 I want 1000 subscribers" read 1000;
 *  a plausible year (2024-2035, no k/m suffix) only counts when it is the only
 *  number present. null when the goal states no number ("grow my channel"). */
function parseTargetCount(title: string): number | null {
  const matches = [...title.replace(/,/g, '').matchAll(/(\d+(?:\.\d+)?)\s*([km])?/gi)]
  let yearOnly: number | null = null
  for (const m of matches) {
    let n = parseFloat(m[1])
    if (!Number.isFinite(n) || n <= 0) continue
    const suffix = m[2]?.toLowerCase()
    if (looksLikeYear(n, suffix)) {
      if (yearOnly == null) yearOnly = Math.round(n)
      continue
    }
    if (suffix === 'k') n *= 1_000
    else if (suffix === 'm') n *= 1_000_000
    return Math.round(n)
  }
  return yearOnly
}

/** The trailing advice line for each ETA verdict, kept per-domain so a lift, a
 *  follower count and a savings balance each read naturally. Each string is a
 *  full clause (own ending punctuation); the template prepends "so ". */
interface ProjectAdvice {
  before: string
  on: string
  past: string
  weeks: string
}

/**
 * THE PROJECTION (domain-agnostic, the keystone of the full-circle guide). Given
 * a value climbing toward a target at a known weekly rate, say whether you arrive
 * before / on / a little past your target date. The math, the guards (gap > 0,
 * weeks in [1, maxWeeks]) and the ETA narrative live here; the caller pre-formats
 * every number (so weight reads in kg/lb, followers as "2,400", money as
 * "125k CHF") and supplies the domain-flavored advice tails. Returns the caller's
 * pace-only `fallback` when there is no reachable, sane target, never null, so a
 * genuinely climbing metric always beats the canned line. Reused by the lift,
 * brand and finance rows.
 */
function project(p: {
  /** Pre-formatted lead: "<subject> is <verb> about <pace> a <cadence>, now <current>." */
  lead: string
  /** Canonical current value (same unit as `target` + `ratePerWeek`). */
  current: number
  /** Canonical target value; null/<=0 → the pace-only `fallback`. */
  target: number | null
  /** Canonical change per WEEK (always > 0 here), drives the date math. */
  ratePerWeek: number
  targetDate: string | null
  today: string | undefined
  /** Formatted goal value, e.g. "225 lb (102 kg)" / "10,000" / "200k CHF". */
  goalText: string
  /** Formats a magnitude into display text for the remaining gap. */
  fmtGap: (n: number) => string
  advice: ProjectAdvice
  fallback: Copy
  /** Cap on a believable horizon (default ~2 years); finance allows longer. */
  maxWeeks?: number
}): Copy {
  const { lead, current, target, ratePerWeek, targetDate, today, goalText, fmtGap, advice, fallback } = p
  const maxWeeks = p.maxWeeks ?? 104
  if (target != null && target > 0) {
    const gap = target - current
    if (gap > 0) {
      const weeks = gap / ratePerWeek
      if (weeks >= 1 && weeks <= maxWeeks) {
        const key = `about ${fmtGap(gap)} to go`
        const stem = `${lead} Your goal is ${goalText}, ${key}.`

        const dateText = targetDate ? formatGoalDate(targetDate) : null
        const di = targetDate ? dayIdx(targetDate) : null
        const ti = today ? dayIdx(today) : null
        if (dateText && di != null && ti != null && di > ti) {
          const weeksLeft = (di - ti) / 7
          if (weeks <= weeksLeft - 1) {
            return { why: `${stem} At that pace you reach it before your ${dateText} goal, so ${advice.before}`, key }
          }
          if (weeks <= weeksLeft + 1) {
            return { why: `${stem} At that pace you land right on your ${dateText} goal, so ${advice.on}`, key }
          }
          return { why: `${stem} At that pace you arrive a little past your ${dateText} goal, so ${advice.past}`, key }
        }
        const wk = Math.round(weeks)
        return { why: `${stem} That is roughly ${wk} ${wk === 1 ? 'week' : 'weeks'} at this pace, so ${advice.weeks}`, key }
      }
    }
  }
  return fallback
}

const LIFT_ADVICE: ProjectAdvice = {
  before: 'keep the jumps small and do not stall on the way.',
  on: 'hold that pace exactly and do not rush it.',
  past: 'tighten the jumps now to make the date.',
  weeks: 'keep the jumps small and steady.',
}

/**
 * The lift row's projection: the main lift is climbing and there is no support
 * weakness, so the honest, non-obvious insight is the one a deadline goal asks -
 * at this pace, do you hit the number before your target date? Converts the real
 * top-set trend into the user's display unit (kg/lb, a pounds goal shown both
 * ways) and hands it to the generic `project`. null only when the series is too
 * thin to trust.
 */
function projectToGoal(
  lift: GuideLift,
  target: number | null,
  targetDate: string | null,
  today: string | undefined,
  units: Units,
  goalUnit: 'lb' | 'kg',
): Copy | null {
  const series = [...lift.sessions]
    .filter((s) => Number.isFinite(s.topWeight) && s.topWeight > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
  // >= 2 to match the ticker's visible trend; weeklyWeightRate adds its own gates
  // (>= 2 distinct days, non-zero span) so a single noisy point can't project.
  if (series.length < 2) return null
  const rate = weeklyWeightRate(series.map((s) => ({ date: s.date, kg: s.topWeight })))
  if (!rate || rate.kgPerWeek <= 0.1) return null

  const U = unitLabel(units)
  const name = lift.name
  const currentKg = series[series.length - 1].topWeight
  const paceTxt = `${half(kgToDisplay(rate.kgPerWeek, units))} ${U}`
  const currentTxt = `${half(kgToDisplay(currentKg, units))} ${U}`
  const lead = `Your ${name} is climbing about ${paceTxt} a week, now at ${currentTxt}.`

  // Resolve the goal target into kg + a display string. The goal's stated unit is
  // resolved upstream (stored unit > title word > account default), never sniffed
  // here, so "225 bench" whose cleanTitle says "Pound" still reads in pounds. Show
  // the goal in its own unit; add the converted value when it differs from what the
  // user reads in, so "225 lb" also reads "102 kg".
  let targetKg: number | null = null
  let goalText = ''
  if (target != null && target > 0) {
    const goalIsLb = goalUnit === 'lb'
    targetKg = goalIsLb ? target * LB_TO_KG : target
    const goalStated = goalIsLb ? 'lb' : 'kg'
    goalText = goalStated === U
      ? `${target} ${U}`
      : `${target} ${goalStated} (${half(kgToDisplay(targetKg, units))} ${U})`
  }

  return project({
    lead,
    current: currentKg,
    target: targetKg,
    ratePerWeek: rate.kgPerWeek,
    targetDate,
    today,
    goalText,
    fmtGap: (kg) => `${half(kgToDisplay(kg, units))} ${U}`,
    advice: LIFT_ADVICE,
    fallback: {
      why: `${lead} Hold that pace, most lifts stall here from chasing big jumps instead of small steady ones.`,
      key: `climbing about ${paceTxt} a week`,
    },
  })
}

/**
 * The weight unit THIS goal is stated in, the single source of truth, never the
 * account's unless the goal states none. Priority: a stored progress unit (set
 * once at goal creation) wins, then an explicit unit word in the cleanTitle or raw
 * title, then the account's display unit. So a "225-Pound Bench" goal always reads
 * in pounds even on a kg account, and an unlabeled "225 bench" reads in the user's
 * own unit instead of silently defaulting to kg. Alex's rule: measure in one thing
 * only, never switch.
 */
function resolveLiftUnit(
  goal: { title: string; cleanTitle: string | null; progressUnit?: string | null },
  units: Units,
): 'lb' | 'kg' {
  for (const u of [normalizeGoalUnit(goal.progressUnit ?? null), detectGoalUnit(goal.cleanTitle, goal.title)]) {
    if (u === 'lb' || u === 'kg') return u
  }
  return units === 'imperial' ? 'lb' : 'kg'
}

/**
 * The train-goal brain: find the specific HOLE in this user's training and return
 * a bold, FILLING, golden-URL-style override for the generic line. null = nothing
 * worth striking on, so the user keeps the normal adaptive copy. Voice is DIRECT
 * and actionable, no em dashes; `key` is a verbatim substring (the demo trigger).
 * `goalUnit` is the goal's own weight unit (resolved upstream), so the projection
 * speaks pounds or kg as the goal stated, not as the account defaults.
 */
function liftBrain(title: string, targetDate: string | null, lifts: GuideLift[], today: string | undefined, units: Units, goalUnit: 'lb' | 'kg'): Copy | null {
  if (lifts.length === 0) return null

  const match = matchGoalToLift(title, lifts.map((l) => ({ id: l.id, name: l.name })))
  if (match) {
    // The goal is about ONE lift. First: is THAT lift the hole (a real stall)?
    const lift = lifts.find((l) => l.id === match.liftId)
    if (lift) {
      const stall = liftStall(lift.sessions, STALL_OPTS)
      if (stall?.isStalled) {
        return {
          why: `Your ${lift.name} has not moved in ${weeksText(stall.stalledDays)}. Showing up is not the same as progressing. Add one rep or a small jump next session and this goal starts moving again.`,
          key: 'Add one rep or a small jump next session',
        }
      }
      // The main lift is fine, find the hidden weakness capping it, else project
      // its climb to the goal date.
      const weakness = findCappingWeakness(lift, lifts)
      if (weakness) return weakness
      const projection = projectToGoal(lift, match.targetWeight, targetDate, today, units, goalUnit)
      if (projection) return projection
    }
    return null
  }

  // A general strength goal, strike when MOST of the trained lifts have gone flat.
  const stalled = lifts
    .map((l) => liftStall(l.sessions, STALL_OPTS))
    .filter((s): s is NonNullable<typeof s> => s != null && s.isStalled)
  if (stalled.length >= 2 && stalled.length * 2 >= lifts.length) {
    const longest = Math.max(...stalled.map((s) => s.stalledDays))
    return {
      why: `You have stalled on most of your lifts for ${weeksText(longest)}. Lifting the same weight will not move this goal. Push a little harder every session, one more rep or a small jump in weight.`,
      key: 'Push a little harder every session',
    }
  }
  return null
}

/**
 * The weight-row brain: read the real weigh-in trend against the user's
 * body-comp direction and say what it means. Direction-aware (a cut wants the
 * scale down, a bulk up, a recomp flat), unit-labelled, never shaming. null when
 * there is not enough history to judge, so the canned line stays.
 */
function weightBrain(
  weighIns: { date: string; kg: number }[],
  direction: 'lose' | 'gain' | 'maintain' | null,
  units: Units,
): Copy | null {
  const rate = weeklyWeightRate(weighIns)
  if (!rate) return null
  const U = unitLabel(units)
  const r = rate.kgPerWeek
  const mag = `${half(kgToDisplay(Math.abs(r), units))} ${U}`
  const flat = Math.abs(r) < 0.1

  if (direction === 'lose') {
    if (r <= -0.1) {
      return { why: `You are down about ${mag} a week, a clean and steady cut. Hold this pace and you keep your strength while the fat comes off.`, key: `down about ${mag} a week` }
    }
    if (r >= 0.1) {
      return { why: `The scale has crept up about ${mag} a week, the opposite way for a cut. Trim a little off your daily intake and it turns back down.`, key: `crept up about ${mag} a week` }
    }
    return { why: 'Your weight has held flat the last few weeks, so the cut has stalled. Trim a little off your daily intake and the scale starts moving again.', key: 'the cut has stalled' }
  }
  if (direction === 'gain') {
    if (r >= 0.1) {
      return { why: `You are up about ${mag} a week, a lean gaining pace. Keep it slow and steady so most of what you add is muscle, not fat.`, key: `up about ${mag} a week` }
    }
    if (r <= -0.1) {
      return { why: `The scale has slipped about ${mag} a week, the opposite way for a gain. Add a little to each day and it turns back up.`, key: `slipped about ${mag} a week` }
    }
    return { why: 'Your weight has held flat, so you are not actually in a surplus yet. Add a little to each day and the gain starts.', key: 'not actually in a surplus yet' }
  }
  // maintain / recomp / unknown
  if (flat) {
    return { why: 'Your weight is holding steady, which is right for a recomp. Judge this by your lifts and the mirror, not the daily scale.', key: 'holding steady' }
  }
  return { why: `Your weight is drifting about ${mag} a week. For a recomp, rein it back toward steady so your lifts can do the shaping.`, key: `drifting about ${mag} a week` }
}

/**
 * The protein-row brain: read recent daily protein against the target and say
 * what is actually leaking. Grams are unit-free, so no conversion. Encouraging,
 * never shaming. null when nothing logged, so the canned line stays.
 */
function proteinBrain(perDayG: number[], targetG: number | null): Copy | null {
  const days = perDayG.filter((g) => Number.isFinite(g) && g > 0)
  if (days.length === 0) return null
  const avg = Math.round(days.reduce((a, b) => a + b, 0) / days.length)

  if (targetG != null && targetG > 0) {
    const target = Math.round(targetG)
    const daysUnder = days.filter((g) => g < targetG * 0.9).length
    if (daysUnder >= 2) {
      return {
        why: `You average ${avg}g of protein, with ${daysUnder} days under your ${target}g target this week. Those low days are where muscle growth leaks out, so plug them first.`,
        key: `${daysUnder} days under your ${target}g target`,
      }
    }
    // A frequency claim ("almost every day") needs at least a few days of data;
    // with 1-2 logged days, fall through to the grounded daily-average line.
    if (days.length >= 3) {
      return {
        why: `You hit your ${target}g protein almost every day. That daily consistency builds more than any single session, so protect it.`,
        key: `hit your ${target}g protein almost every day`,
      }
    }
  }
  return {
    why: `You average about ${avg}g of protein a day. Set a daily floor and hold it even on your worst days, and the lifts follow.`,
    key: `average about ${avg}g of protein a day`,
  }
}

/**
 * The recovery-row brain: state the real sleep average (only over >=7 nights, a
 * hard floor) and, when the band reports a recovery score, append the honest
 * DIRECTION of its trend (never the raw number, providers' scores are not
 * comparable). A low sleep average gets a gentle nudge, never a scolding. null
 * when fewer than 7 nights of sleep, so the canned line stays.
 */
function recoveryBrain(recovery: { nights: { date: string; sleepH: number | null; recovery: number | null }[] }): Copy | null {
  const sleepNights = recovery.nights.filter((n) => n.sleepH != null && Number.isFinite(n.sleepH) && n.sleepH > 0)
  if (sleepNights.length < 7) return null // hard rule: no average claim under a week of data
  const n = sleepNights.length
  const avg = sleepNights.reduce((a, b) => a + (b.sleepH as number), 0) / n
  const avgTxt = trimDecimal(avg)
  const lead = `You average ${avgTxt} h of sleep across your last ${n} recorded nights`

  // A low average wins the copy outright, the fix is more sleep, not a trend read.
  // Branch on the DISPLAYED number so the copy never shows "7 h" then says "add 30".
  if (Number(avgTxt) < 7) {
    return {
      why: `${lead}. Add 30 minutes a night and your recovery follows it up.`,
      key: `${avgTxt} h of sleep`,
    }
  }

  // Healthy sleep: layer on the recovery-score DIRECTION when it can be trusted.
  const recSeries = recovery.nights
    .filter((nn) => nn.recovery != null && Number.isFinite(nn.recovery))
    .map((nn) => ({ date: nn.date, kg: nn.recovery as number }))
  const rate = weeklyWeightRate(recSeries)
  const trend = rate == null ? null : rate.kgPerWeek >= 1 ? 'up' : rate.kgPerWeek <= -1 ? 'down' : 'steady'

  if (trend === 'up') {
    return { why: `${lead}, and your recovery is trending up. Hold this and your training keeps absorbing.`, key: 'recovery is trending up' }
  }
  if (trend === 'down') {
    return { why: `${lead}, and your recovery has dipped a little. Protect your bedtime this week and it climbs back.`, key: 'recovery has dipped a little' }
  }
  if (trend === 'steady') {
    return { why: `${lead}, and your recovery has been steady. That consistency is what lets you push hard.`, key: 'recovery has been steady' }
  }
  return { why: `${lead}, a solid base. Keep it steady and your training keeps absorbing.`, key: `${avgTxt} h of sleep` }
}

/**
 * The supplements ADHERENCE math (pure, so it is unit-tested). From the raw
 * supplements_state blob + a trailing window of day-keys + today's key, it returns
 * the gradeable run. Two invariants keep it from ever lying:
 *  - the window is floored at the first day a CURRENT stack item was ticked (so a
 *    brand-new user is never punished for pre-stack days, and deleted-item history
 *    can never inflate the count), and
 *  - "today" is never graded as a MISS before it is over: an unticked current day
 *    is excluded (only past days, or today-if-already-ticked, count). This is
 *    timezone- and 6am-boundary-safe, so an early-morning first tick reads 1/1,
 *    never a phantom "1 of 2".
 * null when there is no real, gradeable run (empty stack / no current-item ticks).
 */
export function supplementAdherence(
  blob: { items?: { id?: string }[]; taken?: Record<string, Record<string, number>> } | null,
  windowKeys: string[],
  todayKey: string,
): { daysDefined: number; daysHit: number; stackSize: number } | null {
  if (!blob) return null
  const itemIds = new Set(
    (Array.isArray(blob.items) ? blob.items : []).map((i) => String(i?.id)).filter((id) => id && id !== 'undefined'),
  )
  if (itemIds.size === 0) return null
  const taken = (blob.taken && typeof blob.taken === 'object' ? blob.taken : {}) as Record<string, Record<string, number>>
  const tookCurrent = (k: string): boolean => {
    const day = taken[k]
    return !!day && typeof day === 'object' && Object.keys(day).some((id) => itemIds.has(id))
  }
  // Floor at the first day a CURRENT item was ticked, symmetric with daysHit.
  const stackStart = Object.keys(taken).filter(tookCurrent).sort()[0] ?? null
  if (!stackStart) return null

  let daysDefined = 0
  let daysHit = 0
  for (const k of windowKeys) {
    if (k < stackStart) continue
    const hit = tookCurrent(k)
    // Only grade a day that is over (in the past) or was actually acted on; never
    // count today as a missed day before it has ended.
    if (k < todayKey || hit) {
      daysDefined++
      if (hit) daysHit++
    }
  }
  return daysDefined >= 1 ? { daysDefined, daysHit, stackSize: itemIds.size } : null
}

/**
 * The supplements-row brain: report real stack adherence over the days the stack
 * provably existed (see supplementAdherence). Warm, never shaming: misses are
 * framed as where the benefit leaks, with a habit anchor. null when there is no
 * gradeable run, so the canned line stays.
 */
function supplementsBrain(s: { daysDefined: number; daysHit: number; stackSize: number }): Copy | null {
  if (s.stackSize <= 0 || s.daysDefined < 1) return null
  const { daysDefined, daysHit, stackSize } = s

  if (daysHit === 0) {
    return {
      why: `Your stack of ${stackSize} is set, but you have not ticked it off yet ${daysDefined === 1 ? 'today' : 'this week'}. Take it once and the habit starts building from there.`,
      key: 'not ticked it off yet',
    }
  }
  if (daysHit >= daysDefined) {
    return daysDefined === 1
      ? { why: `Your stack of ${stackSize} is logged for today. Keep it going tomorrow and the streak builds from here.`, key: 'logged for today' }
      : { why: `You have logged your stack every day it has been set up, a perfect run. That daily streak is doing more than any single dose, so protect it.`, key: 'every day it has been set up' }
  }
  const missed = daysDefined - daysHit
  // Strong = missed at most one, or hit at least 70% of the run.
  if (missed === 1 || daysHit / daysDefined >= 0.7) {
    return {
      why: `You took your stack ${daysHit} of the last ${daysDefined} days, real consistency. A supplement only pays off when it stacks up daily, so keep the chain going.`,
      key: `${daysHit} of the last ${daysDefined} days`,
    }
  }
  return {
    why: `You hit your stack ${daysHit} of ${daysDefined} days this week. Those ${missed} missed days are where the benefit quietly leaks out, so tie it to a habit you already have every morning.`,
    key: `${daysHit} of ${daysDefined} days`,
  }
}

/** Pluralize a water serving unit for copy. oz/ml stay as-is; glass -> glasses. */
function unitPlural(unit: string, n: number): string {
  if (unit === 'oz' || unit === 'ml') return unit
  if (n === 1) return unit
  return unit === 'glass' ? 'glasses' : `${unit}s`
}

/**
 * The water-row brain: read the recent daily average against the user's REAL
 * personalized target (computed server-side by getWater from their profile, never
 * a generic "8 glasses") in their own serving unit. Speaks only to today when
 * there is no multi-day history. null when nothing is logged, so the canned line
 * stays.
 */
function waterBrain(w: { todayServings: number; recentAvgServings: number | null; targetServings: number; unit: string }): Copy | null {
  const target = w.targetServings
  if (!Number.isFinite(target) || target < 1) return null
  const units = unitPlural(w.unit, target)
  const avg = w.recentAvgServings

  if (avg != null && avg > 0) {
    const avgTxt = trimDecimal(avg)
    // Compare on the DISPLAYED average so we never print "8 of your 8" then ask to
    // "close that gap" (an average that rounds up to the target is a hit).
    if (Number(avgTxt) >= target) {
      return {
        why: `You hit your ${target} ${units} almost every day. That steady habit protects your training more than any single big chug.`,
        key: `your ${target} ${units} almost every day`,
      }
    }
    const gap = Math.max(1, Math.round(target - avg))
    return {
      why: `You average ${avgTxt} of your ${target} ${units} a day. You drop strength before you feel thirsty, so close that ${gap}-${w.unit} gap.`,
      key: `${avgTxt} of your ${target} ${units} a day`,
    }
  }

  if (w.todayServings > 0) {
    return {
      why: `You logged ${w.todayServings} of your ${target} ${units} so far today. Keep one in sight and sip through the afternoon.`,
      key: `${w.todayServings} of your ${target} ${units} so far today`,
    }
  }
  return null
}

const BRAND_ADVICE: ProjectAdvice = {
  before: 'hold the cadence and do not coast on the way.',
  on: 'keep that exact cadence and stay consistent.',
  past: 'pick the cadence up now to make the date.',
  weeks: 'keep the cadence steady and let it compound.',
}

/** YouTube counts "subscribers"; every other platform "followers". */
function audienceNoun(platform: string | null): string {
  return (platform ?? '').toLowerCase() === 'youtube' ? 'subscribers' : 'followers'
}

/**
 * The brand-row brain: read the real follower trend from the primary platform's
 * snapshots and project it toward the goal's follower count. Reuses the generic
 * `project` (counts only, no unit conversion). Never sums platforms, the server
 * passes one series. null when there are fewer than 2 snapshots or growth is too
 * flat to claim, so the canned line stays.
 */
function brandBrain(
  social: { platform: string | null; series: { date: string; count: number }[] },
  goalTitle: string,
  targetDate: string | null,
  today: string | undefined,
): Copy | null {
  const series = [...social.series]
    .filter((p) => Number.isFinite(p.count) && p.count > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (series.length < 2) return null
  const rate = weeklyWeightRate(series.map((p) => ({ date: p.date, kg: p.count })))
  if (!rate || rate.kgPerWeek <= 0.1) return null
  const perWk = Math.round(rate.kgPerWeek)
  if (perWk < 1) return null // under a follower a week, not enough to claim growth

  const noun = audienceNoun(social.platform)
  const current = series[series.length - 1].count
  const lead = `Your ${noun} grow about ${groupInt(perWk)} a week, now ${groupInt(current)}.`
  const target = parseTargetCount(goalTitle)

  return project({
    lead,
    current,
    target,
    ratePerWeek: rate.kgPerWeek,
    targetDate,
    today,
    goalText: target != null ? groupInt(target) : '',
    fmtGap: (n) => groupInt(n),
    advice: BRAND_ADVICE,
    fallback: {
      why: `${lead} Keep the cadence, audiences compound when you keep showing up.`,
      key: `grow about ${groupInt(perWk)} a week`,
    },
  })
}

const FINANCE_ADVICE: ProjectAdvice = {
  before: 'keep stacking and do not let it slip.',
  on: 'hold that exact pace and keep stacking.',
  past: 'add a little more each month to make the date.',
  weeks: 'keep adding steadily and let it compound.',
}

/** Weeks per month (avg), for converting a per-week rate into a monthly headline. */
const WEEKS_PER_MONTH = 365.25 / 12 / 7

/**
 * The finance-row brain: read the real net-worth trend and project it toward the
 * goal's money target. Reuses the generic `project`. Net worth is stored
 * canonically in CHF and there is no server-side FX here, so we personalize only
 * for CHF users (then the title's typed target shares the series' unit); non-CHF
 * users keep the canned line. The headline reads per-MONTH (money moves slower
 * than a barbell), and net-worth goals run multi-year, so the horizon cap is
 * wider. null when fewer than 2 points or growth is too flat to claim.
 */
/** Revenue-shaped money goals (MRR / ARR / revenue): the target is a business
 *  income number, NOT a net-worth number, so projecting the user's net-worth
 *  series toward it would be a false claim. Those keep the canned finance line. */
const REVENUE_GOAL_RE = /\b(mrr|arr|revenue)\b/i

function financeBrain(
  finance: { series: { date: string; valueChf: number }[]; currency: string },
  goalTitle: string,
  targetDate: string | null,
  today: string | undefined,
): Copy | null {
  if (REVENUE_GOAL_RE.test(goalTitle)) return null
  if (finance.currency !== 'CHF') return null
  const series = [...finance.series]
    .filter((p) => Number.isFinite(p.valueChf) && p.valueChf > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (series.length < 2) return null
  const rate = weeklyWeightRate(series.map((p) => ({ date: p.date, kg: p.valueChf })))
  if (!rate || rate.kgPerWeek <= 0.1) return null
  const perMonth = rate.kgPerWeek * WEEKS_PER_MONTH
  if (Math.round(perMonth) < 1) return null // under a franc a month, not worth a claim

  const current = series[series.length - 1].valueChf
  const lead = `Your net worth grows about ${fmtMoneyShort(perMonth)} CHF a month, now at ${fmtMoneyShort(current)} CHF.`
  const target = parseTargetCount(goalTitle)

  return project({
    lead,
    current,
    target,
    ratePerWeek: rate.kgPerWeek,
    targetDate,
    today,
    goalText: target != null ? `${fmtMoneyShort(target)} CHF` : '',
    fmtGap: (n) => `${fmtMoneyShort(n)} CHF`,
    advice: FINANCE_ADVICE,
    maxWeeks: 260, // net-worth goals run multi-year
    fallback: {
      why: `${lead} Keep adding steadily, net worth compounds when you keep feeding it.`,
      key: `grows about ${fmtMoneyShort(perMonth)} CHF a month`,
    },
  })
}

export function buildGoalGuide(
  goal: { title: string; cleanTitle: string | null; category: string | null; targetDate?: string | null; progressUnit?: string | null },
  active: GuideModule[] | Set<GuideModule>,
  signals?: GuideSignals,
  max = 3,
): GuideItem[] {
  const title = goal.cleanTitle || goal.title || ''
  const activeSet = active instanceof Set ? active : new Set(active)

  // Injury / rehab fitness goals take the gentle route BEFORE any theme rule:
  // one recovery item, fixed gentle copy, and the brains never override it
  // (a stall strike or a "push hard" read has no place in a comeback).
  if (isInjuryGoal(title, goal.category) || isInjuryGoal(goal.title || '', goal.category)) {
    const f = FEATURES.recovery
    return [{
      module: 'recovery', label: f.label,
      why: INJURY_COPY.why, key: INJURY_COPY.key,
      href: f.href, using: activeSet.has('recovery'), preview: f.preview,
    }]
  }

  // EVERY goal has a lightbulb (TRAIN 4): a themeless goal (career / craft /
  // mind / people / general, plus the vice + scale-muted health families) gets
  // the honest notes lever instead of silence. One real, linked action for any
  // string a human can type, and never the scale on a goal the scale cannot read.
  const match = themeMatch(title, goal.category)
  const modules: GuideModule[] = match.modules.length > 0 ? match.modules : ['notes']

  return modules
    .slice(0, max)
    .map((m) => {
      const f = FEATURES[m]
      const using = activeSet.has(m)
      // A theme can override a module's generic copy (cardio's train lever must
      // never talk in reps and plates).
      const ruleCopy = match.rule?.copy?.[m]
      let copy = ruleCopy ? (using ? ruleCopy.active : ruleCopy.fresh) : (using ? f.active : f.fresh)
      // The brain upgrades a row to a specific personal call-out from real data.
      // Train: a stall, a capping weakness, or a goal-date projection (the raw
      // title, not cleanTitle, carries the target number). Weight: the weigh-in
      // trend read against the goal's body-comp direction.
      if (m === 'train' && signals?.lifts?.length) {
        const liftUnit = resolveLiftUnit(goal, signals.units ?? 'metric')
        const personal = liftBrain(goal.title || title, goal.targetDate ?? null, signals.lifts, signals.today, signals.units ?? 'metric', liftUnit)
        if (personal) copy = personal
      } else if (m === 'weight' && signals?.weighIns?.length) {
        // THE shared inferrer (lib/goals/direction.ts): the same call the ticker's
        // weight badge makes, so this sentence and that badge can never disagree.
        const personal = weightBrain(signals.weighIns, inferBodyDirection(title, signals.weightDirection ?? null), signals.units ?? 'metric')
        if (personal) copy = personal
      } else if (m === 'macros' && signals?.protein?.perDayG?.length) {
        const personal = proteinBrain(signals.protein.perDayG, signals.protein.targetG)
        if (personal) copy = personal
      } else if (m === 'brand' && signals?.social?.series?.length) {
        const personal = brandBrain(signals.social, goal.title || title, goal.targetDate ?? null, signals.today)
        if (personal) copy = personal
      } else if (m === 'finance' && signals?.finance?.series?.length) {
        const personal = financeBrain(signals.finance, goal.title || title, goal.targetDate ?? null, signals.today)
        if (personal) copy = personal
      } else if (m === 'recovery' && signals?.recovery?.nights?.length) {
        const personal = recoveryBrain(signals.recovery)
        if (personal) copy = personal
      } else if (m === 'supplements' && signals?.supplements) {
        const personal = supplementsBrain(signals.supplements)
        if (personal) copy = personal
      } else if (m === 'water' && signals?.water) {
        const personal = waterBrain(signals.water)
        if (personal) copy = personal
      }
      return { module: m, label: ruleCopy?.label ?? f.label, why: copy.why, key: copy.key, href: f.href, using, preview: f.preview }
    })
}

/**
 * The projection LEAD clause for a goal, lifted from its already-built guide row
 * IF the brain fired (the copy is no longer the canned fresh/active line). Lets
 * the §01 headline + the ticker honestRead reuse the exact grounded projection
 * the dropdown shows, so the biggest text on the surface stops reading generic.
 * Returns only the first sentence (never the "so {advice}" action tail). null
 * when the row is absent or stayed canned, so the caller keeps its warm default.
 */
/**
 * The FULL grounded `why` of a module's guide row IF its brain fired (the copy
 * differs from both canned fresh/active variants); null when canned or absent.
 * Lets a goal with no ticker series show the real data read as its panel
 * paragraph instead of a feed-me ask for data the lever below is already
 * reading (the warm-case honesty fix). Unlike guideProjectionLead this keeps
 * cautionary reads too: the panel label is neutral, so an honest "the scale has
 * crept up" belongs here.
 */
/** Every per-rule copy override's why (fresh + active), so the canned check
 *  below stays exhaustive as themes grow their own voices. */
const RULE_COPY_WHYS = new Set<string>()
for (const r of THEME_RULES) {
  for (const c of Object.values(r.copy ?? {})) {
    if (c) { RULE_COPY_WHYS.add(c.fresh.why); RULE_COPY_WHYS.add(c.active.why) }
  }
}

/** True when a row's copy is one of the CANNED variants (fresh / active / the
 *  gentle injury line / a theme's own copy), i.e. no brain read real data. */
function isCannedWhy(why: string, module: GuideModule): boolean {
  const f = FEATURES[module]
  return why === f.fresh.why || why === f.active.why || why === INJURY_COPY.why || RULE_COPY_WHYS.has(why)
}

export function guideGroundedWhy(items: GuideItem[] | undefined, module: GuideModule): string | null {
  if (!items) return null
  const item = items.find((i) => i.module === module)
  if (!item) return null
  return isCannedWhy(item.why, module) ? null : item.why
}

/**
 * THE STRONGEST BINDING (TRAIN 4): for a goal, name the ONE metric Vitality can
 * draw best, preferring a module the user already feeds (their data is the
 * strongest signal), else the guide's top-ranked module (the highest-value
 * thing to START logging). Pure and deterministic: it reuses buildGoalGuide's
 * ordering (injury route, theme rules, scale-mute, the notes floor), so the
 * named binding can never disagree with the lightbulb, and it always returns -
 * no goal is ever bindingless.
 *
 * `feedLine` is the empty-graph-slot line ("for this graph to work, start
 * logging your weight"), metric-specific per the recipe.
 */
export interface StrongestBinding {
  module: GuideModule
  /** Human metric word for the chip / graph slot ("weight", "lifts", "notes"). */
  metric: string
  label: string
  href: string
  /** The one-line ask that fills the empty graph slot. */
  feedLine: string
  /** True when the user already logs this module (present flag was set). */
  active: boolean
}

// The metric word + the "start logging X" object per module now live in THE
// METRIC REGISTRY (TRAIN 5, lib/insights/metricRegistry.ts MODULE_PRIMARY) -
// one source of truth for the chip word, the feed line, and the Room.

/** The empty-graph-slot ask for one module ("for this graph to work, start
 *  logging your weight"), metric-specific per the recipe. */
export function bindingFeedLine(module: GuideModule): string {
  return module === 'notes'
    ? 'for this graph to work, write a note each day. I measure your good days.'
    : `for this graph to work, start logging ${MODULE_PRIMARY[module].start}.`
}

/** The human metric word for a module's binding chip ("steered by: weight"). */
export function bindingMetricWord(module: GuideModule): string {
  return MODULE_PRIMARY[module].metric
}

export function strongestBinding(
  goal: { title: string; cleanTitle: string | null; category: string | null },
  /** Which modules the user has real data in (loadNoticed's activeModules). */
  present: GuideModule[] | Set<GuideModule>,
): StrongestBinding {
  const presentSet = present instanceof Set ? present : new Set(present)
  const items = buildGoalGuide(goal, presentSet)
  const modules = items.map((i) => i.module)
  // Prefer a module the user already feeds; else the top-ranked module.
  const module = modules.find((m) => presentSet.has(m)) ?? modules[0] ?? 'notes'
  const words = MODULE_PRIMARY[module]
  const f = FEATURES[module]
  return { module, metric: words.metric, label: f.label, href: f.href, feedLine: bindingFeedLine(module), active: presentSet.has(module) }
}

/**
 * "What steers this" picker: the sensible core metrics for a goal's category.
 * Deterministic, no guessing: body-shaped categories get the body metrics,
 * money gets net worth, audience gets followers, and every category can always
 * fall back to notes (the honest floor lever). The picker appends the user's
 * OWN tile streams and "let Vee decide" after these.
 */
export function coreBindingOptions(category: string | null): GuideModule[] {
  // TRAIN 5: the option list is sourced from THE METRIC REGISTRY, so the
  // picker, strongestBinding's words, and the Room can never disagree.
  return bindingOptionsForCategory(category)
}

export function guideProjectionLead(items: GuideItem[] | undefined, module: GuideModule): string | null {
  if (!items) return null
  const item = items.find((i) => i.module === module)
  if (!item) return null
  // The brain fired only if the copy differs from every canned variant.
  if (isCannedWhy(item.why, module)) return null
  const lead = item.why.split('. ')[0]
  if (!lead) return null
  // This lead is only ever spliced onto a CELEBRATORY on-track line, so never lift
  // a stall / flat / wrong-direction read (the dropdown still shows it in full).
  // The ticker's "on-track" (raw delta) and a brain's stall (e1RM / rate) can
  // disagree; this guard keeps the headline from ever contradicting its badge.
  if (/has not (moved|gone up)|has been flat|held flat|has stalled|stalled on most|not actually in a surplus|crept up|slipped about|no dedicated/i.test(lead)) {
    return null
  }
  return `${lead}.`
}

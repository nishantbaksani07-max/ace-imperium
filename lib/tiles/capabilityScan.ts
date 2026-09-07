/**
 * capabilityScan - the honesty gate in front of the free tile builder.
 *
 * The deterministic engine builds SEVEN tracker verbs from taps (intake, count,
 * duration, rating, measure, money, done). It has no data source but the user.
 * When a sentence clearly asks for something beyond that - live platform
 * numbers, AI, anything that must fetch - building a manual lookalike reads as
 * a dumb fake (Alex: never label it limitless; scan first, and when we cannot
 * truly build it, Vee hands off to the Vitality MCP in Claude Code).
 *
 * CONSERVATIVE by design: only a CLEAR external signal hands off. Anything
 * ambiguous stays buildable - a good manual tracker beats a false refusal.
 * Pure + unit-tested; the builder calls it before every build.
 */

export interface CapabilityVerdict {
  verdict: 'buildable' | 'handoff' | 'module'
  /** Set on handoff: which connector family matched, when one did. */
  provider?: 'youtube' | 'instagram' | 'tiktok' | 'x' | 'twitch' | 'shopify' | 'stripe' | 'spotify'
  /** Set on a module verdict: the Vitality module that already IS this ask. */
  module?: 'train' | 'fuel' | 'water' | 'weight' | 'mentor'
  /** One warm plain-words reason Vee can speak. Set on handoff/module. */
  why?: string
}

/** Platform families: naming one of these is asking for LIVE numbers. */
const PLATFORMS: ReadonlyArray<readonly [NonNullable<CapabilityVerdict['provider']>, RegExp]> = [
  ['youtube', /\byou\s?tube\b|\byt\b|\bsubscribers?\b|\bsubs\b|\bwatch ?time\b/],
  ['instagram', /\binsta(gram)?\b|\big\b(?= )|followers?\b/],
  ['tiktok', /\btik\s?tok\b/],
  ['x', /\btwitter\b|\btweets?\b/],
  ['twitch', /\btwitch\b/],
  ['shopify', /\bshopify\b|\bstore orders\b/],
  ['stripe', /\bstripe\b|\bmrr\b/],
  ['spotify', /\bspotify\b|\bstreams\b|\blisteners\b/],
]

/** More platforms than we have first-party connectors for. Naming ANY of these
 *  is still asking for live numbers off someone else's server, so it hands off
 *  (with no `provider`, since there is no District connector to point at yet).
 *  This is the "match the shape, not just the 8 names" net for the long tail. */
// Unambiguous platform names only. Double-meaning English words are deliberately
// excluded (Meta "threads" collides with sewing; bare "discord" is a mood word) -
// discord is caught below only with a platform metric beside it.
const EXTRA_PLATFORMS_RE =
  /\blinked\s?in\b|\breddit\b|\bgithub\b|\bpatreon\b|\bfacebook\b|\bsnapchat\b|\bpinterest\b|\bmastodon\b|\bsubstack\b|\bonlyfans\b|\betsy\b|\bebay\b|\bgumroad\b|\btumblr\b|\bdiscord (server|members?|online|community|dms?|channel)\b/

/** Unambiguous social-metric nouns: a count that only exists on a platform, no
 *  matter which one. These almost never name a manual tracker, so catching the
 *  word alone is safe. (followers/subscribers are already caught by PLATFORMS.) */
const SOCIAL_METRIC_RE =
  /\bkarma\b|\bpatrons?\b|\bupvotes?\b|\bdownvotes?\b|\bretweets?\b|\breposts?\b|\bimpressions?\b|\bmonthly listeners?\b|\blikes\b/

/** Named wearables / health apps: naming the DEVICE means "sync my data from it",
 *  which a sealed standalone tile cannot do (that is the hosted dashboard's job).
 *  A bare "heart rate" / "sleep" with no device still builds a manual log. */
const WEARABLE_RE =
  /\bfitbit\b|\boura\b|\bwhoop\b|\bgarmin\b|apple ?watch|apple ?health|google ?fit|\bstrava\b|myfitnesspal|cronometer|\bwithings\b|\bpeloton\b/

/** AI asks: a tile that thinks needs a model the free builder does not have. */
const AI_RE = /\b(ai|a\.i\.|gpt|claude|chat ?bot|assistant|mentor that|coach that|talks? to me)\b/

/** Food context: "subs I eat" are sandwiches, not subscribers. */
const FOOD_RE = /\b(eat|ate|eaten|food|meal|sandwich|drink|drank)\b/

/** Fetch-shaped asks: live outside data no tap can produce. Includes market
 *  indices, live prices, and balances (all fetch-only, never a tap you log). */
const LIVE_RE =
  /\b(stock prices?|share prices?|price of|crypto|bitcoin|btc|eth\b|s&?p ?500|nasdaq|dow jones|\bftse\b|gas prices?|fuel prices?|petrol prices?|oil prices?|flight prices?|plane tickets?|hotel prices?|exchange rates?|bank balance|account balance|weather|forecast|news|emails?|inbox|automatic(ally)?|auto[- ]?(sync|track|pull|update)|from my (phone|bank|apple|google)|api\b|real ?time|live data)\b/

/** Rich-APP asks the quick-tile engine must never flatten into a dumb tally.
 *  When the ask names a whole application (a logger, a journal, a planner) and a
 *  Vitality module already IS that application, Vee points at the real thing -
 *  the failure becomes a wow. Order matters: specific domains before the bare
 *  journal/diary rule so "food diary" lands on Fuel, not Mentor. Bare
 *  journal/diary needs an article/possessive ("a journal", "my diary") so the
 *  VERB use ("did i journal today") stays a buildable habit. */
const MODULE_RULES: ReadonlyArray<readonly [NonNullable<CapabilityVerdict['module']>, RegExp, string]> = [
  [
    'train',
    /\b(workout|gym|lift(ing)?|exercise|training|strength)s?[- ]?(logger|log\b|journal|diary|planner|app)\b/,
    'that is a whole workout logger, not a quick tile - and your dashboard already ships with a pro one',
  ],
  [
    'fuel',
    /\b(meal|food|nutrition|diet|eating)s?[- ]?(logger|log\b|journal|diary|planner|app)\b|\bmacros?\b/,
    'that is a full food tracker, not a quick tile - and your dashboard already ships with one',
  ],
  [
    'water',
    /\bwater[- ]?(logger|log\b|journal|app)\b/,
    'that is a whole hydration module - and your dashboard already ships with one',
  ],
  [
    'weight',
    /\b(weight|weigh[- ]?in)s?[- ]?(logger|log\b|journal|diary|app)\b/,
    'that is a full weight tracker with photos and trends - and your dashboard already ships with one',
  ],
  [
    'mentor',
    /\b(a|my|the)\s+(journal|diary)\b|\b(journal|diary)\s+(for|of)\b/,
    'that is a place to write, not a tally - and your dashboard already ships with one',
  ],
]

/** App-shaped asks with NO module to point at (a bespoke logger/planner/etc.):
 *  more than the six quick shapes can honestly hold, so they go to Claude.
 *  `log\b` is NOT here - "log my weight" is a tap, "sleep logger" is an app. */
const RICH_APP_RE = /\b(logger|planner|notebook|an app\b|full app|multi[- ]?(metric|section)|all[- ]?in[- ]?one)\b/

export function scanCapability(ask: string): CapabilityVerdict {
  const s = ` ${ask.trim().toLowerCase()} `
  if (!s.trim()) return { verdict: 'buildable' }

  const foodContext = FOOD_RE.test(s)
  for (const [provider, re] of PLATFORMS) {
    // "subs I eat" / "streams" in a food line are not platform asks.
    if (foodContext && (provider === 'youtube' || provider === 'spotify')) continue
    if (re.test(s)) {
      return {
        verdict: 'handoff',
        provider,
        why: 'that one needs a live connection - real numbers I would have to fetch, not taps I can count',
      }
    }
  }
  // Off-list platforms + unambiguous social metrics: still a live-numbers ask,
  // just one with no first-party connector to name. Food context still disarms
  // (so "likes I eat" is nonsense we ignore, not a social handoff).
  if (EXTRA_PLATFORMS_RE.test(s) || (!foodContext && SOCIAL_METRIC_RE.test(s))) {
    return {
      verdict: 'handoff',
      why: 'that one needs a live connection - real numbers I would have to fetch, not taps I can count',
    }
  }
  // Naming a wearable/health app means "sync it", which a sealed tile cannot do.
  if (WEARABLE_RE.test(s)) {
    return {
      verdict: 'handoff',
      why: 'that one syncs from a device - the free builder counts what YOU log, it cannot pull from a band',
    }
  }
  if (AI_RE.test(s)) {
    return {
      verdict: 'handoff',
      why: 'that one needs a mind of its own - the free builder makes trackers, not thinkers',
    }
  }
  if (LIVE_RE.test(s)) {
    return {
      verdict: 'handoff',
      why: 'that one needs live outside data - the free builder counts what YOU log',
    }
  }
  // Rich-APP asks: a whole application, not a tally. Point at the module that
  // already IS the ask when we have one; otherwise it is a Claude-sized build.
  for (const [module, re, why] of MODULE_RULES) {
    if (re.test(s)) return { verdict: 'module', module, why }
  }
  if (RICH_APP_RE.test(s)) {
    return {
      verdict: 'handoff',
      why: 'that is a whole app, not a quick tile - more screens and smarts than six simple shapes can hold',
    }
  }
  return { verdict: 'buildable' }
}

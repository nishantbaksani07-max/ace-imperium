/**
 * refineParse - turn a plain-English "tell it more" line into a structured patch
 * the builder re-requests with. Deterministic, no LLM: this is the free path.
 *
 * It only ever emits the knobs the deterministic builder can honestly honor -
 * rename, set the goal number, change the unit, flip the goal direction, recolor
 * the accent. Anything it cannot map returns a gentle warn so the user is never
 * left wondering whether their words did nothing. It NEVER claims a change it
 * did not put in the patch: every `did` line corresponds 1:1 to a patch field.
 *
 * THE UNIT BRAIN: a unit change WITHIN a measurement family (glasses -> oz,
 * km -> miles, kg -> lb) CONVERTS the goal through the family's base unit and
 * rounds it to a human-friendly number, so "measure it in ounces" turns an
 * 11-glass goal into 88 oz instead of a wrong "11 oz" relabel. Cross-family or
 * unknown targets (glasses -> km, anything -> steps) never convert; the reply
 * says the unit label changed only. An explicit number in the same line always
 * wins over conversion, and a repeated same-unit ask never re-converts.
 *
 * The builder accumulates each patch into its override state and re-infers from
 * the ORIGINAL prompt + the merged overrides, so refinements compose (set the
 * goal, then change the unit, then rename) without re-parsing earlier ones.
 */
import type { TileAccent } from './tileRecolor'
import type { ReportKind } from './types'

export interface RefineState {
  name?: string
  target?: number
  unit?: string
  goalDirection?: 'up' | 'down'
  accent?: TileAccent
}

/**
 * What the caller already knows about the tile, so relative asks ("raise the
 * goal") and kind-aware guards ("done" tiles have no number goal) can resolve
 * deterministically. A plain RefineState still works - kind is optional.
 */
export interface RefineContext extends RefineState {
  kind?: ReportKind
}

export interface RefinePatch {
  patch: RefineState
  /** Short human confirmations, e.g. ['goal set to 10', 'now tracking in km']. */
  did: string[]
  /** Set when nothing could be applied - a nudge, not an error. */
  warn?: string
}

const UNIT_CANON: Record<string, string> = {
  // distance
  mile: 'mi', miles: 'mi', mi: 'mi',
  km: 'km', kilometer: 'km', kilometers: 'km', kilometre: 'km', kilometres: 'km',
  meter: 'm', meters: 'm', metre: 'm', metres: 'm',
  // time
  min: 'min', mins: 'min', minute: 'min', minutes: 'min',
  hour: 'hours', hours: 'hours', hr: 'hours', hrs: 'hours',
  sec: 'sec', secs: 'sec', second: 'sec', seconds: 'sec',
  days: 'days',
  // volume
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  l: 'L', liter: 'L', liters: 'L', litre: 'L', litres: 'L',
  glass: 'glasses', glasses: 'glasses', cup: 'cups', cups: 'cups',
  bottle: 'bottles', bottles: 'bottles',
  // mass
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  g: 'g', gram: 'g', grams: 'g',
  mg: 'mg', milligram: 'mg', milligrams: 'mg',
  // money
  dollar: '$', dollars: '$', bucks: '$', usd: '$',
  // countables
  rep: 'reps', reps: 'reps', sets: 'sets',
  page: 'pages', pages: 'pages',
  step: 'steps', steps: 'steps',
  cal: 'cal', calorie: 'cal', calories: 'cal', kcal: 'cal',
  serving: 'servings', servings: 'servings',
  drink: 'drinks', drinks: 'drinks',
}

/* ------------------------------------------------------------ the unit brain */

// Measurement families with a fixed size, keyed by CANON unit. Conversions run
// through the family base (volume ml, distance m, mass g, time min). Steps,
// money, and countables (reps, pages, cal, servings, drinks) are deliberately
// absent: they have no fixed physical size, so a change to or from them is a
// label change only, never a number change.
const OZ_ML = 29.5735
type UnitFamily = 'volume' | 'distance' | 'mass' | 'time'
const UNIT_FAMILIES: Record<string, { family: UnitFamily; toBase: number }> = {
  // volume, base ml
  glasses: { family: 'volume', toBase: 8 * OZ_ML }, // a glass of water is 8 oz
  bottles: { family: 'volume', toBase: 500 },
  cups: { family: 'volume', toBase: 240 },
  oz: { family: 'volume', toBase: OZ_ML },
  ml: { family: 'volume', toBase: 1 },
  L: { family: 'volume', toBase: 1000 },
  // distance, base m (steps stay unconvertible on purpose)
  km: { family: 'distance', toBase: 1000 },
  mi: { family: 'distance', toBase: 1609.344 },
  m: { family: 'distance', toBase: 1 },
  // mass, base g
  kg: { family: 'mass', toBase: 1000 },
  lb: { family: 'mass', toBase: 453.592 },
  g: { family: 'mass', toBase: 1 },
  mg: { family: 'mass', toBase: 0.001 },
  // time, base min
  min: { family: 'time', toBase: 1 },
  hours: { family: 'time', toBase: 60 },
}

/** Canonicalize any unit spelling ("glass", "ounces", "L") to its canon token. */
function canonUnit(u: string): string {
  const key = u.trim().toLowerCase()
  return UNIT_CANON[key] ?? u.trim()
}

/**
 * Convert an amount between two units of the SAME measurement family, through
 * the family's base unit. Returns null when either unit is unknown or the
 * families differ (glasses -> km): no conversion, label change only.
 */
export function convertAmount(value: number, fromUnit: string, toUnit: string): number | null {
  const from = UNIT_FAMILIES[canonUnit(fromUnit)]
  const to = UNIT_FAMILIES[canonUnit(toUnit)]
  if (!from || !to || from.family !== to.family) return null
  return (value * from.toBase) / to.toBase
}

/**
 * Round a converted amount the way a human would set a goal. An exact
 * conversion (within a hair of a whole number, like 11 glasses -> 88 oz or
 * 80 kg -> 80000 g) keeps its exact number; anything inexact snaps to a
 * friendly grid: nearest 0.5 under 5, 1 under 20, 5 under 200, 50 under 2000,
 * 100 under 20000, 500 beyond. So 92.98 becomes 95 and 2.6 becomes 2.5.
 */
export function friendlyRound(n: number): number {
  const nearInt = Math.round(n)
  if (nearInt > 0 && Math.abs(n - nearInt) < 0.005) return nearInt
  const step = n < 5 ? 0.5 : n < 20 ? 1 : n < 200 ? 5 : n < 2000 ? 50 : n < 20000 ? 100 : 500
  const snapped = round1(Math.round(n / step) * step)
  return snapped > 0 ? snapped : round1(n)
}

// One alternation built from the canon keys, longest first so 'kilometers' can
// never be half-eaten by a shorter sibling at the same position.
const UNIT_WORDS = Object.keys(UNIT_CANON)
  .sort((a, b) => b.length - a.length)
  .join('|')
const UNIT_RE = new RegExp(`\\b(${UNIT_WORDS})\\b`)
// The destination unit in a two-unit phrase: the one after to/into/in.
const UNIT_DEST_RE = new RegExp(`\\b(?:to|into|in)\\s+(${UNIT_WORDS})\\b`)

// Accent vocabulary. Checked in order; first family whose word appears wins.
// Gold/amber/red are deliberately absent: amber is the caution color and red is
// banned by the color law, so they are never accents.
const ACCENT_WORDS: ReadonlyArray<readonly [TileAccent, RegExp]> = [
  ['iris', /\b(iris|lavender|periwinkle|indigo)\b/],
  ['violet', /\b(violet|purple|plum)\b/],
  ['azure', /\b(azure|blue|cobalt|sapphire|navy)\b/],
  ['rose', /\b(rose|pink|blush|magenta)\b/],
  ['seafoam', /\b(seafoam|sea foam|teal|aqua|turquoise|cyan)\b/],
  ['mint', /\b(mint|green|emerald|jade)\b/],
]

const BANNED_COLOR_RE = /\b(gold|golden|amber|yellow|red|crimson|scarlet|orange)\b/

// "raise the goal" / "lower the cap" style relative asks. These verbs are
// consumed here so they never leak into direction detection ("lower the goal"
// is a target ask, not "less is better").
const RAISE_GOAL_RE = /\b(raise|bump(?:\s+up)?|boost|increase|lift|up)\s+(?:the\s+|my\s+|that\s+)?(goal|target|cap|limit)\b/
const LOWER_GOAL_RE = /\b(lower|drop|reduce|cut|decrease|shrink|ease)\s+(?:the\s+|my\s+|that\s+)?(goal|target|cap|limit)\b/

// Explicit "which way is winning" phrasings. Down keeps single words like
// "under" (they read unambiguously); up is phrase-level only, so "up it to 20"
// never falsely claims a direction change.
const DIR_DOWN_RE = new RegExp(
  [
    'keep\\s+(?:it\\s+)?(?:under|below|low|down|lean|minimal)',
    'stay\\s+(?:under|below|low)',
    'under\\s+budget',
    '(?:less|fewer|lower)\\s+is\\s+better',
    'the\\s+less\\s+the\\s+better',
    'less\\s+is\\s+more',
    'aim\\s+(?:for\\s+)?(?:less|lower|fewer)',
    'count(?:ing)?\\s+(?:it\\s+)?down',
    'cut\\s+(?:it\\s+|back\\s+)?down',
    'cut\\s+back',
    '\\bunder\\b',
    '\\bbelow\\b',
    '\\bfewer\\b',
    '\\bless\\b',
    '\\bcap\\b',
    '\\blimit\\b',
    '\\breduce\\b',
    '\\bminimi[sz]e\\b',
  ].join('|'),
)
const DIR_UP_RE = new RegExp(
  [
    'aim\\s+(?:for\\s+)?(?:higher|more|big)',
    'shoot\\s+(?:for\\s+)?(?:higher|more)',
    'go\\s+(?:for\\s+)?(?:higher|more|big)',
    '(?:more|higher|bigger)\\s+is\\s+better',
    'the\\s+more\\s+the\\s+better',
    'count(?:ing)?\\s+(?:it\\s+)?up',
    'push\\s+(?:it\\s+)?(?:up|higher)',
    'climb\\s+(?:it|higher)',
    '\\babove\\b',
    'more\\s+the\\s+merrier',
  ].join('|'),
)

function titleCase(raw: string): string {
  return raw
    .replace(/["'.]+$/g, '')
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .slice(0, 24)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** A deterministic nudge for "raise/lower the goal" with no number: 10 percent,
 *  never less than a whole step, never below 1. */
function nudged(target: number, dir: 'up' | 'down'): number {
  const step = Math.max(1, Math.abs(target) * 0.1)
  const next = dir === 'up' ? target + step : target - step
  const rounded = target >= 10 ? Math.round(next) : round1(next)
  return Math.max(1, rounded)
}

export function parseRefine(text: string, current: RefineContext = {}): RefinePatch {
  const t = text.trim()
  if (!t) return { patch: {}, did: [], warn: 'type a change, like "make the goal 10" or "track in km".' }
  const lower = t.toLowerCase()
  const patch: RefineState = {}
  const did: string[] = []
  // Notes for a helpful warn when a specific ask could not land.
  const misses: string[] = []

  // rename: "call it Morning Water" / "name it Focus" / "rename to Pages" /
  // "lets call it Deep Work" / "title it Runs" - captured first and EXCLUSIVE,
  // so a unit or number inside the new name is never mistaken for a unit/goal
  // change. Matched on the ORIGINAL text (case-insensitive) so the captured
  // name keeps its casing and we never rely on toLowerCase() preserving length
  // (some chars expand when lowercased).
  const nameM = t.match(
    /\b(?:re[- ]?name(?:\s+it)?(?:\s+to)?|call(?:\s+it)?|name(?:\s+it)?(?:\s+to)?|title(?:\s+it)?|label(?:\s+it)?)\s+["']?(.+)/i,
  )
  if (nameM) {
    const name = titleCase(nameM[1])
    if (name) {
      patch.name = name
      did.push(`renamed to "${name}"`)
    }
  }

  if (!nameM) {
    // accent - "in iris", "make it azure", "dress it in rose", "go mint"
    for (const [id, re] of ACCENT_WORDS) {
      if (re.test(lower)) {
        patch.accent = id
        did.push(`accent set to ${id}`)
        break
      }
    }
    if (!patch.accent && BANNED_COLOR_RE.test(lower)) {
      misses.push('gold, amber, and red are reserved for caution. try mint, iris, azure, violet, rose, or seafoam')
    }

    // unit - "track it in ounces", "count it in grams", "log it in dollars".
    // The did line for it is written AFTER the goal block below, because a
    // same-family unit change converts the goal and the reply must state
    // exactly what happened to the numbers.
    // "switch from glasses to ounces" names TWO units; the destination is the
    // one after to/into/in, so prefer that match before the first-word fallback
    // (which alone grabbed "glasses" and switched the wrong way, verify MED-2).
    const unitDestM = lower.match(UNIT_DEST_RE)
    const unitM = unitDestM ?? lower.match(UNIT_RE)
    const newUnit = unitM ? UNIT_CANON[unitM[1]] ?? unitM[1] : undefined
    if (newUnit) patch.unit = newUnit

    // relative goal asks - "raise the goal", "lower the cap". Consumed before
    // direction so their verbs never read as "less is better". If a number is
    // also present the absolute set below wins.
    const raiseM = lower.match(RAISE_GOAL_RE)
    const lowerM = lower.match(LOWER_GOAL_RE)
    // Strip the consumed phrase so its verb cannot double as a direction word.
    let dirText = lower
    if (raiseM) dirText = dirText.replace(RAISE_GOAL_RE, ' ')
    if (lowerM) dirText = dirText.replace(LOWER_GOAL_RE, ' ')

    // goal direction - explicit phrasings only, so we never claim a flip the
    // user did not ask for.
    if (DIR_DOWN_RE.test(dirText)) {
      patch.goalDirection = 'down'
      did.push('aiming to keep it down')
    } else if (DIR_UP_RE.test(dirText)) {
      patch.goalDirection = 'up'
      did.push('aiming to push it up')
    }

    // goal number (last, so a number inside a unit phrase like "5k" still lands).
    // Accept thousands separators so "make the goal 10,000" is 10000, not 10.
    // A 'done' tile is a yes-or-no day: it has no number goal, so we refuse to
    // claim one (the app guards this too; here we keep the words honest).
    const noTarget = current.kind === 'done'
    const numM = lower.match(/(\d[\d,]*(?:\.\d+)?)/)
    if (numM && !noTarget) {
      const n = parseFloat(numM[1].replace(/,/g, ''))
      if (n > 0) {
        patch.target = n
        did.push(`goal set to ${n.toLocaleString('en-US')}`)
      }
    } else if (numM && noTarget) {
      misses.push('this tile is a simple done or not day, so it has no number goal')
    } else if ((raiseM || lowerM) && !noTarget) {
      // "raise the goal" with no number: nudge the known target, or ask for one.
      if (current.target && current.target > 0) {
        const dir = raiseM ? 'up' : 'down'
        const next = nudged(current.target, dir)
        if (next !== current.target) {
          patch.target = next
          did.push(`goal ${dir === 'up' ? 'raised' : 'lowered'} to ${next.toLocaleString('en-US')}`)
        }
      } else {
        misses.push(`tell me the number, like "${raiseM ? 'raise' : 'lower'} the goal to 12"`)
      }
    }

    // the unit brain: a unit change must CONVERT the goal, not just relabel it.
    if (newUnit) {
      const label = (u: string) => (u === '$' ? 'dollars' : u)
      const fmt = (n: number) => n.toLocaleString('en-US')
      const fromUnit = current.unit ? canonUnit(current.unit) : undefined
      // An explicit number in this same line IS the goal in the new unit, so it
      // wins over conversion ("track it in ounces and cap it at 100" -> 100).
      const explicit = Boolean(numM) && !noTarget && patch.target != null
      // A relative nudge landed in the OLD unit; convert the nudged value too.
      const baseTarget = patch.target ?? current.target
      if (
        !explicit &&
        !noTarget && // a done tile has no number goal; never mint one via conversion
        fromUnit !== undefined &&
        fromUnit !== newUnit &&
        baseTarget !== undefined &&
        baseTarget > 0
      ) {
        const converted = convertAmount(baseTarget, fromUnit, newUnit)
        if (converted != null) {
          const friendly = friendlyRound(converted)
          patch.target = friendly
          // The conversion rewrites any relative nudge phrased in the old unit,
          // so drop its did line rather than claim two goal changes.
          for (let i = did.length - 1; i >= 0; i--) {
            if (/^goal (raised|lowered)/.test(did[i])) did.splice(i, 1)
          }
          did.push(
            `switched to ${label(newUnit)}, your ${fmt(baseTarget)} ${label(fromUnit)} became ${fmt(friendly)} ${label(newUnit)}`,
          )
        } else {
          // Unknown or cross-family target (glasses -> km, steps -> anything):
          // the unit label changed, the numbers honestly did not.
          did.push(
            `now tracking in ${label(newUnit)} (label only, ${label(fromUnit)} does not convert to ${label(newUnit)}, goal stays ${fmt(baseTarget)})`,
          )
        }
      } else {
        did.push(`now tracking in ${label(newUnit)}`)
      }
    }
  }

  if (did.length === 0) {
    const warn = misses.length > 0
      ? `noted, but ${misses.join('; ')}.`
      : 'noted. try a number ("make the goal 10"), a unit ("track it in oz"), a name ("call it Morning Run"), or a color ("make it azure").'
    return { patch: {}, did: [], warn }
  }
  return { patch, did }
}

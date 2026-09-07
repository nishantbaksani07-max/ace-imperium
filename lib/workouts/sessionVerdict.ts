/**
 * Session verdict — the "did I out-work last time?" engine behind the finish
 * screen ("Push in the books"). Pure, deterministic, unit-tested: given the
 * lifts the user logged THIS session and the lifts from their last session of
 * the same split day, it returns an overall verdict plus a per-lift breakdown.
 *
 * Design choices (see __tests__/sessionVerdict.test.ts):
 *  - Comparison is per lift, matched BY id (a swap/new lift has no prior data).
 *  - A lift is judged on its TOP working set (intensity, via Epley e1RM) AND
 *    its total volume (work). A heavier top set than last time is always a
 *    "best" — the milestone the user feels. Otherwise a 60/40 strength/volume
 *    blend decides up / held / down within a 1% deadband.
 *  - A brand-new lift (no prior session) is shown but NOT counted, so a first
 *    attempt can't drag the verdict down or inflate it. This is the user's own
 *    "count those out" instinct.
 *  - The overall tier is the net of stronger vs lighter counted lifts; a tie
 *    breaks on total matched volume. No prior data at all reads as "fresh".
 *  - Only genuinely-logged sets count (isLoggedSet) so failed / empty rows
 *    never distort the picture.
 */
import type { SavedExercise, SavedSet } from './queries'
import { isLoggedSet } from './queries'

/** Per-lift outcome vs its last session. `new` = no prior data (uncounted). */
export type LiftVerdict = 'best' | 'up' | 'held' | 'down' | 'new'

/** Overall read. `fresh` = nothing to compare against (first session ever). */
export type SessionTier = 'stronger' | 'held' | 'lighter' | 'fresh'

export interface LiftComparison {
  id: string
  name: string
  verdict: LiftVerdict
  /** Counted toward the overall verdict (false for new / uncompared lifts). */
  counted: boolean
  /** This session's heaviest logged set. */
  topWeight: number
  topReps: number
  /** Last session's heaviest logged set (null when this lift is new). */
  lastTopWeight: number | null
  lastTopReps: number | null
  /** Total logged volume (Σ weight × reps) this session and last. */
  thisVolume: number
  lastVolume: number | null
}

export interface SessionVerdict {
  tier: SessionTier
  strongerCount: number
  heldCount: number
  lighterCount: number
  newCount: number
  /** Net volume change vs last session across MATCHED lifts, percent (rounded).
   *  null when there's nothing to compare. */
  volumeDeltaPct: number | null
  /** At least one lift went heavier than last time. */
  hasNewBest: boolean
  /** One row per lift the user actually logged this session, in input order. */
  lifts: LiftComparison[]
}

/** Deadband for the blended delta — within ±1% reads as "held", not noise. */
const HELD_BAND = 0.01
const STRENGTH_WEIGHT = 0.6
const VOLUME_WEIGHT = 0.4

/** Epley estimated 1RM. A single rep is just the weight. */
function e1rm(weight: number, reps: number): number {
  return weight * (1 + reps / 30)
}

interface TopSet {
  weight: number
  reps: number
}

function loggedSets(ex: SavedExercise): SavedSet[] {
  return ex.sets.filter(isLoggedSet)
}

/** Heaviest set, tie-broken by reps. Caller guarantees a non-empty list. */
function topSet(sets: SavedSet[]): TopSet {
  let best: TopSet = { weight: 0, reps: 0 }
  let seeded = false
  for (const set of sets) {
    const weight = set.weight ?? 0
    const reps = set.reps ?? 0
    if (!seeded || weight > best.weight || (weight === best.weight && reps > best.reps)) {
      best = { weight, reps }
      seeded = true
    }
  }
  return best
}

function volume(sets: SavedSet[]): number {
  return sets.reduce((sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0), 0)
}

function judgeLift(mine: TopSet, myVol: number, last: TopSet, lastVol: number): LiftVerdict {
  // A heavier top set is the milestone — always a best, even if total volume
  // dipped (a heavy single is still a strength win).
  if (mine.weight > last.weight) return 'best'

  const lastE1rm = e1rm(last.weight, last.reps)
  const strengthDelta = lastE1rm > 0 ? (e1rm(mine.weight, mine.reps) - lastE1rm) / lastE1rm : 0
  const volumeDelta = lastVol > 0 ? (myVol - lastVol) / lastVol : 0
  const blended = STRENGTH_WEIGHT * strengthDelta + VOLUME_WEIGHT * volumeDelta

  if (blended > HELD_BAND) return 'up'
  if (blended < -HELD_BAND) return 'down'
  return 'held'
}

export function computeSessionVerdict(
  thisExercises: SavedExercise[],
  lastExercises: SavedExercise[] | null,
): SessionVerdict {
  // Index last session's lifts that actually carry logged work, by id.
  const lastById = new Map<string, SavedExercise>()
  for (const ex of lastExercises ?? []) {
    if (!lastById.has(ex.id) && loggedSets(ex).length > 0) lastById.set(ex.id, ex)
  }

  const lifts: LiftComparison[] = []
  let strongerCount = 0
  let heldCount = 0
  let lighterCount = 0
  let newCount = 0
  let matchedThisVol = 0
  let matchedLastVol = 0
  let hasMatched = false

  for (const ex of thisExercises) {
    const mine = loggedSets(ex)
    if (mine.length === 0) continue // not logged this session — drop entirely

    const myTop = topSet(mine)
    const myVol = volume(mine)
    const last = lastById.get(ex.id)

    if (!last) {
      newCount++
      lifts.push({
        id: ex.id,
        name: ex.name,
        verdict: 'new',
        counted: false,
        topWeight: myTop.weight,
        topReps: myTop.reps,
        lastTopWeight: null,
        lastTopReps: null,
        thisVolume: myVol,
        lastVolume: null,
      })
      continue
    }

    const lastLogged = loggedSets(last)
    const lastTop = topSet(lastLogged)
    const lastVol = volume(lastLogged)

    hasMatched = true
    matchedThisVol += myVol
    matchedLastVol += lastVol

    const verdict = judgeLift(myTop, myVol, lastTop, lastVol)
    if (verdict === 'best' || verdict === 'up') strongerCount++
    else if (verdict === 'down') lighterCount++
    else heldCount++

    lifts.push({
      id: ex.id,
      name: ex.name,
      verdict,
      counted: true,
      topWeight: myTop.weight,
      topReps: myTop.reps,
      lastTopWeight: lastTop.weight,
      lastTopReps: lastTop.reps,
      thisVolume: myVol,
      lastVolume: lastVol,
    })
  }

  const hasNewBest = lifts.some(l => l.verdict === 'best')
  const volumeDeltaPct =
    hasMatched && matchedLastVol > 0
      ? Math.round(((matchedThisVol - matchedLastVol) / matchedLastVol) * 100)
      : null

  let tier: SessionTier
  if (!hasMatched) {
    tier = 'fresh'
  } else if (strongerCount > lighterCount) {
    tier = 'stronger'
  } else if (lighterCount > strongerCount) {
    tier = 'lighter'
  } else if (volumeDeltaPct !== null && volumeDeltaPct > 1) {
    tier = 'stronger'
  } else if (volumeDeltaPct !== null && volumeDeltaPct < -1) {
    tier = 'lighter'
  } else {
    tier = 'held'
  }

  return {
    tier,
    strongerCount,
    heldCount,
    lighterCount,
    newCount,
    volumeDeltaPct,
    hasNewBest,
    lifts,
  }
}

/** The big serif headline for the finish card. */
export function verdictHeadline(tier: SessionTier): string {
  switch (tier) {
    case 'stronger':
      return 'Stronger overall'
    case 'held':
      return 'Held your ground'
    case 'lighter':
      return 'A lighter day'
    case 'fresh':
      return 'First one down'
  }
}

/**
 * The one warm sentence under the headline. Deterministic, references the day
 * and (when there is one) the lift that set a new best. House rules: warm, no
 * shame on a lighter day, no em dashes.
 */
export function verdictStory(v: SessionVerdict, dayName: string): string {
  const bestName = v.lifts.find(l => l.verdict === 'best')?.name ?? 'a lift'
  const counted = v.strongerCount + v.heldCount + v.lighterCount

  switch (v.tier) {
    case 'fresh':
      return `First ${dayName} on the board. Next time you will have numbers to beat.`
    case 'stronger':
      return v.hasNewBest
        ? `${bestName} hit a new best, and you out-worked last ${dayName} overall. This is how the work compounds.`
        : `You beat last ${dayName} on ${v.strongerCount} of ${counted} lifts. Momentum is yours.`
    case 'held':
      return `You matched last ${dayName} almost lift for lift. Holding the line on a heavy day is how strength sticks.`
    case 'lighter':
      return v.hasNewBest
        ? `You threw it at a ${bestName} best this ${dayName}, and the back half paid for it. A real trade, not a step back.`
        : `A lighter ${dayName} than last time. Some days the tank runs low. Rest, refuel, and come back hungry.`
  }
}

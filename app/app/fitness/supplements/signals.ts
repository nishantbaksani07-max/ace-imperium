'use client'

import { useEffect, useState } from 'react'
import { SUPPLEMENT_DB } from './supplements'
import type { DbSupplement, Recommendation, Signal } from './types'

/**
 * Shape of the user data the recommender needs. Pulled from a mix of
 * sources:
 *
 *   - Profile (age/sex/goal)   server, via page.tsx → SupplementsModule
 *   - Gym level                server (training_settings.gym_level)
 *   - Caffeine + substances    client localStorage (water module)
 *   - Already-taking ids       client localStorage (supplements module)
 *
 * Bundled into one struct so the scorer doesn't have to know where the
 * fields originated. WHOOP hooks come later — see the 'poor-sleep' /
 * 'low-recovery' signals.
 */
export interface UserSignalInput {
  age: number | null
  sex: 'M' | 'F' | null
  goal: 'recomp' | 'cut' | 'bulk' | 'maintain' | 'general_health' | null
  gymLevel: 'beginner' | 'intermediate' | 'advanced' | null
  caffeineMgPerDay: number
  hasStims: boolean
  hasNicotine: boolean
  hasAlcohol: boolean
  alreadyTakingIds: Set<string>  // sourceIds already in the user's stack
  /** WHOOP snapshot — null fields are normal when the user hasn't synced yet. */
  whoop?: WhoopSnapshot | null
}

/**
 * Derives the active signal set from the user's bundled state. Pure
 * function — exported separately so the UI can render a "why this set"
 * caption.
 */
export function extractSignals(u: UserSignalInput): Signal[] {
  const sig: Signal[] = []

  if (u.caffeineMgPerDay > 400) sig.push('very-high-caffeine')
  else if (u.caffeineMgPerDay > 200) sig.push('high-caffeine')

  if (u.hasStims) sig.push('has-stims')
  if (u.hasNicotine) sig.push('has-nicotine')
  if (u.hasAlcohol) sig.push('has-alcohol')

  if (u.gymLevel === 'beginner') sig.push('beginner-training')
  else if (u.gymLevel === 'intermediate' || u.gymLevel === 'advanced') {
    sig.push('heavy-training')
  }

  if (u.goal === 'bulk') sig.push('bulk-goal')
  else if (u.goal === 'cut') sig.push('cut-goal')
  else if (u.goal === 'recomp') sig.push('recomp-goal')
  else if (u.goal === 'general_health') sig.push('general-health-goal')

  if (u.sex === 'M') sig.push('male')
  else if (u.sex === 'F') sig.push('female')

  if (u.age !== null) {
    if (u.age >= 50) sig.push('senior')
    else if (u.age >= 40) sig.push('aging')
  }

  // WHOOP-derived signals. Each predicate is intentionally permissive — we'd
  // rather over-fire and have a couple of extra rec rows than miss someone
  // running a sleep deficit. All thresholds are documented next to the test.
  if (u.whoop) {
    const w = u.whoop
    // Sleep performance <80% OR cumulative debt >60min OR <6.5h on the night.
    const sleepPerfLow = typeof w.sleepPerf === 'number' && w.sleepPerf < 80
    const debtHigh = typeof w.sleepDeficitMin === 'number' && w.sleepDeficitMin > 60
    const shortNight = typeof w.sleepHours === 'number' && w.sleepHours < 6.5
    if (sleepPerfLow || debtHigh || shortNight) sig.push('poor-sleep')

    // Recovery score <50 OR HRV >=10ms under baseline (when baseline known).
    const recoveryLow = typeof w.recovery === 'number' && w.recovery < 50
    const hrvSuppressed = typeof w.hrv === 'number'
      && typeof w.hrvBaseline === 'number'
      && (w.hrvBaseline - w.hrv) >= 10
    if (recoveryLow || hrvSuppressed) sig.push('low-recovery')
  }

  return sig
}

/**
 * Score a single supplement against the active signal set. Final score
 * is clamped to 1..10 so the UI doesn't have to deal with edge values.
 */
export function scoreSupplement(s: DbSupplement, activeSignals: Signal[]): number {
  let score = s.baseScore
  for (const sig of activeSignals) {
    const boost = s.signalBoosts[sig]
    if (typeof boost === 'number') score += boost
  }
  return Math.max(1, Math.min(10, score))
}

/**
 * Which active signals actually moved the score up for this supplement
 * (for the "why this is recommended" caption).
 */
export function reasonsFor(s: DbSupplement, activeSignals: Signal[]): Signal[] {
  return activeSignals.filter(sig => (s.signalBoosts[sig] ?? 0) > 0)
}

/**
 * Top-N ranked recommendations excluding anything already in the
 * user's stack. Sort is by score desc, then base score desc as
 * tie-breaker, then a stable id sort.
 */
export function recommend(
  user: UserSignalInput,
  options: { limit?: number; minScore?: number } = {},
): { signals: Signal[]; recommendations: Recommendation[] } {
  const { limit = 8, minScore = 5 } = options
  const signals = extractSignals(user)

  const scored: Recommendation[] = SUPPLEMENT_DB
    .filter(s => !user.alreadyTakingIds.has(s.id))
    .map(s => ({
      supplement: s,
      score: scoreSupplement(s, signals),
      reasons: reasonsFor(s, signals),
    }))
    .filter(r => r.score >= minScore)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (b.supplement.baseScore !== a.supplement.baseScore) {
        return b.supplement.baseScore - a.supplement.baseScore
      }
      return a.supplement.id.localeCompare(b.supplement.id)
    })
    .slice(0, limit)

  return { signals, recommendations: scored }
}

// -----------------------------------------------------------------------------
// Client-side bridge to the water module's localStorage.
//
// The water module owns caffeine/substances state and we don't want to
// import its useWaterState hook (that would require an AccountProfile
// to instantiate). Instead, this hook reads the same localStorage key
// directly — read-only — and exposes the fields the recommender needs.
//
// Returns sensible defaults if water hasn't been visited yet.
// -----------------------------------------------------------------------------

const WATER_LS_KEY = 'vitality_water_v1'

interface WaterSnapshot {
  caffeineMgPerDay: number
  hasStims: boolean
  hasNicotine: boolean
  hasAlcohol: boolean
}

const WATER_DEFAULT: WaterSnapshot = {
  caffeineMgPerDay: 0,
  hasStims: false,
  hasNicotine: false,
  hasAlcohol: false,
}

function readWaterSnapshot(): WaterSnapshot {
  try {
    const raw = localStorage.getItem(WATER_LS_KEY)
    if (!raw) return WATER_DEFAULT
    const parsed = JSON.parse(raw) as {
      caffeineMgPerDay?: number
      substances?: Array<{ id?: string; cat?: string; name?: string }>
    }
    const caffeineMgPerDay = typeof parsed.caffeineMgPerDay === 'number'
      ? parsed.caffeineMgPerDay
      : 0
    const subs = Array.isArray(parsed.substances) ? parsed.substances : []
    let hasStims = false
    let hasNicotine = false
    let hasAlcohol = false
    for (const s of subs) {
      const cat = (s.cat || '').toLowerCase()
      const name = (s.name || '').toLowerCase()
      const id = (s.id || '').toLowerCase()
      if (cat.includes('stim')) hasStims = true
      if (id.includes('nicotine') || name.includes('nicotine')) hasNicotine = true
      if (id === 'alcohol' || name.includes('alcohol')) hasAlcohol = true
    }
    return { caffeineMgPerDay, hasStims, hasNicotine, hasAlcohol }
  } catch {
    return WATER_DEFAULT
  }
}

// -----------------------------------------------------------------------------
// Client-side bridge to the WHOOP module's localStorage.
//
// WhoopModule writes its currently-displayed figures to `vitality_whoop_v1`
// on mount; we read them here. Same read-only pattern as useWaterSnapshot —
// avoids dragging the WHOOP module's full state hook into this module's bundle.
// -----------------------------------------------------------------------------

const WHOOP_LS_KEY = 'vitality_whoop_v1'

export interface WhoopSnapshot {
  recovery: number | null
  hrv: number | null
  hrvBaseline: number | null
  sleepPerf: number | null
  sleepHours: number | null
  sleepDeficitMin: number | null
  strain: number | null
  strainWeeklyAvg: number | null
}

const WHOOP_DEFAULT: WhoopSnapshot = {
  recovery: null, hrv: null, hrvBaseline: null,
  sleepPerf: null, sleepHours: null, sleepDeficitMin: null,
  strain: null, strainWeeklyAvg: null,
}

function readWhoopSnapshot(): WhoopSnapshot {
  try {
    const raw = localStorage.getItem(WHOOP_LS_KEY)
    if (!raw) return WHOOP_DEFAULT
    const parsed = JSON.parse(raw) as Partial<WhoopSnapshot>
    return {
      recovery: typeof parsed.recovery === 'number' ? parsed.recovery : null,
      hrv: typeof parsed.hrv === 'number' ? parsed.hrv : null,
      hrvBaseline: typeof parsed.hrvBaseline === 'number' ? parsed.hrvBaseline : null,
      sleepPerf: typeof parsed.sleepPerf === 'number' ? parsed.sleepPerf : null,
      sleepHours: typeof parsed.sleepHours === 'number' ? parsed.sleepHours : null,
      sleepDeficitMin: typeof parsed.sleepDeficitMin === 'number' ? parsed.sleepDeficitMin : null,
      strain: typeof parsed.strain === 'number' ? parsed.strain : null,
      strainWeeklyAvg: typeof parsed.strainWeeklyAvg === 'number' ? parsed.strainWeeklyAvg : null,
    }
  } catch {
    return WHOOP_DEFAULT
  }
}

export function useWhoopSnapshot(): WhoopSnapshot {
  const [snap, setSnap] = useState<WhoopSnapshot>(WHOOP_DEFAULT)
  useEffect(() => {
    setSnap(readWhoopSnapshot())
    function onStorage(e: StorageEvent) {
      if (e.key === WHOOP_LS_KEY) setSnap(readWhoopSnapshot())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return snap
}

export function useWaterSnapshot(): WaterSnapshot {
  const [snap, setSnap] = useState<WaterSnapshot>(WATER_DEFAULT)
  useEffect(() => {
    setSnap(readWaterSnapshot())
    // Sync across tabs if user edits water in another window.
    function onStorage(e: StorageEvent) {
      if (e.key === WATER_LS_KEY) setSnap(readWaterSnapshot())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return snap
}

/**
 * Short human-readable label for a signal — used in the "Why these
 * picks?" pill rail. Keep these terse, lowercase, monospace-feel.
 */
export const SIGNAL_LABELS: Record<Signal, string> = {
  'high-caffeine':      'high caffeine',
  'very-high-caffeine': 'very high caffeine',
  'has-stims':          'on stimulants',
  'has-nicotine':       'nicotine user',
  'has-alcohol':        'drinks alcohol',
  'beginner-training':  'new to training',
  'heavy-training':     'heavy training load',
  'bulk-goal':          'goal: bulk',
  'cut-goal':           'goal: cut',
  'recomp-goal':        'goal: recomp',
  'general-health-goal':'goal: general health',
  'male':               'male',
  'female':             'female',
  'aging':              'age 40+',
  'senior':             'age 50+',
  'poor-sleep':         'poor sleep',
  'low-recovery':       'low recovery',
}

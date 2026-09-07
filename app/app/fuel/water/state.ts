'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getLocalDateKey } from '@/lib/dates'
import { mirrorWaterToSupabase } from './sync'
import type {
  AccountProfile,
  Substance,
  TargetBreakdown,
  WaterState,
  WaterUnit,
} from './types'

const LS_KEY = 'vitality_water_v1'

const DEFAULT_STATE: WaterState = {
  version: 2,
  unit: 'bottle',
  bottleMl: 500,
  glassMl: 250,
  activityHrsPerWeek: 5,
  caffeineMgPerDay: 200,
  substances: [],
  logs: {},
  setupComplete: false,
}

/**
 * Reads the raw localStorage payload (any historical shape) into the
 * current v2 schema. v1 stored profile (weight/age/sex/weightUnit)
 * inline; those now live on user_profile and are intentionally dropped
 * here — only `activityHrsPerWeek` survives the migration since it has
 * no account-level home.
 */
function normalize(parsed: unknown): WaterState {
  if (!parsed || typeof parsed !== 'object') return DEFAULT_STATE
  const p = parsed as Record<string, unknown> & {
    profile?: { activityHrsPerWeek?: number }
  }
  const legacyActivity = p.profile?.activityHrsPerWeek
  return {
    ...DEFAULT_STATE,
    unit: (p.unit as WaterUnit) ?? DEFAULT_STATE.unit,
    bottleMl: typeof p.bottleMl === 'number' ? p.bottleMl : DEFAULT_STATE.bottleMl,
    glassMl: typeof p.glassMl === 'number' ? p.glassMl : DEFAULT_STATE.glassMl,
    activityHrsPerWeek:
      typeof p.activityHrsPerWeek === 'number'
        ? p.activityHrsPerWeek
        : typeof legacyActivity === 'number'
        ? legacyActivity
        : DEFAULT_STATE.activityHrsPerWeek,
    caffeineMgPerDay:
      typeof p.caffeineMgPerDay === 'number'
        ? p.caffeineMgPerDay
        : DEFAULT_STATE.caffeineMgPerDay,
    substances: Array.isArray(p.substances) ? (p.substances as Substance[]) : [],
    logs:
      p.logs && typeof p.logs === 'object'
        ? (p.logs as Record<string, number>)
        : {},
    setupComplete:
      typeof p.setupComplete === 'boolean'
        ? p.setupComplete
        // No flag in storage → infer from whether this device has any
        // existing logs. Pre-wizard users skip onboarding; brand-new
        // installs land in the wizard.
        : !!(p.logs && typeof p.logs === 'object' && Object.keys(p.logs).length > 0),
    version: 2,
  }
}

function load(): WaterState {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_STATE
    return normalize(JSON.parse(raw))
  } catch {
    return DEFAULT_STATE
  }
}

// --- Unit helpers ---------------------------------------------------------

export function unitVolMl(state: WaterState): number {
  if (state.unit === 'bottle') return state.bottleMl || 500
  if (state.unit === 'glass') return state.glassMl || 250
  if (state.unit === 'oz') return 30
  return 1
}

/** ml → whole units of the user's chosen size (rounded, min 1 for any positive
 *  ml). Used to fold a drink logged in ml (e.g. a 470 ml pour) into the
 *  glass/bottle-count hydration log. Non-positive ml → 0. */
export function mlToUnits(ml: number, state: WaterState): number {
  if (!(ml > 0)) return 0
  return Math.max(1, Math.round(ml / unitVolMl(state)))
}

export function unitLabel(state: WaterState, plural = true): string {
  if (state.unit === 'bottle') return plural ? 'bottles' : 'bottle'
  if (state.unit === 'glass') return plural ? 'glasses' : 'glass'
  return state.unit
}

export function fmtMl(ml: number): string {
  if (ml >= 1000) return `${(ml / 1000).toFixed(1)} L`
  return `${Math.round(ml)} ml`
}

// --- Target computation ---------------------------------------------------
//   base_ml    = weight_kg × 35 ml      (NAM/IOM standard)
//   exercise   = activity_hrs/wk ÷ 7 × 500 ml/day
//   caffeine   = max(0, caffeineMg − 200) × 1.5 ml
//   substances = sum of dose × mlPerUnit for each added med/stim
//   adjust     = +200 ml male, +100 ml age 50+

export function subExtraMl(s: Substance): number {
  const dose = s.dose ?? s.defaultDose ?? 0
  if (s.mlPerMg) {
    const strength = s.strengthMg ?? s.defaultStrengthMg ?? 0
    return Math.max(0, dose * strength * s.mlPerMg)
  }
  return Math.max(0, dose * (s.mlPerUnit || 0))
}

export function computeTarget(
  state: WaterState,
  profile: AccountProfile,
): TargetBreakdown {
  const base = (profile.weightKg || 0) * 35
  const exercise = ((state.activityHrsPerWeek || 0) / 7) * 500
  const caffeine = Math.max(0, (state.caffeineMgPerDay || 0) - 200) * 1.5
  const subs = (state.substances || []).reduce((s, x) => s + subExtraMl(x), 0)
  let adjust = 0
  if (profile.sex === 'm') adjust += 200
  if ((profile.age || 0) >= 50) adjust += 100
  return { base, exercise, caffeine, subs, adjust, total: base + exercise + caffeine + subs + adjust }
}

// --- Hook -----------------------------------------------------------------

export interface WaterActions {
  drank: () => void
  /** Add a drink logged in ml to today's hydration (folds ml → whole units). */
  logMl: (ml: number) => void
  undo: () => void
  setUnit: (u: WaterUnit) => void
  setBottleMl: (ml: number) => void
  setGlassMl: (ml: number) => void
  setActivity: (hrs: number) => void
  setCaffeine: (mg: number) => void
  addSubstance: (sub: Substance) => 'added' | 'duplicate'
  removeSubstance: (id: string) => void
  setSubstanceDose: (id: string, dose: number) => void
  setSubstanceStrength: (id: string, strengthMg: number) => void
  markSetupComplete: () => void
  resetAll: () => void
  importState: (raw: unknown) => 'ok' | 'invalid'
  exportJson: () => string
}

/** Seed values from the user's Hydration tailoring quiz. Used to
 *  pre-fill freshly-mounted state when localStorage has no prior
 *  customization, so a user who just took the quiz sees their
 *  answers reflected in the water module immediately. */
export interface HydrationSeed {
  caffeineMgPerDay: number
  activityHrsPerWeek: number
  targetOverrideOz: number
}

/**
 * Merge day logs from this browser and the Supabase mirror, taking the max
 * count per day. Local can be ahead of the debounced mirror (drank, closed the
 * tab inside 800ms); the mirror knows days logged on other devices. Max never
 * loses a drink either way. Pure + exported for tests.
 */
export function mergeWaterLogs(
  local: Record<string, number>,
  server: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = { ...local }
  for (const [date, count] of Object.entries(server)) {
    if (typeof count === 'number' && count > (merged[date] || 0)) merged[date] = count
  }
  return merged
}

export function useWaterState(
  profile: AccountProfile,
  seed?: HydrationSeed,
  /** Server-loaded water mirror (loadWaterState). Cross-device source of
   *  truth for prefs; logs merge per-day by max. Applied once, on first mount. */
  initial?: Partial<WaterState> | null,
) {
  const [state, setState] = useState<WaterState>(DEFAULT_STATE)
  const [ready, setReady] = useState(false)
  // The server merge runs exactly once — a router.refresh() mid-session must
  // not re-apply a stale mirror over live undo/edits.
  const appliedServer = useRef(false)

  useEffect(() => {
    const loaded = load()
    // Server mirror (when present) is the cross-device truth for prefs and the
    // superset of day logs (per-day max, see mergeWaterLogs). This is what makes
    // water survive a new phone / cleared cache — the read half of ./sync.ts.
    if (initial && !appliedServer.current) {
      appliedServer.current = true
      const { logs: serverLogs, ...serverPrefs } = initial
      Object.assign(loaded, serverPrefs)
      loaded.logs = mergeWaterLogs(loaded.logs, serverLogs ?? {})
    }
    // If neither store had customized caffeine / activity yet AND we have a
    // quiz-seed, apply the seed values. Lets the Hydration quiz visibly tailor
    // the water target without forcing the user to re-enter the same numbers.
    if (seed) {
      const isFreshCaffeine = loaded.caffeineMgPerDay === DEFAULT_STATE.caffeineMgPerDay
      const isFreshActivity = loaded.activityHrsPerWeek === DEFAULT_STATE.activityHrsPerWeek
      if (isFreshCaffeine) loaded.caffeineMgPerDay = seed.caffeineMgPerDay
      if (isFreshActivity) loaded.activityHrsPerWeek = seed.activityHrsPerWeek
    }
    setState(loaded)
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed])

  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state))
    } catch {
      // localStorage full or disabled — fail quiet, UI stays functional
    }
  }, [state, ready])

  // Mirror to Supabase (durable + cross-device + readable by the Vitality MCP).
  // Debounced + best-effort; localStorage above stays the primary client store,
  // so a failed mirror never affects the UI. See ./sync.ts.
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => { void mirrorWaterToSupabase(state) }, 800)
    return () => clearTimeout(t)
  }, [state, ready])

  const drank = useCallback(() => {
    setState(prev => {
      const k = getLocalDateKey()
      const next = (prev.logs[k] || 0) + 1
      return { ...prev, logs: { ...prev.logs, [k]: next } }
    })
  }, [])

  // Fold a drink logged elsewhere (the Drinks library, in ml) into today's
  // hydration count, so water has one number across the app.
  const logMl = useCallback((ml: number) => {
    setState(prev => {
      const units = mlToUnits(ml, prev)
      if (!units) return prev
      const k = getLocalDateKey()
      return { ...prev, logs: { ...prev.logs, [k]: (prev.logs[k] || 0) + units } }
    })
  }, [])

  const undo = useCallback(() => {
    setState(prev => {
      const k = getLocalDateKey()
      const current = prev.logs[k] || 0
      if (current <= 1) {
        const logs = { ...prev.logs }
        delete logs[k]
        return { ...prev, logs }
      }
      return { ...prev, logs: { ...prev.logs, [k]: current - 1 } }
    })
  }, [])

  const setUnit = useCallback((u: WaterUnit) => setState(prev => ({ ...prev, unit: u })), [])
  const setBottleMl = useCallback((ml: number) => setState(prev => ({ ...prev, bottleMl: ml || 500 })), [])
  const setGlassMl = useCallback((ml: number) => setState(prev => ({ ...prev, glassMl: ml || 250 })), [])
  const setActivity = useCallback((hrs: number) => setState(prev => ({ ...prev, activityHrsPerWeek: Math.max(0, hrs) })), [])
  const setCaffeine = useCallback((mg: number) => setState(prev => ({ ...prev, caffeineMgPerDay: Math.max(0, mg) })), [])

  const addSubstance = useCallback((sub: Substance): 'added' | 'duplicate' => {
    let result: 'added' | 'duplicate' = 'added'
    setState(prev => {
      if (prev.substances.find(s => s.id === sub.id)) {
        result = 'duplicate'
        return prev
      }
      return {
        ...prev,
        substances: [
          ...prev.substances,
          { ...sub, dose: sub.defaultDose, strengthMg: sub.defaultStrengthMg },
        ],
      }
    })
    return result
  }, [])

  const removeSubstance = useCallback((id: string) => {
    setState(prev => ({ ...prev, substances: prev.substances.filter(s => s.id !== id) }))
  }, [])

  const setSubstanceDose = useCallback((id: string, dose: number) => {
    setState(prev => ({
      ...prev,
      substances: prev.substances.map(s => s.id === id ? { ...s, dose: Math.max(0, dose) } : s),
    }))
  }, [])

  const setSubstanceStrength = useCallback((id: string, strengthMg: number) => {
    setState(prev => ({
      ...prev,
      substances: prev.substances.map(s => s.id === id ? { ...s, strengthMg: Math.max(0, strengthMg) } : s),
    }))
  }, [])

  const markSetupComplete = useCallback(() => {
    setState(prev => prev.setupComplete ? prev : { ...prev, setupComplete: true })
  }, [])

  const resetAll = useCallback(() => setState(DEFAULT_STATE), [])

  const importState = useCallback((raw: unknown): 'ok' | 'invalid' => {
    if (!raw || typeof raw !== 'object') return 'invalid'
    setState(normalize(raw))
    return 'ok'
  }, [])

  const exportJson = useCallback(() => JSON.stringify(state, null, 2), [state])

  const todayKey = getLocalDateKey()
  const todayCount = state.logs[todayKey] || 0
  const target = computeTarget(state, profile)
  const targetUnits = Math.max(1, Math.ceil(target.total / unitVolMl(state)))

  const actions: WaterActions = {
    drank, logMl, undo, setUnit, setBottleMl, setGlassMl, setActivity, setCaffeine,
    addSubstance, removeSubstance, setSubstanceDose, setSubstanceStrength,
    markSetupComplete, resetAll, importState, exportJson,
  }

  return { ready, state, todayCount, target, targetUnits, actions }
}

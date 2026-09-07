// Food Coach — context collectors.
//
// One small, pure function per data source. Each takes already-fetched data and
// returns a compact one-or-two-line string fragment, or null when the source is
// empty (a fresh account just omits that fragment, the coach never breaks).
// Adding a new questionnaire later is one new function here + one line in
// context.ts. Keep every fragment terse: the whole block is fed on every call.

import type { UserPreferences } from '@/lib/preferences'
import type { CoachSnapshot, CoachMemoryRow } from './types'
import type { Checkin } from '@/lib/nutrition/adaptive'

type Row = Record<string, unknown>

const n = (v: unknown): number | null => {
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
const s = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

function ageFromBirthday(birthday: unknown): number | null {
  const b = s(birthday)
  if (!b) return null
  const [y, m, d] = b.split('-').map(Number)
  if (!y || !m || !d) return null
  const today = new Date()
  let age = today.getFullYear() - y
  const md = today.getMonth() + 1 - m
  if (md < 0 || (md === 0 && today.getDate() < d)) age -= 1
  return age > 0 && age < 130 ? age : null
}

// ── Questionnaires (the personalization core) ───────────────────────────────

export function collectOnboarding(profile: Row | null): string | null {
  if (!profile) return null
  const name = s(profile.first_name)
  const sex = s(profile.sex)
  const age = ageFromBirthday(profile.birthday)
  const weight = n(profile.starting_weight_kg)
  const height = n(profile.height_cm)
  const units = s(profile.units)
  const goal = s(profile.goal)
  const focus = Array.isArray(profile.focus_areas) ? (profile.focus_areas as string[]) : []
  const parts: string[] = []
  if (sex) parts.push(`sex ${sex}`)
  if (age != null) parts.push(`age ${age}`)
  if (weight != null) parts.push(`weight ${weight}kg`)
  if (height != null) parts.push(`height ${height}cm`)
  if (units) parts.push(`prefers ${units}`)
  if (goal) parts.push(`onboarding goal ${goal}`)
  if (focus.length) parts.push(`focus on ${focus.join(', ')}`)
  if (!parts.length && !name) return null
  return `Body + onboarding: ${name ? name + ', ' : ''}${parts.join(' · ')}.`
}

export function collectFitnessIntake(
  intakeAnswers: Row | null,
  intakeRec: Row | null,
  gymLevel: string | null,
): string | null {
  if (!intakeAnswers && !gymLevel) return null
  const a = intakeAnswers ?? {}
  const parts: string[] = []
  const goal = s(a.goal)
  if (goal) parts.push(`training goal ${goal}`)
  const priorities = Array.isArray(a.priorities) ? (a.priorities as string[]) : []
  if (priorities.length) parts.push(`wants to grow ${priorities.join(' + ')}`)
  const exp = s(a.experience)
  if (exp) parts.push(`experience ${exp}`)
  const recovery = s(a.recovery)
  if (recovery) parts.push(`recovery ${recovery}`)
  const days = n(a.days)
  if (days != null) parts.push(`trains ${days} days/week`)
  if (gymLevel) parts.push(`gym level ${gymLevel}`)
  const headline = intakeRec ? s(intakeRec.diagnosticHeadline) : null
  if (headline) parts.push(`program ${headline}`)
  if (!parts.length) return null
  return `Training intake: ${parts.join(' · ')}.`
}

export function collectMentorQuiz(mentor: UserPreferences['mentor']): string | null {
  if (!mentor) return null
  const parts: string[] = []
  if (mentor.focus?.length) parts.push(`focus areas ${mentor.focus.join(', ')}`)
  let out = parts.length ? `Mentor quiz: ${parts.join(' · ')}.` : ''
  if (mentor.memory_notes?.trim()) {
    out += `${out ? ' ' : ''}User asked you to remember (honor this every time): "${mentor.memory_notes.trim()}".`
  }
  return out || null
}

const FIX_LABELS: Record<string, string> = {
  energy: 'more energy', digestion: 'better digestion', sleep: 'better sleep',
  fat_loss: 'lose fat', muscle: 'build muscle', skin: 'clearer skin',
  focus: 'sharper focus', mood: 'better mood', cravings: 'fewer cravings',
  healthier: 'eat healthier',
}

/** The food-story quiz — the heart of the coach's personalization. Turns the
 *  user's answers into goals to steer toward, restrictions to NEVER suggest,
 *  and the two tone controls (numbers-vs-feel, push hard-vs-gentle). */
export function collectNutritionQuiz(nutrition: UserPreferences['nutrition']): string | null {
  if (!nutrition) return null
  const parts: string[] = []
  if (nutrition.fix.length) {
    parts.push(`wants food to help with ${nutrition.fix.map((f) => FIX_LABELS[f] ?? f).join(', ')}`)
  }
  const skin = nutrition.skin.filter((v) => v !== 'none')
  if (skin.length) parts.push(`skin concern: ${skin.join(', ')}`)
  if (nutrition.gut !== 'fine') {
    parts.push(`gut: ${nutrition.gut === 'often' ? 'often bloated' : 'sometimes bloated'}`)
  }
  if (nutrition.avoid_notes.trim()) parts.push(`foods that do not sit right: ${nutrition.avoid_notes.trim()}`)
  parts.push(`adventurousness: ${nutrition.adventurous}`)

  let out = `Nutrition quiz: ${parts.join(' · ')}.`

  const restrictions = nutrition.restrictions.filter((v) => v !== 'none')
  if (restrictions.length) {
    out += ` NEVER suggest foods they cannot eat: ${restrictions.join(', ')}.`
  }
  if (nutrition.approach === 'feel_first') {
    out += ' They asked you to skip the numbers: never mention calories, macros, weight loss, or earning or burning food. Talk only about how foods make them feel.'
  }
  const pace =
    nutrition.pace === 'gentle'
      ? 'Be gentle and patient, celebrate small wins, never pressure them.'
      : nutrition.pace === 'driven'
      ? 'They want to be pushed: be direct and hold them to their goal.'
      : 'Encourage them with light, friendly accountability.'
  out += ` Push tone: ${pace}`
  return out
}

/** The distilled long-term memory — what the coach has learned about this
 *  person over past conversations. High-signal, so it leads the context. */
export function collectCoachMemory(memory: CoachMemoryRow | null): string | null {
  if (!memory || !memory.summary.trim()) return null
  return `What you already know about this person (carry it into every reply): ${memory.summary.trim()}`
}

// ── Live data ────────────────────────────────────────────────────────────────

interface MealLite {
  dayKey: string
  totals: { kcal: number; protein: number; carbs: number; fat: number }
  whatISee: string | null
}

export function collectMacros(
  goals: Row | null,
  meals: MealLite[],
  todayKey: string,
): { fragment: string; todayCount: number } {
  const kcalTarget = goals ? n(goals.kcal_target) ?? 2400 : 2400
  const proteinTarget = goals ? n(goals.protein_target) ?? 180 : 180

  const today = meals.filter((m) => m.dayKey === todayKey)
  const lines: string[] = [
    `Macro targets: ${kcalTarget} kcal, ${proteinTarget}g protein (only kcal/protein/carbs/fat are tracked, there is no fiber number).`,
  ]

  if (today.length) {
    const t = today.reduce(
      (acc, m) => ({
        kcal: acc.kcal + (m.totals.kcal || 0),
        protein: acc.protein + (m.totals.protein || 0),
        carbs: acc.carbs + (m.totals.carbs || 0),
        fat: acc.fat + (m.totals.fat || 0),
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    )
    const names = today.map((m) => m.whatISee).filter(Boolean).slice(0, 8).join('; ')
    lines.push(
      `Today (${todayKey}): ${today.length} meal${today.length === 1 ? '' : 's'}. ${Math.round(t.kcal)} kcal, ${Math.round(
        t.protein,
      )}g protein, ${Math.round(t.carbs)}g carbs, ${Math.round(t.fat)}g fat. ${kcalTarget - t.kcal >= 0 ? `${Math.round(kcalTarget - t.kcal)} kcal left` : `${Math.round(t.kcal - kcalTarget)} kcal over`}.${names ? ` Meals: ${names}.` : ''}`,
    )
  } else {
    lines.push(`Today (${todayKey}): nothing logged yet.`)
  }

  // Recent: average over logged days (excluding today), plus a simple streak.
  const byDay = new Map<string, number>()
  for (const m of meals) {
    if (m.dayKey === todayKey) continue
    byDay.set(m.dayKey, (byDay.get(m.dayKey) ?? 0) + (m.totals.kcal || 0))
  }
  if (byDay.size) {
    const kcals = Array.from(byDay.values())
    const avg = Math.round(kcals.reduce((a, b) => a + b, 0) / kcals.length)
    lines.push(`Recent: averaged ${avg} kcal across ${byDay.size} logged day${byDay.size === 1 ? '' : 's'} before today.`)
  }

  return { fragment: lines.join('\n'), todayCount: today.length }
}

export function collectWeightTrend(weights: Row[]): string | null {
  if (!weights.length) return null
  const latest = n(weights[0].weight_kg)
  const oldest = n(weights[weights.length - 1].weight_kg)
  if (latest == null) return null
  if (oldest == null || weights.length < 2) return `Weight: ${latest.toFixed(1)}kg latest.`
  const delta = latest - oldest
  const dir = delta > 0.3 ? 'trending up' : delta < -0.3 ? 'trending down' : 'holding steady'
  return `Weight: ${latest.toFixed(1)}kg latest, ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}kg over ${weights.length} entries, ${dir}.`
}

export function collectWearables(wearable: Row[]): string | null {
  if (!wearable.length) return null
  const recent = wearable.slice(0, 3).map((w) => {
    const parts: string[] = [s(w.date) ?? '']
    const rec = n(w.recovery)
    const sleep = n(w.sleep_hours)
    if (rec != null) parts.push(`recovery ${rec}`)
    if (sleep != null) parts.push(`sleep ${sleep.toFixed(1)}h`)
    return parts.join(' ')
  })
  return `Wearable (recent): ${recent.join(' · ')}.`
}

export function collectWaterSupps(snapshot: CoachSnapshot | null | undefined): string | null {
  if (!snapshot) return null
  const parts: string[] = []
  if (snapshot.water) {
    parts.push(`water ${snapshot.water.todayServings} servings today`)
    if (snapshot.water.caffeineMgPerDay > 0) parts.push(`~${snapshot.water.caffeineMgPerDay}mg caffeine/day`)
  }
  if (snapshot.supplements && snapshot.supplements.total > 0) {
    const names = snapshot.supplements.names.slice(0, 6).join(', ')
    parts.push(`supplements ${snapshot.supplements.takenToday}/${snapshot.supplements.total} taken today${names ? ` (${names})` : ''}`)
  }
  if (!parts.length) return null
  return `Water + supplements: ${parts.join(' · ')}.`
}

// The adaptive check-in, phrased for the coach. Trend is QUALITATIVE (no raw kg
// ever reaches the model -> no kg leaking to an imperial user); the suggestion is
// in calories (the unit the user tracks). Carries the warm/no-shame instruction.
export function collectAdaptiveCheckin(c: Checkin | null | undefined): string | null {
  if (!c) return null
  const trend =
    c.trendRateKgPerWeek == null
      ? 'holding steady'
      : c.trendRateKgPerWeek > 0.1
        ? 'climbing'
        : c.trendRateKgPerWeek < -0.1
          ? 'easing down'
          : 'holding steady'

  if (c.status === 'calibrating') {
    const days = c.daysUntilFirstRead != null ? ` (first read in about ${c.daysUntilFirstRead} days)` : ''
    return `Adaptive coach: still calibrating${days}. No calorie change to suggest yet; encourage them to keep logging.`
  }

  const parts = [`Adaptive check-in this week: their weight is ${trend}, status ${c.status}.`]
  if (c.maintenanceKcal != null) parts.push(`Learned maintenance is about ${c.maintenanceKcal} calories, an estimate that sharpens over time.`)
  if (c.deltaKcal && c.suggestedKcal != null) {
    parts.push(`Suggested move: ${c.deltaKcal > 0 ? 'add' : 'drop'} about ${Math.abs(c.deltaKcal)} calories, to ${c.suggestedKcal}.`)
  }
  if (c.logScaleGap != null && c.logScaleGap > 150) {
    parts.push(`Their food log reads a little light next to the scale. Treat that as completely normal and trust the scale; never frame it as dishonesty.`)
  }
  parts.push(`Voice this warmly and never with shame; if they had a hard week, offer "give me grace this week."`)
  return parts.join(' ')
}

/**
 * The first-find — the honest COMMON notice a brand-new user earns the moment
 * they have ANY real logged data. Today the earliest real notice needs 2+ days
 * of data (a weight slope, a lift delta), so day-one users only ever saw the
 * static cold card; this closes that gap without inventing anything: the copy is
 * an OBSERVATION about their actual first data (their real numbers, verbatim),
 * never a pattern claim.
 *
 * Wiring (see buildFeed step 3.5 + loadNoticed): it only enters the feed when
 * NOTHING else fired, so it can never outrank a real find, and it carries a
 * 'first+<domain>' patternKey so the existing noticed_ledger write makes it a
 * once-ever moment (loadNoticed skips building it after any 'first+' row exists).
 *
 * Pure + IO-free + unit-tested (see __tests__/firstFind.test.ts).
 */

export interface FirstFindInput {
  /** Submitted workout sessions in the last 7 days. */
  sessions7: number
  /** Recent weigh-ins (kg), any order. */
  weighIns: { date: string; kg: number }[]
  /** Distinct days with a logged meal in the last 7 days. */
  mealDays7: number
  /** Today's protein total (grams), when meals were logged today. */
  proteinTodayG: number | null
  /** Today's water intake in ml (0 = none). */
  waterTodayMl: number
  /** The latest wearable night's sleep hours, if any. */
  sleepLastH: number | null
  /** The latest wearable recovery score, if any. */
  recoveryLast: number | null
  /** The user's own tile streams with how many reports each has filed. */
  streams: { label: string; reportCount: number }[]
  units: 'metric' | 'imperial'
}

export interface FirstFind {
  /** The domain that produced it — becomes the 'first+<domain>' pattern key. */
  domain: string
  lead: string
  watched: string
  /** Real data chips, straight from the rows. Kept to <= 2. */
  receipts: string[]
  /** A verbatim phrase inside `lead` for the mint underline. */
  lever?: string
  /** A real, shipped /app route. */
  action?: { label: string; href: string }
}

const KG_TO_LB = 2.2046226218

function fmtWeight(kg: number, units: 'metric' | 'imperial'): string {
  const v = units === 'imperial' ? kg * KG_TO_LB : kg
  const unit = units === 'imperial' ? 'lb' : 'kg'
  return `${Math.round(v * 10) / 10} ${unit}`
}

/**
 * Deterministic priority, first match wins:
 * train -> weight -> macros -> water -> recovery -> stream. Null when the user
 * has logged nothing at all (the cold card keeps that job).
 */
export function buildFirstFind(input: FirstFindInput): FirstFind | null {
  const { sessions7, weighIns, mealDays7, proteinTodayG, waterTodayMl, sleepLastH, recoveryLast, streams, units } = input

  if (sessions7 >= 1) {
    const n = sessions7
    return {
      domain: 'train',
      lead: `your training is on the record. ${n} ${n === 1 ? 'session' : 'sessions'} logged this week, and every log gives me more to connect.`,
      lever: 'on the record',
      watched: 'training · 7d',
      receipts: [`${n} ${n === 1 ? 'session' : 'sessions'} this week`],
      action: { label: 'log a session', href: '/app/fitness/log' },
    }
  }

  if (weighIns.length >= 1) {
    const latest = [...weighIns]
      .filter(w => Number.isFinite(w.kg))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-1)[0]
    if (latest) {
      const w = fmtWeight(latest.kg, units)
      const n = weighIns.length
      return {
        domain: 'weight',
        lead: n === 1
          ? `your first weigh-in is on the record at ${w}. one more and I can read your trend.`
          : `your weigh-ins are on the record, ${n} so far, the latest at ${w}.`,
        lever: 'on the record',
        watched: 'your weigh-ins',
        receipts: [`${w} · ${latest.date}`],
        action: { label: 'log a weigh-in', href: '/app/fitness/progress' },
      }
    }
  }

  if (mealDays7 >= 1) {
    const d = mealDays7
    const receipts = [`${d} ${d === 1 ? 'meal day' : 'meal days'} this week`]
    if (proteinTodayG != null && proteinTodayG > 0) receipts.push(`${Math.round(proteinTodayG)} g protein today`)
    return {
      domain: 'macros',
      lead: `your meals are on the record. ${d} ${d === 1 ? 'day' : 'days'} logged this week, and every day sharpens what I can read.`,
      lever: 'on the record',
      watched: 'fuel · 7d',
      receipts,
      action: { label: 'log a meal', href: '/app/fuel/macros' },
    }
  }

  if (waterTodayMl > 0) {
    const liters = Math.round((waterTodayMl / 1000) * 10) / 10
    return {
      domain: 'water',
      lead: `you logged ${liters} L today. hydration is on the record now.`,
      lever: 'on the record',
      watched: 'water · today',
      receipts: [`${liters} L today`],
      action: { label: 'log water', href: '/app/fuel/water' },
    }
  }

  if (sleepLastH != null || recoveryLast != null) {
    const receipts: string[] = []
    if (sleepLastH != null) receipts.push(`${Math.round(sleepLastH * 10) / 10} h sleep · latest night`)
    if (recoveryLast != null && receipts.length < 2) receipts.push(`recovery ${Math.round(recoveryLast)}`)
    const lead = sleepLastH != null
      ? `your sleep is on the record, the latest night read ${Math.round(sleepLastH * 10) / 10} hours. every night teaches me more.`
      : `your recovery is on the record, the latest reading came in at ${Math.round(recoveryLast!)}. every reading teaches me more.`
    return {
      domain: 'recovery',
      lead,
      lever: 'on the record',
      watched: 'recovery · latest',
      receipts,
      action: { label: 'check your recovery', href: '/app/peak' },
    }
  }

  const reporting = streams
    .filter(s => s.reportCount >= 1 && s.label.trim().length > 0)
    .sort((a, b) => b.reportCount - a.reportCount || a.label.localeCompare(b.label))[0]
  if (reporting) {
    const n = reporting.reportCount
    const label = reporting.label.toLowerCase()
    return {
      domain: 'stream',
      lead: `your ${label} tile is on the record. ${n} ${n === 1 ? 'report' : 'reports'} in, and I connect what it feeds me.`,
      lever: 'on the record',
      watched: `${label} · your tile`,
      receipts: [`${n} ${n === 1 ? 'report' : 'reports'} from ${label}`],
    }
  }

  return null
}

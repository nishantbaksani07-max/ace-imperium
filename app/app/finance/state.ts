'use client'

/**
 * State + persistence layer for the Finance module.
 *
 * - `useFinanceState()` is the single source of truth for the module.
 *   Returns the live state, mutators, FX rates, and money formatters.
 * - Persistence is localStorage under STORAGE_KEY (one namespaced blob).
 *   This is BUILD12's stopgap — BUILD13 will swap this for Supabase tables
 *   with RLS without changing the public hook surface.
 * - FX rates are fetched once on mount from open.er-api.com (free, no key).
 *   Rates are CHF-relative (CHF=1). All storage is canonical CHF.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type {
  Account,
  AccountType,
  ActivityEntry,
  CryptoQuote,
  Currency,
  FinanceState,
  NwHistoryPoint,
  Order,
  PricePoint,
  StockQuote,
  SubPeriod,
  Subscription,
  TabKey,
  WishItem,
} from './types'

export const STORAGE_KEY = 'vitality_finance_v1'
export const ACTIVITY_MAX = 50
export const NW_HISTORY_MAX = 500
export const PRICE_HISTORY_MAX = 30
/** Cap on stored orders. Beyond this, oldest *deducted* (completed) orders are
 *  trimmed first; undeducted orders are never dropped. Stops unbounded growth. */
export const ORDERS_MAX = 500
/** Don't snapshot a fresh price point if the last one is more recent than this. */
export const PRICE_SNAPSHOT_INTERVAL_MS = 6 * 60 * 60 * 1000  // 6h

const DEFAULT_STATE: FinanceState = {
  version: 1,
  currency: 'CHF',
  activeTab: 'net',
  accounts: [],
  subscriptions: [],
  orders: [],
  wishlist: [],
  activity: [],
  netWorthHistory: [],
}

/** Rates are CHF -> X (i.e. CHF=1, USD=1.1 means 1 CHF buys 1.1 USD). */
export type ExchangeRates = Record<Currency, number>

const DEFAULT_RATES: ExchangeRates = { CHF: 1, USD: 1, EUR: 1, GBP: 1 }

// -----------------------------------------------------------------------------
// Pure helpers
// -----------------------------------------------------------------------------

/**
 * Bare RFC-4122 uuid. IDs double as React keys, the lookup key in every mutator,
 * AND the Supabase `uuid` primary key (BUILD13), so they must be valid uuids —
 * the old `${prefix}_${uuid}` form would fail to insert into a uuid column.
 */
export function newUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** Kept for call-site compatibility; the prefix arg is ignored now (see newUuid). */
export function genId(_prefix = 'id'): string {
  return newUuid()
}

/**
 * Parse a YYYY-MM-DD (or full ISO) string as a LOCAL-time Date; null if invalid.
 * The date-only guard appends T00:00 to dodge the toISOString/UTC-midnight drift bug.
 */
export function parseLocalDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const isoSafe = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00` : iso
  const d = new Date(isoSafe)
  return isNaN(d.getTime()) ? null : d
}

/** Local midnight today. */
export function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** Day-bucketed relative parts shared by the renewal + arrival labels. */
export function relativeDateParts(
  iso: string | null | undefined,
): { diffDays: number; dateLabel: string } | null {
  const d = parseLocalDate(iso)
  if (!d) return null
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((dayStart.getTime() - startOfToday().getTime()) / 86_400_000)
  const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return { diffDays, dateLabel }
}

/** Spend/cost as a share of net worth → severity class. <5% good, <25% warn, else bad. */
export function pctClass(pct: number): 'good' | 'warn' | 'bad' {
  if (pct < 5) return 'good'
  if (pct < 25) return 'warn'
  return 'bad'
}

/** Convert `amount` from one display currency to another via CHF-relative rates. */
export function convertBetween(amount: number, from: Currency, to: Currency, rates: ExchangeRates): number {
  if (!isFinite(amount)) return 0
  return (amount * (rates[to] || 1)) / (rates[from] || 1)
}

/**
 * Round a set of values to percentages that sum to EXACTLY 100 (largest-remainder
 * method), so a breakdown legend never reads 99.9% / 100.2%. `decimals` controls
 * display precision (1 → percentages like 33.3).
 */
export function percentBreakdown(values: number[], total: number, decimals = 1): number[] {
  if (total <= 0) return values.map(() => 0)
  const factor = Math.pow(10, decimals)
  const exact = values.map(v => (v / total) * 100 * factor)
  const floored = exact.map(Math.floor)
  let remainder = Math.round(100 * factor) - floored.reduce((a, b) => a + b, 0)
  const byFrac = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  const result = [...floored]
  for (let k = 0; k < byFrac.length && remainder > 0; k++) {
    result[byFrac[k].i] += 1
    remainder--
  }
  return result.map(v => v / factor)
}

/**
 * Format a CHF amount in the user's display currency.
 * Whole numbers render without decimals; fractional amounts get 2 decimals max.
 */
export function fmtMoney(amountCHF: number, currency: Currency, rates: ExchangeRates): string {
  const rate = rates[currency] || 1
  const num = (Number(amountCHF) || 0) * rate
  const hasFraction = Math.abs(num % 1) > 0.005
  return `${currency} ${num.toLocaleString('en-US', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`
}

/** Convert a display-currency amount the user typed into canonical CHF for storage. */
export function displayToChf(amount: number, currency: Currency, rates: ExchangeRates): number {
  const rate = rates[currency] || 1
  return amount / rate
}

/** Convert a stored CHF amount to display currency (rounded to 2dp for editing). */
export function chfToDisplay(amountCHF: number, currency: Currency, rates: ExchangeRates): number {
  const rate = rates[currency] || 1
  return amountCHF * rate
}

/**
 * Subscription cost normalized to monthly CHF.
 * weekly => *52/12, yearly => /12, monthly => *1. Using 52/12 (not 4.345) keeps
 * annualization consistent: monthlyEquivalent(weekly) * 12 === weekly * 52.
 */
export function monthlyEquivalent(s: Pick<Subscription, 'amountCHF' | 'period'>): number {
  const a = Number(s.amountCHF) || 0
  if (s.period === 'yearly') return a / 12
  if (s.period === 'weekly') return (a * 52) / 12
  return a
}

/**
 * Roll a YYYY-MM-DD anchor forward by `period` increments until it lands
 * on today or in the future. Returns a Date, or null if the input is bad.
 */
export function nextRenewalDate(iso: string | null | undefined, period: SubPeriod): Date | null {
  const d = parseLocalDate(iso)
  if (!d) return null
  const today = startOfToday()
  let safety = 0
  while (d < today && safety++ < 600) {
    if (period === 'weekly') d.setDate(d.getDate() + 7)
    else if (period === 'yearly') d.setFullYear(d.getFullYear() + 1)
    else d.setMonth(d.getMonth() + 1)
  }
  return d
}

/**
 * True net worth in CHF: assets minus debts. Debt accounts store a positive
 * balance-owed and are subtracted here, so the headline number is the real
 * "what you'd have if you settled up" figure.
 */
export function netWorthChf(accounts: Account[]): number {
  return accounts.reduce((sum, a) => {
    const v = Number(a.amountCHF) || 0
    return sum + (a.type === 'debt' ? -v : v)
  }, 0)
}

/** Total assets (everything except debt), CHF. */
export function assetsChf(accounts: Account[]): number {
  return accounts.reduce((s, a) => s + (a.type === 'debt' ? 0 : Number(a.amountCHF) || 0), 0)
}

/** Total debt / liabilities (stored as a positive balance-owed), CHF. */
export function debtChf(accounts: Account[]): number {
  return accounts.reduce((s, a) => s + (a.type === 'debt' ? Number(a.amountCHF) || 0 : 0), 0)
}

/** Total NW per account-type for donut + breakdown (debt stored positive). */
export function netWorthByType(accounts: Account[]): Record<AccountType, number> {
  const out: Record<AccountType, number> = { bank: 0, stocks: 0, crypto: 0, debt: 0, other: 0 }
  accounts.forEach(a => {
    out[a.type] = (out[a.type] || 0) + (Number(a.amountCHF) || 0)
  })
  return out
}

/**
 * Months of runway: liquid cash (bank balances) ÷ monthly burn, where burn =
 * subscription cost/month + the last 30 days of spend (outflows only). Returns
 * null when there's no cash or no burn to measure against, so callers hide it.
 */
export function runwayMonths(
  accounts: Account[],
  subscriptions: Subscription[],
  orders: Order[],
  now = new Date(),
): number | null {
  const liquid = accounts.reduce((s, a) => s + (a.type === 'bank' ? Number(a.amountCHF) || 0 : 0), 0)
  if (liquid <= 0) return null
  const subsBurn = subscriptions.reduce((s, sub) => s + monthlyEquivalent(sub), 0)
  const cutoff = now.getTime() - 30 * 86_400_000
  const recentSpend = orders.reduce((s, o) => {
    if (o.direction === 'in' || o.ts < cutoff) return s
    return s + (Number(o.amountCHF) || 0)
  }, 0)
  const burn = subsBurn + recentSpend
  if (burn <= 0.005) return null
  return liquid / burn
}

/** Live CHF value of a crypto holding = quantity × CHF price. CoinGecko returns
 *  CHF directly, so (unlike stocks) there's no FX conversion step. */
export function cryptoValueChf(qty: number, quote: CryptoQuote | undefined): number {
  if (!quote || !isFinite(qty) || qty <= 0) return 0
  return qty * quote.priceCHF
}

/**
 * Estimate WHEN net worth reaches `goalCHF`, by fitting a line to recent
 * net-worth history (last 90 days, falling back to all points) and extrapolating
 * the per-day slope. Returns null when already there, not enough history, or the
 * trend is flat/down (no honest ETA) — so the UI shows a date only when it means
 * something. `now` is ms-epoch (parameterized for deterministic tests).
 */
export function projectGoalDate(history: NwHistoryPoint[], goalCHF: number, now = Date.now()): Date | null {
  if (!goalCHF || goalCHF <= 0 || history.length < 2) return null
  const latest = history[history.length - 1]
  if (latest.v >= goalCHF) return null
  const cutoff = now - 90 * 86_400_000
  const recent = history.filter(p => p.t >= cutoff)
  const pts = recent.length >= 2 ? recent : history
  const first = pts[0]
  const last = pts[pts.length - 1]
  const dtDays = (last.t - first.t) / 86_400_000
  if (dtDays < 1) return null
  const slopePerDay = (last.v - first.v) / dtDays
  if (slopePerDay <= 0) return null
  const daysToGo = (goalCHF - last.v) / slopePerDay
  if (!isFinite(daysToGo) || daysToGo <= 0 || daysToGo > 365 * 30) return null
  return new Date(now + daysToGo * 86_400_000)
}

export function formatActivityDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86_400_000
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  if (dayStart === today) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (dayStart === yesterday) return 'yest'
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  return `${months[d.getMonth()]} ${d.getDate()}`
}

/**
 * Render a renewal date relative to today: "today · Sat Aug 12",
 * "tomorrow · Sun Aug 13", "in 5d · ...", "past · ...".
 */
export function formatRenewal(iso: string | null | undefined): string {
  const parts = relativeDateParts(iso)
  if (!parts) return iso || ''
  const { diffDays, dateLabel } = parts
  let prefix = ''
  if (diffDays < 0) prefix = 'past · '
  else if (diffDays === 0) prefix = 'today · '
  else if (diffDays === 1) prefix = 'tomorrow · '
  else if (diffDays <= 7) prefix = `in ${diffDays}d · `
  return prefix + dateLabel
}

/**
 * Coerce a pasted link (subscription billing page, wishlist storefront, …) into
 * a safe, openable URL. Adds https:// when the scheme is missing; returns null
 * for blanks or anything that isn't http(s).
 */
export function normalizeUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`
  try {
    const u = new URL(withScheme)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

export interface UpcomingBill {
  id: string
  name: string
  /** The amount actually charged at this renewal (per-period, NOT monthly-equiv). */
  amountCHF: number
  period: SubPeriod
  nextDate: Date
  daysUntil: number
}

/**
 * Subscriptions renewing within `withinDays`, soonest first — the "due in N days"
 * bill timeline (Phase 5 feature 1). Pure derivation from existing subs data:
 * the renewal anchor rolled forward to the next cycle via nextRenewalDate, then
 * filtered + sorted. Subs without a renewal date are skipped (can't be placed on
 * the timeline). No new fields / schema.
 */
export function upcomingBills(subs: Subscription[], withinDays = 30): UpcomingBill[] {
  const today = startOfToday().getTime()
  const out: UpcomingBill[] = []
  for (const s of subs) {
    const next = nextRenewalDate(s.renewal, s.period)
    if (!next) continue
    const dayStart = new Date(next.getFullYear(), next.getMonth(), next.getDate()).getTime()
    const daysUntil = Math.round((dayStart - today) / 86_400_000)
    if (daysUntil < 0 || daysUntil > withinDays) continue
    out.push({
      id: s.id,
      name: s.name,
      amountCHF: Number(s.amountCHF) || 0,
      period: s.period,
      nextDate: next,
      daysUntil,
    })
  }
  out.sort((a, b) => a.daysUntil - b.daysUntil)
  return out
}

export interface SubAlert {
  /** Subscription id. */
  id: string
  name: string
  kind: 'trial' | 'hike'
  /** Days until a free trial ends (trial alerts only). */
  daysUntil?: number
  /** Prior / new canonical CHF price (hike alerts only). */
  fromCHF?: number
  toCHF?: number
}

/**
 * Actionable subscription alerts (Phase 5 feature 2):
 *  - trial: a free trial converting to paid within `trialWithinDays` (cancel-in-time nudge)
 *  - hike:  a price that has gone UP, captured within `hikeWithinDays` (so it stops nagging)
 * Trials sort before hikes (more time-sensitive), soonest trial first.
 */
export function subscriptionAlerts(
  subs: Subscription[],
  trialWithinDays = 14,
  hikeWithinDays = 60,
): SubAlert[] {
  const today = startOfToday().getTime()
  const alerts: SubAlert[] = []
  for (const s of subs) {
    const d = parseLocalDate(s.trialEnds)
    if (d) {
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
      const daysUntil = Math.round((dayStart - today) / 86_400_000)
      if (daysUntil >= 0 && daysUntil <= trialWithinDays) {
        alerts.push({ id: s.id, name: s.name, kind: 'trial', daysUntil })
      }
    }
    if (s.previousAmountCHF != null && s.amountCHF > s.previousAmountCHF + 0.005) {
      const recent = s.priceChangedAt == null || today - s.priceChangedAt <= hikeWithinDays * 86_400_000
      if (recent) {
        alerts.push({ id: s.id, name: s.name, kind: 'hike', fromCHF: s.previousAmountCHF, toCHF: s.amountCHF })
      }
    }
  }
  alerts.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'trial' ? -1 : 1
    return (a.daysUntil ?? 0) - (b.daysUntil ?? 0)
  })
  return alerts
}

// -----------------------------------------------------------------------------
// Spending insights + budgets (Phase 5 feature 3) — all over Orders data
// -----------------------------------------------------------------------------

export type SpendCategory =
  | 'groceries' | 'dining' | 'shopping' | 'transport'
  | 'subscriptions' | 'health' | 'tech' | 'other'

/** Keyword heuristic — first match wins, so order matters (broad 'shopping' last). */
const CATEGORY_KEYWORDS: { cat: SpendCategory; words: string[] }[] = [
  { cat: 'groceries',     words: ['grocery', 'groceries', 'supermarket', 'coop', 'migros', 'aldi', 'lidl', 'market'] },
  { cat: 'dining',        words: ['restaurant', 'cafe', 'coffee', 'starbucks', 'bar', 'pizza', 'burger', 'mcdonald', 'kfc', 'uber eats', 'ubereats', 'deliveroo', 'takeaway', 'dinner', 'lunch', 'sushi'] },
  { cat: 'transport',     words: ['uber', 'taxi', 'train', 'sbb', 'flight', 'airline', 'fuel', 'petrol', 'parking', 'metro'] },
  { cat: 'subscriptions', words: ['spotify', 'netflix', 'subscription', 'membership', 'prime', 'disney', 'hbo', 'youtube'] },
  { cat: 'health',        words: ['pharmacy', 'gym', 'supplement', 'protein', 'vitamin', 'doctor', 'dental', 'clinic'] },
  { cat: 'tech',          words: ['apple', 'iphone', 'macbook', 'laptop', 'computer', 'gadget', 'electronics', 'samsung', 'headphone'] },
  { cat: 'shopping',      words: ['amazon', 'zalando', 'clothes', 'clothing', 'shoes', 'nike', 'adidas', 'apparel', 'store', 'zara'] },
]

export function categorize(name: string): SpendCategory {
  const n = (name || '').toLowerCase()
  for (const { cat, words } of CATEGORY_KEYWORDS) {
    if (words.some(w => n.includes(w))) return cat
  }
  return 'other'
}

/** Local-month bucket key for an order's logged time. */
function monthKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export interface MonthlyRecap {
  /** Spend (outflows) this month / last month. Income (direction==='in') is excluded. */
  thisMonthCHF: number
  lastMonthCHF: number
  deltaCHF: number
  deltaPct: number | null
  count: number
  biggest: { name: string; amountCHF: number } | null
  /** Income (inflows) this / last month, and net cash flow (income − spend) this month. */
  thisMonthIncomeCHF: number
  lastMonthIncomeCHF: number
  netCHF: number
}

/**
 * This-month vs last-month cash-flow recap, bucketed by each order's logged
 * time. Outflows (default / direction==='out') count as spend; inflows
 * (direction==='in') count as income. `netCHF` is income − spend this month.
 */
export function monthlyRecap(orders: Order[], now = new Date()): MonthlyRecap {
  const thisKey = monthKeyOf(now)
  const lastKey = monthKeyOf(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  let thisMonthCHF = 0, lastMonthCHF = 0, count = 0
  let thisMonthIncomeCHF = 0, lastMonthIncomeCHF = 0
  let biggest: { name: string; amountCHF: number } | null = null
  for (const o of orders) {
    const k = monthKey(o.ts)
    const amt = Number(o.amountCHF) || 0
    const income = o.direction === 'in'
    if (k === thisKey) {
      if (income) {
        thisMonthIncomeCHF += amt
      } else {
        thisMonthCHF += amt
        count++
        if (amt > 0 && (!biggest || amt > biggest.amountCHF)) biggest = { name: o.name, amountCHF: amt }
      }
    } else if (k === lastKey) {
      if (income) lastMonthIncomeCHF += amt
      else lastMonthCHF += amt
    }
  }
  const deltaCHF = thisMonthCHF - lastMonthCHF
  const deltaPct = lastMonthCHF > 0.005 ? (deltaCHF / lastMonthCHF) * 100 : null
  const netCHF = thisMonthIncomeCHF - thisMonthCHF
  return {
    thisMonthCHF, lastMonthCHF, deltaCHF, deltaPct, count, biggest,
    thisMonthIncomeCHF, lastMonthIncomeCHF, netCHF,
  }
}

export interface CategorySpend {
  category: SpendCategory
  total: number
  pct: number
}

/** This-month spend grouped by heuristic category, largest first. */
export function categoryBreakdown(orders: Order[], now = new Date()): CategorySpend[] {
  const thisKey = monthKeyOf(now)
  const totals = new Map<SpendCategory, number>()
  let sum = 0
  for (const o of orders) {
    if (monthKey(o.ts) !== thisKey) continue
    if (o.direction === 'in') continue   // income isn't spend
    const amt = Number(o.amountCHF) || 0
    if (amt <= 0) continue
    const cat = categorize(o.name)
    totals.set(cat, (totals.get(cat) || 0) + amt)
    sum += amt
  }
  const out: CategorySpend[] = Array.from(totals, ([category, total]) => ({
    category,
    total,
    pct: sum > 0 ? (total / sum) * 100 : 0,
  }))
  out.sort((a, b) => b.total - a.total)
  return out
}

const BUDGET_KEY = 'vitality_finance_budget_v1'

/**
 * Device-local monthly spending budget (canonical CHF). Deliberately kept OUT of
 * Supabase — a single low-stakes number, so no migration. Cross-device sync of
 * the budget is a future 1-column add if wanted.
 */
export function useMonthlyBudget(): { budgetCHF: number | null; setBudgetCHF: (v: number | null) => void } {
  const [budgetCHF, setBudget] = useState<number | null>(null)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(BUDGET_KEY)
      if (raw != null) {
        const n = parseFloat(raw)
        if (isFinite(n) && n > 0) setBudget(n)
      }
    } catch {
      // ignore
    }
  }, [])
  const setBudgetCHF = useCallback((v: number | null) => {
    setBudget(v)
    try {
      if (v == null || !isFinite(v) || v <= 0) window.localStorage.removeItem(BUDGET_KEY)
      else window.localStorage.setItem(BUDGET_KEY, String(v))
    } catch {
      // ignore
    }
  }, [])
  return { budgetCHF, setBudgetCHF }
}

const NW_GOAL_KEY = 'vitality_finance_nw_goal_v1'

/**
 * Device-local net-worth target (canonical CHF) for the hero goal ring. Same
 * localStorage-only rationale as the budget — a single low-stakes number, no
 * Supabase migration. Cross-device sync is a future 1-column add if wanted.
 */
export function useNetWorthGoal(): { goalCHF: number | null; setGoalCHF: (v: number | null) => void } {
  const [goalCHF, setGoal] = useState<number | null>(null)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(NW_GOAL_KEY)
      if (raw != null) {
        const n = parseFloat(raw)
        if (isFinite(n) && n > 0) setGoal(n)
      }
    } catch {
      // ignore
    }
  }, [])
  const setGoalCHF = useCallback((v: number | null) => {
    setGoal(v)
    try {
      if (v == null || !isFinite(v) || v <= 0) window.localStorage.removeItem(NW_GOAL_KEY)
      else window.localStorage.setItem(NW_GOAL_KEY, String(v))
    } catch {
      // ignore
    }
  }, [])
  return { goalCHF, setGoalCHF }
}

// -----------------------------------------------------------------------------
// Storage shim
// -----------------------------------------------------------------------------

function loadLocal(): FinanceState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<FinanceState>
    return { ...DEFAULT_STATE, ...parsed }
  } catch {
    return DEFAULT_STATE
  }
}

function saveLocal(state: FinanceState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full / blocked — silently no-op. State stays in memory.
  }
}

// -----------------------------------------------------------------------------
// Supabase persistence (BUILD13)
//
// Source of truth is Supabase, RLS-scoped to the current user. localStorage is
// kept as a write-through backup + offline fallback, so a Supabase hiccup
// degrades to the old local-only behavior instead of crashing or losing data.
// The in-memory reducers + derived effects are unchanged; only the load/persist
// boundary moved. Writes are diffed against the last-synced snapshot (minimal
// row writes) and fire-and-forget (logged, never thrown) so a failed write
// never blocks the optimistic UI.
// -----------------------------------------------------------------------------

type DB = ReturnType<typeof createClient>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const msToIso = (ms: number | null | undefined): string | null =>
  ms == null ? null : new Date(ms).toISOString()
const isoToMs = (iso: string | null | undefined): number | null =>
  iso == null ? null : new Date(iso).getTime()

// --- row mappers (snake_case DB <-> camelCase domain) ---

function accountToRow(a: Account, userId: string): Record<string, unknown> {
  return {
    id: a.id, user_id: userId, type: a.type, name: a.name,
    amount_chf: a.amountCHF,
    ticker: a.ticker ?? null,
    shares: a.shares ?? null,
    price_history: a.priceHistory ?? [],
  }
}
function rowToAccount(r: any): Account {
  const a: Account = { id: r.id, type: r.type, name: r.name, amountCHF: Number(r.amount_chf) || 0 }
  if (r.ticker) a.ticker = r.ticker
  if (r.shares != null) a.shares = Number(r.shares)
  if (Array.isArray(r.price_history) && r.price_history.length) a.priceHistory = r.price_history
  return a
}

function subToRow(s: Subscription, userId: string): Record<string, unknown> {
  return {
    id: s.id, user_id: userId, name: s.name, amount_chf: s.amountCHF, period: s.period,
    entered_amount: s.enteredAmount ?? null,
    entered_currency: s.enteredCurrency ?? null,
    renewal: s.renewal ?? null,
    from_account_id: s.fromAccountId ?? null,
    auto_deduct: !!s.autoDeduct,
    last_deducted_at: msToIso(s.lastDeductedAt),
    trial_ends: s.trialEnds ?? null,
    previous_amount_chf: s.previousAmountCHF ?? null,
    price_changed_at: msToIso(s.priceChangedAt),
    manage_url: s.manageUrl ?? null,
  }
}
function rowToSub(r: any): Subscription {
  return {
    id: r.id, name: r.name, amountCHF: Number(r.amount_chf) || 0, period: r.period,
    enteredAmount: r.entered_amount != null ? Number(r.entered_amount) : undefined,
    enteredCurrency: r.entered_currency ?? undefined,
    renewal: r.renewal ?? null,
    fromAccountId: r.from_account_id ?? null,
    autoDeduct: !!r.auto_deduct,
    lastDeductedAt: isoToMs(r.last_deducted_at),
    trialEnds: r.trial_ends ?? null,
    previousAmountCHF: r.previous_amount_chf != null ? Number(r.previous_amount_chf) : null,
    priceChangedAt: isoToMs(r.price_changed_at),
    manageUrl: r.manage_url ?? null,
  }
}

function orderToRow(o: Order, userId: string): Record<string, unknown> {
  return {
    id: o.id, user_id: userId, name: o.name, amount_chf: o.amountCHF,
    direction: o.direction ?? 'out',
    entered_amount: o.enteredAmount ?? null,
    entered_currency: o.enteredCurrency ?? null,
    from_account_id: o.fromAccountId ?? null,
    arrival_date: o.date ?? null,
    deducted_at: msToIso(o.deductedAt),
    pct_at_deduction: o.pctAtDeduction ?? null,
    deducted_from_name: o.deductedFromName ?? null,
    created_at: msToIso(o.ts),
  }
}
function rowToOrder(r: any): Order {
  return {
    id: r.id, name: r.name, amountCHF: Number(r.amount_chf) || 0,
    direction: r.direction === 'in' ? 'in' : 'out',
    enteredAmount: r.entered_amount != null ? Number(r.entered_amount) : undefined,
    enteredCurrency: r.entered_currency ?? undefined,
    fromAccountId: r.from_account_id ?? null,
    date: r.arrival_date ?? null,
    ts: isoToMs(r.created_at) ?? Date.now(),
    deductedAt: isoToMs(r.deducted_at),
    pctAtDeduction: r.pct_at_deduction != null ? Number(r.pct_at_deduction) : null,
    deductedFromName: r.deducted_from_name ?? null,
  }
}

function wishToRow(w: WishItem, userId: string): Record<string, unknown> {
  return {
    id: w.id, user_id: userId, name: w.name, amount_chf: w.amountCHF,
    entered_amount: w.enteredAmount ?? null,
    entered_currency: w.enteredCurrency ?? null,
    created_at: msToIso(w.ts),
    url: w.url ?? null,
  }
}
function rowToWish(r: any): WishItem {
  return {
    id: r.id, name: r.name, amountCHF: Number(r.amount_chf) || 0,
    enteredAmount: r.entered_amount != null ? Number(r.entered_amount) : undefined,
    enteredCurrency: r.entered_currency ?? undefined,
    ts: isoToMs(r.created_at) ?? Date.now(),
    url: r.url ?? null,
  }
}

function activityToRow(e: ActivityEntry, userId: string): Record<string, unknown> {
  return {
    id: e.id, user_id: userId, account_type: e.accountType, name: e.name,
    delta_chf: e.deltaCHF, kind: e.kind, created_at: msToIso(e.ts),
  }
}
function rowToActivity(r: any): ActivityEntry {
  return {
    id: r.id, ts: isoToMs(r.created_at) ?? Date.now(),
    accountType: r.account_type, name: r.name,
    deltaCHF: Number(r.delta_chf) || 0, kind: r.kind,
  }
}

function nwToRow(p: NwHistoryPoint, userId: string): Record<string, unknown> {
  return { user_id: userId, value_chf: p.v, captured_at: msToIso(p.t) }
}
function rowToNw(r: any): NwHistoryPoint {
  return { t: isoToMs(r.captured_at) ?? Date.now(), v: Number(r.value_chf) || 0 }
}

function hasAnyData(s: FinanceState): boolean {
  return (
    s.accounts.length > 0 || s.subscriptions.length > 0 || s.orders.length > 0 ||
    s.wishlist.length > 0 || s.netWorthHistory.length > 0 || s.activity.length > 0
  )
}

/** Map an old `prefix_uuid` (or legacy) id to a bare uuid for the uuid columns. */
function toUuid(oldId: string): string {
  const stripped = oldId.replace(/^[a-z]+_/i, '')
  return UUID_RE.test(stripped) ? stripped : newUuid()
}

/**
 * Load the whole finance state from Supabase. Returns null if the core tables
 * error (e.g. migration not applied) so the caller can fall back to localStorage.
 */
async function loadFromSupabase(
  db: DB,
  userId: string,
): Promise<{ state: FinanceState; imported: boolean; isEmpty: boolean } | null> {
  try {
    const [prefs, accounts, subs, orders, wishlist, activity, nwHist] = await Promise.all([
      db.from('finance_prefs').select('*').eq('user_id', userId).maybeSingle(),
      db.from('finance_accounts').select('*').eq('user_id', userId),
      db.from('finance_subscriptions').select('*').eq('user_id', userId),
      db.from('finance_orders').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      db.from('finance_wishlist').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      db.from('finance_activity').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(ACTIVITY_MAX),
      db.from('finance_net_worth_history').select('*').eq('user_id', userId).order('captured_at', { ascending: false }).limit(NW_HISTORY_MAX),
    ])
    if (accounts.error || subs.error || orders.error || wishlist.error) return null

    const state: FinanceState = {
      version: 1,
      currency: (prefs.data?.currency as Currency) || 'CHF',
      activeTab: 'net',
      accounts: (accounts.data || []).map(rowToAccount),
      subscriptions: (subs.data || []).map(rowToSub),
      orders: (orders.data || []).map(rowToOrder),
      wishlist: (wishlist.data || []).map(rowToWish),
      activity: (activity.data || []).map(rowToActivity).reverse(),   // blob wants newest-last
      netWorthHistory: (nwHist.data || []).map(rowToNw).reverse(),     // chart wants oldest-first
    }
    return { state, imported: !!prefs.data?.imported_local_at, isEmpty: !hasAnyData(state) }
  } catch {
    return null
  }
}

/**
 * One-time localStorage -> Supabase import. Remaps prefixed ids to bare uuids
 * (rewriting fromAccountId refs through the same map) and upserts everything,
 * then stamps finance_prefs.imported_local_at. Returns the remapped state to
 * adopt in memory. Idempotent on the id-keyed tables (upsert) so a double-run
 * (e.g. two tabs) won't duplicate.
 */
async function importLocalToSupabase(db: DB, userId: string, local: FinanceState): Promise<FinanceState> {
  const idMap = new Map<string, string>()
  const remap = (id: string): string => {
    let v = idMap.get(id)
    if (!v) { v = toUuid(id); idMap.set(id, v) }
    return v
  }
  const accounts = local.accounts.map(a => ({ ...a, id: remap(a.id) }))
  const subscriptions = local.subscriptions.map(s => ({ ...s, id: remap(s.id), fromAccountId: s.fromAccountId ? remap(s.fromAccountId) : (s.fromAccountId ?? null) }))
  const orders = local.orders.map(o => ({ ...o, id: remap(o.id), fromAccountId: o.fromAccountId ? remap(o.fromAccountId) : (o.fromAccountId ?? null) }))
  const wishlist = local.wishlist.map(w => ({ ...w, id: remap(w.id) }))
  const activity = local.activity.map(e => ({ ...e, id: remap(e.id) }))
  const remapped: FinanceState = { ...local, activeTab: 'net', accounts, subscriptions, orders, wishlist, activity }

  try {
    if (accounts.length) await db.from('finance_accounts').upsert(accounts.map(a => accountToRow(a, userId)))
    if (subscriptions.length) await db.from('finance_subscriptions').upsert(subscriptions.map(s => subToRow(s, userId)))
    if (orders.length) await db.from('finance_orders').upsert(orders.map(o => orderToRow(o, userId)))
    if (wishlist.length) await db.from('finance_wishlist').upsert(wishlist.map(w => wishToRow(w, userId)))
    if (activity.length) await db.from('finance_activity').upsert(activity.map(e => activityToRow(e, userId)))
    if (local.netWorthHistory.length) await db.from('finance_net_worth_history').insert(local.netWorthHistory.map(p => nwToRow(p, userId)))
    await db.from('finance_prefs').upsert({ user_id: userId, currency: local.currency, imported_local_at: new Date().toISOString() })
  } catch (e) {
    console.error('[finance] localStorage import failed', e)
  }
  return remapped
}

function diffById<T extends { id: string }>(
  prev: T[],
  curr: T[],
  toRow: (e: T) => Record<string, unknown>,
): { upserts: Record<string, unknown>[]; deleteIds: string[] } {
  const prevById = new Map(prev.map(e => [e.id, e]))
  const currIds = new Set(curr.map(e => e.id))
  const upserts: Record<string, unknown>[] = []
  for (const e of curr) {
    const p = prevById.get(e.id)
    if (!p || JSON.stringify(toRow(e)) !== JSON.stringify(toRow(p))) upserts.push(toRow(e))
  }
  const deleteIds = prev.filter(e => !currIds.has(e.id)).map(e => e.id)
  return { upserts, deleteIds }
}

async function syncTable(
  db: DB,
  table: string,
  diff: { upserts: Record<string, unknown>[]; deleteIds: string[] },
): Promise<void> {
  if (diff.upserts.length) await db.from(table).upsert(diff.upserts)
  if (diff.deleteIds.length) await db.from(table).delete().in('id', diff.deleteIds)
}

/** Diff `prev` -> `curr` and write only the deltas. Fire-and-forget (logged). */
async function syncToSupabase(db: DB, userId: string, prev: FinanceState, curr: FinanceState): Promise<void> {
  try {
    if (prev.currency !== curr.currency) {
      await db.from('finance_prefs').upsert({ user_id: userId, currency: curr.currency })
    }
    await syncTable(db, 'finance_accounts', diffById(prev.accounts, curr.accounts, a => accountToRow(a, userId)))
    await syncTable(db, 'finance_subscriptions', diffById(prev.subscriptions, curr.subscriptions, s => subToRow(s, userId)))
    await syncTable(db, 'finance_orders', diffById(prev.orders, curr.orders, o => orderToRow(o, userId)))
    await syncTable(db, 'finance_wishlist', diffById(prev.wishlist, curr.wishlist, w => wishToRow(w, userId)))

    // Append-only logs: insert new rows only. Rows trimmed from the capped blob
    // are harmless to leave in the DB — the load query re-caps on read.
    const prevActIds = new Set(prev.activity.map(e => e.id))
    const newAct = curr.activity.filter(e => !prevActIds.has(e.id))
    if (newAct.length) await db.from('finance_activity').upsert(newAct.map(e => activityToRow(e, userId)))

    const prevMaxT = prev.netWorthHistory.length ? prev.netWorthHistory[prev.netWorthHistory.length - 1].t : 0
    const newNw = curr.netWorthHistory.filter(p => p.t > prevMaxT)
    if (newNw.length) await db.from('finance_net_worth_history').insert(newNw.map(p => nwToRow(p, userId)))
  } catch (e) {
    console.error('[finance] Supabase sync failed', e)
  }
}

/** Internal persistence helpers exposed for unit tests only — not for views. */
export const __financeInternals = {
  accountToRow, rowToAccount, subToRow, rowToSub, orderToRow, rowToOrder,
  wishToRow, rowToWish, activityToRow, rowToActivity, nwToRow, rowToNw,
  toUuid, diffById,
}

// -----------------------------------------------------------------------------
// FX rates
// -----------------------------------------------------------------------------

/**
 * Pull CHF-relative rates once on mount. Free public endpoint, no key.
 * Falls back to all-1 if the network errors — UI still functions, just
 * displays all currencies as if at parity. BUILD13 will move this to a
 * server-side cached call so the user doesn't refetch on every page load.
 */
function useExchangeRates(): { rates: ExchangeRates; loaded: boolean } {
  const [rates, setRates] = useState<ExchangeRates>(DEFAULT_RATES)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch('https://open.er-api.com/v6/latest/CHF')
      .then(r => r.json())
      .then((data: { rates?: Record<string, number> }) => {
        if (cancelled || !data?.rates) return
        setRates({
          CHF: 1,
          USD: data.rates.USD || 1,
          EUR: data.rates.EUR || 1,
          GBP: data.rates.GBP || 1,
        })
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return { rates, loaded }
}

// -----------------------------------------------------------------------------
// Stock quotes (live prices, shared-cache pattern)
// -----------------------------------------------------------------------------

export type QuoteMap = Record<string, StockQuote>

const QUOTE_REFRESH_MS = 15 * 60 * 1000  // matches server-side cache TTL

/**
 * Fetch live USD prices for the union of tickers in `accounts`. The route
 * handler (`/api/finance/quote`) is what actually talks to Finnhub — and
 * its Next.js fetch cache is shared across all users of the deployment,
 * so multiple users holding VTI only pay for one Finnhub call every 15 min.
 *
 * Re-runs on a 15-min interval (aligned with the server cache TTL) and
 * whenever the set of held tickers changes. Falls back to silent no-op
 * when the server returns 503 (FINNHUB_API_KEY not set in env) — the UI
 * still functions, just without live prices.
 */
function useStockQuotes(accounts: Account[]): {
  quotes: QuoteMap
  loaded: boolean
  refresh: () => void
} {
  const [quotes, setQuotes] = useState<QuoteMap>({})
  const [loaded, setLoaded] = useState(false)

  // Stable key: distinct tickers, sorted. Lets useEffect depend on the
  // ticker set without re-running on every accounts mutation.
  const tickerKey = useMemo(() => {
    const set = new Set<string>()
    accounts.forEach(a => {
      if (a.type === 'stocks' && a.ticker && (a.shares ?? 0) > 0) {
        set.add(a.ticker.toUpperCase())
      }
    })
    return Array.from(set).sort().join(',')
  }, [accounts])

  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    if (!tickerKey) {
      setQuotes({})
      setLoaded(true)
      return
    }
    let cancelled = false
    fetch(`/api/finance/quote?tickers=${encodeURIComponent(tickerKey)}`)
      .then(r => r.json())
      .then((data: { quotes?: QuoteMap; error?: string }) => {
        if (cancelled) return
        // Replace (don't merge): the server returns the full set for the current
        // ticker set, so this prunes quotes for tickers the user has removed.
        setQuotes(data.quotes ?? {})
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [tickerKey, refreshTick])

  // Auto-refresh aligned with the server cache TTL. No-op when nothing held.
  useEffect(() => {
    if (!tickerKey) return
    const id = setInterval(() => setRefreshTick(t => t + 1), QUOTE_REFRESH_MS)
    return () => clearInterval(id)
  }, [tickerKey])

  const refresh = useCallback(() => setRefreshTick(t => t + 1), [])

  return { quotes, loaded, refresh }
}

/**
 * Convert a holding (shares × USD price) to CHF using current FX.
 * Returns 0 if quote is missing — caller decides how to render that
 * (we show "—" in the UI rather than counting it as zero in the donut).
 */
export function holdingValueChf(
  shares: number,
  quote: StockQuote | undefined,
  rates: ExchangeRates,
): number {
  if (!quote || !isFinite(shares) || shares <= 0) return 0
  const usdToChf = 1 / (rates.USD || 1)
  return shares * quote.priceUSD * usdToChf
}

// -----------------------------------------------------------------------------
// Crypto quotes (live prices via CoinGecko, same shared-cache pattern as stocks)
// -----------------------------------------------------------------------------

export type CryptoQuoteMap = Record<string, CryptoQuote>

const CRYPTO_REFRESH_MS = 15 * 60 * 1000  // matches the server-side cache TTL

/**
 * Fetch live CHF prices for the union of coin ids held as crypto holdings
 * (type 'crypto' with a coin id in `ticker` + a positive quantity in `shares`).
 * The route handler (`/api/finance/crypto-quote`) talks to CoinGecko and its
 * Next.js fetch cache is shared across the deployment — so many users holding
 * BTC only cost one CoinGecko call per 15 min. Mirrors useStockQuotes exactly.
 */
function useCryptoQuotes(accounts: Account[]): {
  quotes: CryptoQuoteMap
  loaded: boolean
  refresh: () => void
} {
  const [quotes, setQuotes] = useState<CryptoQuoteMap>({})
  const [loaded, setLoaded] = useState(false)

  // Stable key: distinct coin ids, sorted. Re-fetches only when the held set changes.
  const idKey = useMemo(() => {
    const set = new Set<string>()
    accounts.forEach(a => {
      if (a.type === 'crypto' && a.ticker && (a.shares ?? 0) > 0) set.add(a.ticker.toLowerCase())
    })
    return Array.from(set).sort().join(',')
  }, [accounts])

  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    if (!idKey) {
      setQuotes({})
      setLoaded(true)
      return
    }
    let cancelled = false
    fetch(`/api/finance/crypto-quote?ids=${encodeURIComponent(idKey)}`)
      .then(r => r.json())
      .then((data: { quotes?: CryptoQuoteMap }) => {
        if (cancelled) return
        // Replace (don't merge) so removed coins are pruned.
        setQuotes(data.quotes ?? {})
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [idKey, refreshTick])

  useEffect(() => {
    if (!idKey) return
    const id = setInterval(() => setRefreshTick(t => t + 1), CRYPTO_REFRESH_MS)
    return () => clearInterval(id)
  }, [idKey])

  const refresh = useCallback(() => setRefreshTick(t => t + 1), [])

  return { quotes, loaded, refresh }
}

// -----------------------------------------------------------------------------
// Mutators (pure — produce next state from current)
// -----------------------------------------------------------------------------

function pushActivity(state: FinanceState, entry: Omit<ActivityEntry, 'id' | 'ts'>): ActivityEntry[] {
  const next = [...state.activity, { ...entry, id: genId('act'), ts: Date.now() }]
  return next.length > ACTIVITY_MAX ? next.slice(next.length - ACTIVITY_MAX) : next
}

/**
 * Keep orders bounded: trim oldest *deducted* (completed) orders first, never
 * dropping orders still in flight. No-op until ORDERS_MAX is exceeded.
 */
function capOrders(orders: Order[]): Order[] {
  if (orders.length <= ORDERS_MAX) return orders
  const undeducted = orders.filter(o => !o.deductedAt)
  const deducted = orders.filter(o => o.deductedAt)
  const keepDeductedCount = Math.max(0, ORDERS_MAX - undeducted.length)
  const keepDeducted = new Set(deducted.slice(deducted.length - keepDeductedCount))
  return orders.filter(o => !o.deductedAt || keepDeducted.has(o))
}

/**
 * Append a snapshot to NW history. Skips writing if the new value is
 * unchanged from the last point (avoids cluttering the chart with
 * identical points on every render).
 */
function pushNwSnapshot(history: NwHistoryPoint[], total: number): NwHistoryPoint[] {
  const last = history[history.length - 1]
  if (last && Math.abs((last.v || 0) - total) < 0.005) return history
  const next = [...history, { t: Date.now(), v: total }]
  return next.length > NW_HISTORY_MAX ? next.slice(next.length - NW_HISTORY_MAX) : next
}

/**
 * Append a USD price point to a holding's history. Throttled by
 * PRICE_SNAPSHOT_INTERVAL_MS so quote refreshes every 15 min don't
 * produce 96 points/day per ticker.
 */
function pushPriceSnapshot(history: PricePoint[] | undefined, priceUSD: number): PricePoint[] {
  const list = history ?? []
  const last = list[list.length - 1]
  const now = Date.now()
  if (last && now - last.t < PRICE_SNAPSHOT_INTERVAL_MS) return list
  const next = [...list, { t: now, p: priceUSD }]
  return next.length > PRICE_HISTORY_MAX ? next.slice(next.length - PRICE_HISTORY_MAX) : next
}

/** Return only the points within the last `days` days, in chronological order. */
export function priceHistoryWithin(history: PricePoint[] | undefined, days: number): PricePoint[] {
  if (!history?.length) return []
  const cutoff = Date.now() - days * 86_400_000
  return history.filter(p => p.t >= cutoff)
}

const pad2 = (n: number) => String(n).padStart(2, '0')
/** Local-time YYYY-MM-DD for a Date (never toISOString — dodges the UTC drift bug). */
function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * Self-maintaining balances: debit matured auto-deduct subscriptions.
 *
 * For every subscription with `autoDeduct` + a `fromAccountId` whose renewal date
 * has arrived (and that occurrence hasn't already been deducted), debit the
 * account by the sub's amount, log it to the activity feed, stamp `lastDeductedAt`,
 * and roll `renewal` forward to the next FUTURE occurrence. Deducts at most one
 * cycle per pass per sub (a months-away gap rolls forward without a catch-up
 * storm — safe under-charge, never an overdraw from a stale date). Idempotent:
 * after a deduct, `lastDeductedAt >= occurrence` and `renewal` is in the future,
 * so re-running does nothing. Pure — produces the next state.
 */
export function processRenewals(state: FinanceState, now = new Date()): FinanceState {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  let accounts = state.accounts
  let activity = state.activity
  let changed = false

  const subscriptions = state.subscriptions.map(sub => {
    if (!sub.autoDeduct || !sub.fromAccountId) return sub
    const amt = Number(sub.amountCHF) || 0
    if (amt <= 0) return sub
    const renewalD = parseLocalDate(sub.renewal)
    if (!renewalD) return sub
    const renewalStart = new Date(renewalD.getFullYear(), renewalD.getMonth(), renewalD.getDate()).getTime()
    if (renewalStart > todayStart) return sub                       // not due yet
    if (sub.lastDeductedAt != null && sub.lastDeductedAt >= renewalStart) return sub  // already done
    const acct = accounts.find(a => a.id === sub.fromAccountId)
    if (!acct) return sub

    const nextAmount = Math.max(0, acct.amountCHF - amt)
    const delta = nextAmount - acct.amountCHF
    accounts = accounts.map(a => (a.id === acct.id ? { ...a, amountCHF: nextAmount } : a))
    activity = pushActivity({ ...state, activity }, { accountType: acct.type, name: sub.name, deltaCHF: delta, kind: 'edit' })
    changed = true

    // Roll the renewal anchor forward to the next occurrence strictly after today.
    const adv = new Date(renewalD)
    let guard = 0
    do {
      if (sub.period === 'weekly') adv.setDate(adv.getDate() + 7)
      else if (sub.period === 'yearly') adv.setFullYear(adv.getFullYear() + 1)
      else adv.setMonth(adv.getMonth() + 1)
    } while (new Date(adv.getFullYear(), adv.getMonth(), adv.getDate()).getTime() <= todayStart && guard++ < 600)

    return { ...sub, renewal: toIsoDate(adv), lastDeductedAt: now.getTime() }
  })

  if (!changed) return state
  return { ...state, accounts, subscriptions, activity }
}

// -----------------------------------------------------------------------------
// Public hook
// -----------------------------------------------------------------------------

export interface FinanceActions {
  setCurrency: (c: Currency) => void
  setActiveTab: (t: TabKey) => void

  addAccount: (type: AccountType, name: string, displayAmount: number) => void
  renameAccount: (id: string, name: string) => void
  /** Setting amount in DISPLAY currency; converted to CHF here. */
  setAccountAmount: (id: string, displayAmount: number) => void
  deleteAccount: (id: string) => void

  /**
   * Add a stock holding. Name defaults to the ticker (user can rename).
   * The CHF value is filled in by the quote-sync effect on next price tick;
   * the row renders with a "—" placeholder until then.
   */
  addHolding: (ticker: string, shares: number) => void
  /**
   * Add a live crypto holding. `coinId` is the CoinGecko id (e.g. "bitcoin"),
   * `symbol` the display ticker (e.g. "BTC"), `qty` the coin quantity. CHF
   * value is filled by the crypto quote-sync effect on the next price tick.
   */
  addCryptoHolding: (coinId: string, symbol: string, qty: number) => void
  /** Update share count for an existing holding row. */
  setHoldingShares: (id: string, shares: number) => void

  addSubscription: (input: {
    name: string
    displayAmount: number
    period: SubPeriod
    renewal?: string | null
    fromAccountId?: string | null
    autoDeduct?: boolean
  }) => void
  updateSubscription: (id: string, patch: Partial<Subscription> & { displayAmount?: number }) => void
  deleteSubscription: (id: string) => void

  addOrder: (input: {
    name: string
    displayAmount: number
    fromAccountId?: string | null
    date?: string | null
    /** 'in' = income (log-only, never deducts), 'out' = spend (default). */
    direction?: 'in' | 'out'
    /**
     * "Bought today" path — if true and fromAccountId is set, the order is
     * created already deducted (account debited, deductedAt/pctAtDeduction
     * captured) in a single atomic state update. Avoids the addOrder →
     * deductOrder race where the id isn't returned to the caller.
     */
    immediate?: boolean
  }) => void
  deleteOrder: (id: string) => void
  deductOrder: (id: string) => void
  undoDeductOrder: (id: string) => void

  addWish: (name: string, displayAmount: number, url?: string | null) => void
  setWishUrl: (id: string, url: string | null) => void
  deleteWish: (id: string) => void
}

export interface UseFinance {
  ready: boolean
  state: FinanceState
  rates: ExchangeRates
  ratesLoaded: boolean
  actions: FinanceActions
  /** Helper that closes over current currency + rates. */
  fmt: (chf: number) => string
  /** Live total NW in CHF. */
  netWorth: number
  /** Live stock quotes keyed by ticker. Empty until /api/finance/quote returns. */
  quotes: QuoteMap
  /** Force a quote refresh (e.g. manual refresh button). */
  refreshQuotes: () => void
  /** Live crypto quotes keyed by CoinGecko coin id. Empty until /api/finance/crypto-quote returns. */
  cryptoQuotes: CryptoQuoteMap
  /** Force a crypto quote refresh. */
  refreshCryptoQuotes: () => void
}

export function useFinanceState(): UseFinance {
  const [state, setState] = useState<FinanceState>(DEFAULT_STATE)
  const [ready, setReady] = useState(false)
  const { rates, loaded: ratesLoaded } = useExchangeRates()
  const { quotes, refresh: refreshQuotes } = useStockQuotes(state.accounts)
  const { quotes: cryptoQuotes, refresh: refreshCryptoQuotes } = useCryptoQuotes(state.accounts)

  // Supabase persistence plumbing (BUILD13). Client + user id resolve once on
  // mount; lastSyncedRef holds the snapshot each write is diffed against.
  const dbRef = useRef<DB | null>(null)
  const userIdRef = useRef<string | null>(null)
  const lastSyncedRef = useRef<FinanceState | null>(null)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mount: load from Supabase (RLS-scoped). Falls back to localStorage if
  // Supabase is unreachable, and runs the one-time localStorage import the
  // first time a logged-in user with local data hits the empty cloud store.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      let loaded: FinanceState = DEFAULT_STATE
      try {
        const db = createClient()
        dbRef.current = db
        const { data: userData } = await db.auth.getUser()
        const userId = userData.user?.id ?? null
        userIdRef.current = userId

        if (userId) {
          const res = await loadFromSupabase(db, userId)
          if (res && res.imported) {
            loaded = res.state
          } else if (res && res.isEmpty) {
            const local = loadLocal()
            if (hasAnyData(local)) {
              loaded = await importLocalToSupabase(db, userId, local)
            } else {
              loaded = res.state
              // Stamp imported so we don't re-probe localStorage on every load.
              void db.from('finance_prefs')
                .upsert({ user_id: userId, currency: loaded.currency, imported_local_at: new Date().toISOString() })
                .then(() => {}, () => {})
            }
          } else if (res) {
            loaded = res.state
          } else {
            // Supabase errored (e.g. migration not applied) — degrade to local.
            loaded = loadLocal()
          }
        } else {
          // No session — keep working off localStorage.
          loaded = loadLocal()
        }
      } catch (e) {
        console.error('[finance] load failed, using localStorage', e)
        loaded = loadLocal()
      }
      if (cancelled) return
      lastSyncedRef.current = loaded
      setState(loaded)
      setReady(true)
    })()
    return () => { cancelled = true }
  }, [])

  // Self-maintaining balances: once after load, debit any matured auto-deduct
  // subscriptions. Runs as a post-ready state change so the normal diff-sync
  // persists the deduction (idempotent, so a re-run can't double-charge).
  const renewalsRun = useRef(false)
  useEffect(() => {
    if (!ready || renewalsRun.current) return
    renewalsRun.current = true
    setState(s => processRenewals(s))
  }, [ready])

  // Persist on every state change post-hydration: localStorage backup
  // immediately, Supabase sync debounced + diffed against the last snapshot.
  const hasHydrated = useRef(false)
  useEffect(() => {
    if (!ready) return
    if (!hasHydrated.current) {
      hasHydrated.current = true
      return
    }
    saveLocal(state)
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      const db = dbRef.current
      const userId = userIdRef.current
      const prev = lastSyncedRef.current
      if (db && userId && prev) void syncToSupabase(db, userId, prev, state)
      lastSyncedRef.current = state
    }, 600)
  }, [state, ready])

  // Sync holding amountCHF whenever fresh quotes arrive or FX rates change.
  // The stored amountCHF is the cache that lets the donut + NW chart render
  // immediately on hydration, before /api/finance/quote returns. When a real
  // quote lands we write the computed value back so the chart's history is
  // anchored in market reality, not stale data.
  //
  // We also append a USD price snapshot to the holding's priceHistory at most
  // every PRICE_SNAPSHOT_INTERVAL_MS (6h). This is what feeds the sparkline
  // on each HoldingRow — kept in USD so currency toggles don't pollute the
  // series.
  useEffect(() => {
    if (!ready) return
    setState(s => {
      let changed = false
      const accounts = s.accounts.map(a => {
        if (a.type !== 'stocks' || !a.ticker || !(a.shares ?? 0)) return a
        const q = quotes[a.ticker.toUpperCase()]
        if (!q) return a
        const nextChf = holdingValueChf(a.shares ?? 0, q, rates)
        const nextHistory = pushPriceSnapshot(a.priceHistory, q.priceUSD)
        const chfChanged = Math.abs(nextChf - a.amountCHF) >= 0.005
        const historyChanged = nextHistory !== a.priceHistory
        if (!chfChanged && !historyChanged) return a
        changed = true
        return {
          ...a,
          amountCHF: chfChanged ? nextChf : a.amountCHF,
          priceHistory: historyChanged ? nextHistory : a.priceHistory,
        }
      })
      return changed ? { ...s, accounts } : s
    })
  }, [quotes, rates, ready])

  // Crypto holdings mirror the stock sync, pointed at CoinGecko prices. Value
  // comes back in CHF directly (no FX step), and the sparkline series stores
  // the CHF price. Same 6h throttle on the price-history snapshot.
  useEffect(() => {
    if (!ready) return
    setState(s => {
      let changed = false
      const accounts = s.accounts.map(a => {
        if (a.type !== 'crypto' || !a.ticker || !(a.shares ?? 0)) return a
        const q = cryptoQuotes[a.ticker.toLowerCase()]
        if (!q) return a
        const nextChf = cryptoValueChf(a.shares ?? 0, q)
        const nextHistory = pushPriceSnapshot(a.priceHistory, q.priceCHF)
        const chfChanged = Math.abs(nextChf - a.amountCHF) >= 0.005
        const historyChanged = nextHistory !== a.priceHistory
        if (!chfChanged && !historyChanged) return a
        changed = true
        return {
          ...a,
          amountCHF: chfChanged ? nextChf : a.amountCHF,
          priceHistory: historyChanged ? nextHistory : a.priceHistory,
        }
      })
      return changed ? { ...s, accounts } : s
    })
  }, [cryptoQuotes, ready])

  // Snapshot NW history whenever the running CHF total changes meaningfully.
  // Lives here (not in mutators) so currency-only changes never log a point.
  const netWorth = useMemo(() => netWorthChf(state.accounts), [state.accounts])
  useEffect(() => {
    if (!ready) return
    setState(s => {
      const nextHist = pushNwSnapshot(s.netWorthHistory, netWorth)
      if (nextHist === s.netWorthHistory) return s
      return { ...s, netWorthHistory: nextHist }
    })
  }, [netWorth, ready])

  const fmt = useCallback((chf: number) => fmtMoney(chf, state.currency, rates), [state.currency, rates])

  const actions: FinanceActions = useMemo(
    () => ({
      setCurrency: c =>
        setState(s => ({ ...s, currency: c })),

      setActiveTab: t =>
        setState(s => ({ ...s, activeTab: t })),

      addAccount: (type, name, displayAmount) =>
        setState(s => {
          const trimmed = name.trim()
          if (!trimmed || !isFinite(displayAmount)) return s
          const amountCHF = displayToChf(displayAmount, s.currency, rates)
          const acct: Account = { id: genId('acc'), type, name: trimmed, amountCHF }
          return {
            ...s,
            accounts: [...s.accounts, acct],
            activity: pushActivity(s, { accountType: type, name: trimmed, deltaCHF: amountCHF, kind: 'add' }),
          }
        }),

      renameAccount: (id, name) =>
        setState(s => ({
          ...s,
          accounts: s.accounts.map(a => (a.id === id ? { ...a, name: name.trim() || a.name } : a)),
        })),

      setAccountAmount: (id, displayAmount) =>
        setState(s => {
          const acct = s.accounts.find(a => a.id === id)
          if (!acct || !isFinite(displayAmount)) return s
          const nextAmountCHF = Math.max(0, displayToChf(displayAmount, s.currency, rates))
          const delta = nextAmountCHF - acct.amountCHF
          const accounts = s.accounts.map(a => (a.id === id ? { ...a, amountCHF: nextAmountCHF } : a))
          if (Math.abs(delta) < 0.005) return { ...s, accounts }
          return {
            ...s,
            accounts,
            activity: pushActivity(s, {
              accountType: acct.type,
              name: acct.name,
              deltaCHF: delta,
              kind: 'edit',
            }),
          }
        }),

      deleteAccount: id =>
        setState(s => {
          const acct = s.accounts.find(a => a.id === id)
          if (!acct) return s
          return {
            ...s,
            accounts: s.accounts.filter(a => a.id !== id),
            activity: pushActivity(s, {
              accountType: acct.type,
              name: acct.name,
              deltaCHF: -acct.amountCHF,
              kind: 'delete',
            }),
          }
        }),

      addHolding: (ticker, shares) =>
        setState(s => {
          const t = ticker.trim().toUpperCase()
          if (!t || !isFinite(shares) || shares <= 0) return s
          // Optimistically value at 0 — the quote-sync effect fills it in
          // once /api/finance/quote returns. We deliberately skip the
          // activity log entry (would show "+ $0" until the quote lands,
          // and we don't want price ticks polluting the feed either).
          const acct: Account = {
            id: genId('acc'),
            type: 'stocks',
            name: t,
            ticker: t,
            shares,
            amountCHF: 0,
          }
          return { ...s, accounts: [...s.accounts, acct] }
        }),

      addCryptoHolding: (coinId, symbol, qty) =>
        setState(s => {
          const id = coinId.trim().toLowerCase()
          const sym = symbol.trim().toUpperCase()
          if (!id || !sym || !isFinite(qty) || qty <= 0) return s
          // Valued at 0 until the crypto quote-sync effect fills it in (same
          // pattern as a stock holding — no activity entry to avoid "+ 0" noise).
          const acct: Account = {
            id: genId('acc'),
            type: 'crypto',
            name: sym,
            ticker: id,
            shares: qty,
            amountCHF: 0,
          }
          return { ...s, accounts: [...s.accounts, acct] }
        }),

      setHoldingShares: (id, shares) =>
        setState(s => {
          const acct = s.accounts.find(a => a.id === id)
          if (!acct || acct.type !== 'stocks' || !acct.ticker) return s
          if (!isFinite(shares) || shares < 0) return s
          // amountCHF gets recomputed by the quote-sync effect on next tick.
          return {
            ...s,
            accounts: s.accounts.map(a => (a.id === id ? { ...a, shares } : a)),
          }
        }),

      addSubscription: input =>
        setState(s => {
          const name = input.name.trim()
          if (!name || !isFinite(input.displayAmount)) return s
          const amountCHF = displayToChf(input.displayAmount, s.currency, rates)
          const sub: Subscription = {
            id: genId('sub'),
            name,
            amountCHF,
            period: input.period,
            enteredAmount: input.displayAmount,
            enteredCurrency: s.currency,
            renewal: input.renewal ?? null,
            fromAccountId: input.fromAccountId ?? null,
            autoDeduct: !!input.autoDeduct,
            lastDeductedAt: null,
          }
          return { ...s, subscriptions: [...s.subscriptions, sub] }
        }),

      updateSubscription: (id, patch) =>
        setState(s => {
          const sub = s.subscriptions.find(x => x.id === id)
          if (!sub) return s
          // Pull the synthetic displayAmount out so it never lands on the stored
          // Subscription (which has no such field) — patchRest is a clean Partial.
          const { displayAmount, ...patchRest } = patch
          let amountCHF = sub.amountCHF
          if (typeof displayAmount === 'number' && isFinite(displayAmount)) {
            const ccy = patchRest.enteredCurrency || sub.enteredCurrency || s.currency
            amountCHF = displayToChf(displayAmount, ccy, rates)
          }
          // Price-hike tracking: when the canonical amount actually moves, stamp
          // the prior price + when it changed so the alerts can surface "X went up".
          const priceMoved = Math.abs(amountCHF - sub.amountCHF) > 0.005
          const next: Subscription = {
            ...sub,
            ...patchRest,
            amountCHF,
            enteredAmount: displayAmount ?? sub.enteredAmount,
            previousAmountCHF: priceMoved ? sub.amountCHF : sub.previousAmountCHF,
            priceChangedAt: priceMoved ? Date.now() : sub.priceChangedAt,
          }
          return { ...s, subscriptions: s.subscriptions.map(x => (x.id === id ? next : x)) }
        }),

      deleteSubscription: id =>
        setState(s => ({ ...s, subscriptions: s.subscriptions.filter(x => x.id !== id) })),

      addOrder: input =>
        setState(s => {
          const name = input.name.trim()
          if (!name || !isFinite(input.displayAmount)) return s
          const amountCHF = displayToChf(input.displayAmount, s.currency, rates)
          const direction = input.direction === 'in' ? 'in' : 'out'

          let accounts = s.accounts
          let activity = s.activity
          let deductedAt: number | null = null
          let pctAtDeduction: number | null = null
          let deductedFromName: string | null = null

          // Income never deducts from an account — it's a log-only inflow.
          if (direction !== 'in' && input.immediate && input.fromAccountId) {
            const acct = s.accounts.find(a => a.id === input.fromAccountId)
            if (acct) {
              const grand = netWorthChf(s.accounts)
              pctAtDeduction = grand > 0 ? (amountCHF / grand) * 100 : 0
              deductedAt = Date.now()
              deductedFromName = acct.name
              const nextAmount = Math.max(0, acct.amountCHF - amountCHF)
              const delta = nextAmount - acct.amountCHF
              accounts = s.accounts.map(a => (a.id === acct.id ? { ...a, amountCHF: nextAmount } : a))
              activity = pushActivity(
                { ...s, activity: s.activity },
                { accountType: acct.type, name: acct.name, deltaCHF: delta, kind: 'edit' },
              )
            }
          }

          const order: Order = {
            id: genId('ord'),
            name,
            amountCHF,
            direction,
            enteredAmount: input.displayAmount,
            enteredCurrency: s.currency,
            fromAccountId: direction === 'in' ? null : (input.fromAccountId ?? null),
            date: input.date ?? null,
            ts: Date.now(),
            deductedAt,
            pctAtDeduction,
            deductedFromName,
          }
          return { ...s, accounts, activity, orders: capOrders([...s.orders, order]) }
        }),

      deleteOrder: id =>
        setState(s => ({ ...s, orders: s.orders.filter(x => x.id !== id) })),

      deductOrder: id =>
        setState(s => {
          const order = s.orders.find(x => x.id === id)
          if (!order || order.deductedAt) return s
          const grand = netWorthChf(s.accounts)
          const pct = grand > 0 ? (order.amountCHF / grand) * 100 : 0
          const acct = order.fromAccountId ? s.accounts.find(a => a.id === order.fromAccountId) : null
          let accounts = s.accounts
          let activity = s.activity
          if (acct) {
            const nextAmount = Math.max(0, acct.amountCHF - order.amountCHF)
            const delta = nextAmount - acct.amountCHF
            accounts = s.accounts.map(a => (a.id === acct.id ? { ...a, amountCHF: nextAmount } : a))
            activity = pushActivity(
              { ...s, activity: s.activity },
              { accountType: acct.type, name: acct.name, deltaCHF: delta, kind: 'edit' },
            )
          }
          const orders = s.orders.map(x =>
            x.id === id
              ? {
                  ...x,
                  deductedAt: Date.now(),
                  pctAtDeduction: pct,
                  deductedFromName: acct?.name ?? null,
                }
              : x,
          )
          return { ...s, accounts, activity, orders }
        }),

      undoDeductOrder: id =>
        setState(s => {
          const order = s.orders.find(x => x.id === id)
          if (!order || !order.deductedAt) return s
          const acct = order.fromAccountId ? s.accounts.find(a => a.id === order.fromAccountId) : null
          let accounts = s.accounts
          let activity = s.activity
          if (acct) {
            const nextAmount = acct.amountCHF + order.amountCHF
            accounts = s.accounts.map(a => (a.id === acct.id ? { ...a, amountCHF: nextAmount } : a))
            activity = pushActivity(
              { ...s, activity: s.activity },
              { accountType: acct.type, name: acct.name, deltaCHF: order.amountCHF, kind: 'edit' },
            )
          }
          const orders = s.orders.map(x =>
            x.id === id ? { ...x, deductedAt: null, pctAtDeduction: null, deductedFromName: null } : x,
          )
          return { ...s, accounts, activity, orders }
        }),

      addWish: (name, displayAmount, url) =>
        setState(s => {
          const trimmed = name.trim()
          if (!trimmed || !isFinite(displayAmount)) return s
          const amountCHF = displayToChf(displayAmount, s.currency, rates)
          const wish: WishItem = {
            id: genId('wish'),
            name: trimmed,
            amountCHF,
            enteredAmount: displayAmount,
            enteredCurrency: s.currency,
            ts: Date.now(),
            url: url ?? null,
          }
          return { ...s, wishlist: [...s.wishlist, wish] }
        }),

      setWishUrl: (id, url) =>
        setState(s => ({
          ...s,
          wishlist: s.wishlist.map(w => (w.id === id ? { ...w, url } : w)),
        })),

      deleteWish: id =>
        setState(s => ({ ...s, wishlist: s.wishlist.filter(x => x.id !== id) })),
    }),
    [rates],
  )

  return { ready, state, rates, ratesLoaded, actions, fmt, netWorth, quotes, refreshQuotes, cryptoQuotes, refreshCryptoQuotes }
}

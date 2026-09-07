'use client'

/**
 * Bridge between the brand Money panel and the global Finance module.
 *
 * The two stores are independent: Finance keeps subscriptions as canonical CHF
 * in Supabase (`finance_subscriptions`, source of truth) + a localStorage
 * write-through backup, and converts to a display currency via live FX. The
 * brand Money panel keeps plain-number entries in the brand blob.
 *
 * This module is the seam that keeps recurring money-OUT entries in lock-step
 * with Finance subscriptions:
 *   · pullFinanceSubs() — read Finance's subs (Supabase first, local fallback)
 *     so the panel can import them as money-out entries.
 *   · pushExpense()/updateExpense()/deleteExpense() — write a brand expense
 *     through to Finance so it shows up in the global burn + across devices.
 *
 * One-off and money-IN entries are NOT mirrored — they aren't subscriptions.
 * Currency: the panel adopts Finance's display currency, so amounts round-trip
 * through CHF (displayToChf / chfToDisplay) without drift.
 */

import { createClient } from '@/lib/supabase/client'
import {
  STORAGE_KEY,
  newUuid,
  displayToChf,
  chfToDisplay,
  monthlyEquivalent,
  __financeInternals,
  type ExchangeRates,
} from '../finance/state'
import type { Currency, FinanceState, SubPeriod, Subscription } from '../finance/types'
import type { BrandMoneyPeriod } from './types'

const DEFAULT_RATES: ExchangeRates = { CHF: 1, USD: 1, EUR: 1, GBP: 1 }
const CURRENCY_SYMBOL: Record<Currency, string> = { CHF: 'CHF ', USD: '$', EUR: '€', GBP: '£' }

/** A Finance subscription flattened to what the panel needs to import it. */
export interface PulledSub {
  /** Finance subscription uuid — stored as the brand entry's financeId. */
  financeId: string
  name: string
  /** Amount already converted to the brand/Finance display currency. */
  amount: number
  /** Brand period (Finance 'weekly' folds into a monthly equivalent). */
  period: Exclude<BrandMoneyPeriod, 'once'>
}

export interface FinanceContext {
  currency: Currency
  /** Display symbol/prefix for `currency`, e.g. "$" or "CHF ". */
  symbol: string
  rates: ExchangeRates
}

let ratesCache: ExchangeRates | null = null

/** CHF-relative FX rates, fetched once and cached for the session. */
async function getRates(): Promise<ExchangeRates> {
  if (ratesCache) return ratesCache
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/CHF')
    const data = (await res.json()) as { rates?: Record<string, number> }
    if (data?.rates) {
      ratesCache = { CHF: 1, USD: data.rates.USD || 1, EUR: data.rates.EUR || 1, GBP: data.rates.GBP || 1 }
      return ratesCache
    }
  } catch {
    /* fall through to parity */
  }
  ratesCache = DEFAULT_RATES
  return ratesCache
}

function readLocalFinance(): FinanceState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as FinanceState) : null
  } catch {
    return null
  }
}

function writeLocalFinance(mutate: (s: FinanceState) => FinanceState): void {
  if (typeof window === 'undefined') return
  try {
    const cur = readLocalFinance()
    if (!cur) return // no Finance state yet — Supabase write is the source of truth
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mutate(cur)))
  } catch {
    /* storage blocked — Supabase still has it */
  }
}

async function resolveUser(): Promise<{ db: ReturnType<typeof createClient>; userId: string | null }> {
  const db = createClient()
  try {
    const { data } = await db.auth.getUser()
    return { db, userId: data.user?.id ?? null }
  } catch {
    return { db, userId: null }
  }
}

/** Finance's display currency + live FX rates, so amounts convert correctly. */
export async function getFinanceContext(): Promise<FinanceContext> {
  const rates = await getRates()
  let currency: Currency = 'CHF'
  const { db, userId } = await resolveUser()
  if (userId) {
    try {
      const { data } = await db.from('finance_prefs').select('currency').eq('user_id', userId).maybeSingle()
      if (data?.currency) currency = data.currency as Currency
    } catch {
      /* fall back to local */
    }
  }
  if (currency === 'CHF') {
    const local = readLocalFinance()
    if (local?.currency) currency = local.currency
  }
  return { currency, symbol: CURRENCY_SYMBOL[currency] ?? '$', rates }
}

/** Load Finance subscriptions, flattened + converted to the display currency. */
export async function pullFinanceSubs(ctx: FinanceContext): Promise<PulledSub[]> {
  let subs: Subscription[] = []
  const { db, userId } = await resolveUser()
  if (userId) {
    try {
      const { data, error } = await db.from('finance_subscriptions').select('*').eq('user_id', userId)
      if (!error && Array.isArray(data)) subs = data.map(__financeInternals.rowToSub)
    } catch {
      /* fall back to local */
    }
  }
  if (!subs.length) {
    const local = readLocalFinance()
    if (local?.subscriptions?.length) subs = local.subscriptions
  }

  return subs.map((s) => {
    // Weekly subs have no brand equivalent — fold into a monthly amount.
    const monthlyChf = monthlyEquivalent(s)
    const isWeekly = s.period === 'weekly'
    const period: PulledSub['period'] = s.period === 'yearly' ? 'yearly' : 'monthly'
    const chf = isWeekly ? monthlyChf : s.amountCHF
    const amount = Math.round(chfToDisplay(chf, ctx.currency, ctx.rates) * 100) / 100
    return { financeId: s.id, name: s.name, amount, period }
  })
}

function brandToFinancePeriod(p: Exclude<BrandMoneyPeriod, 'once'>): SubPeriod {
  return p === 'yearly' ? 'yearly' : 'monthly'
}

function buildSub(
  id: string,
  input: { name: string; amount: number; period: Exclude<BrandMoneyPeriod, 'once'> },
  ctx: FinanceContext,
): Subscription {
  return {
    id,
    name: input.name.trim() || 'Expense',
    amountCHF: displayToChf(input.amount, ctx.currency, ctx.rates),
    period: brandToFinancePeriod(input.period),
    enteredAmount: input.amount,
    enteredCurrency: ctx.currency,
    renewal: null,
    fromAccountId: null,
    autoDeduct: false,
    lastDeductedAt: null,
  }
}

/** Mirror a new brand expense into Finance. Returns the Finance sub id, or null. */
export async function pushExpense(
  input: { name: string; amount: number; period: Exclude<BrandMoneyPeriod, 'once'> },
  ctx: FinanceContext,
): Promise<string | null> {
  const id = newUuid()
  const sub = buildSub(id, input, ctx)
  const { db, userId } = await resolveUser()
  let ok = false
  if (userId) {
    try {
      const { error } = await db.from('finance_subscriptions').upsert(__financeInternals.subToRow(sub, userId))
      ok = !error
    } catch {
      ok = false
    }
  }
  writeLocalFinance((s) => ({ ...s, subscriptions: [...(s.subscriptions ?? []), sub] }))
  // Without a session there's no Supabase row, but the localStorage mirror still
  // lets the Finance tab pick it up next load; return the id so the link holds.
  return ok || !userId ? id : null
}

/** Push an edit to a mirrored expense. Best-effort; failures are swallowed. */
export async function updateExpense(
  financeId: string,
  input: { name: string; amount: number; period: Exclude<BrandMoneyPeriod, 'once'> },
  ctx: FinanceContext,
): Promise<void> {
  const sub = buildSub(financeId, input, ctx)
  const { db, userId } = await resolveUser()
  if (userId) {
    try {
      await db.from('finance_subscriptions').upsert(__financeInternals.subToRow(sub, userId))
    } catch {
      /* swallow */
    }
  }
  writeLocalFinance((s) => ({
    ...s,
    subscriptions: (s.subscriptions ?? []).map((x) => (x.id === financeId ? sub : x)),
  }))
}

/** Remove a mirrored expense from Finance when its brand entry is deleted. */
export async function deleteExpense(financeId: string): Promise<void> {
  const { db, userId } = await resolveUser()
  if (userId) {
    try {
      await db.from('finance_subscriptions').delete().eq('id', financeId)
    } catch {
      /* swallow */
    }
  }
  writeLocalFinance((s) => ({
    ...s,
    subscriptions: (s.subscriptions ?? []).filter((x) => x.id !== financeId),
  }))
}

/**
 * Cross-module handoff: when a supplement recommendation is "ordered" from
 * Fitness → Supplements, we stash the name + price in sessionStorage and
 * navigate to /app/finance. FinanceModule reads this on mount, flips to
 * the Orders tab, and AddOrderForm consumes the prefill to populate its
 * fields. SessionStorage (not localStorage) so it dies with the tab and
 * we never resurrect a stale order intent on a new session.
 */
const KEY = 'vitality:orderPrefill'

export interface OrderPrefill {
  name: string
  /** Monthly cost in USD (one bottle ≈ one month for most supplements). */
  priceUsdMonthly: number
  source: 'supplement-rec'
  ts: number
}

export function setOrderPrefill(data: Omit<OrderPrefill, 'ts'>): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...data, ts: Date.now() }))
  } catch {
    // sessionStorage can throw in private-mode Safari; swallow and continue —
    // user just won't get the prefill, the form will still be there to fill in.
  }
}

export function readOrderPrefill(): OrderPrefill | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as OrderPrefill
  } catch {
    return null
  }
}

export function clearOrderPrefill(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(KEY)
  } catch {}
}

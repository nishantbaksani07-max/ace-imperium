/**
 * Type definitions for the Finance module.
 *
 * All monetary values are stored as canonical CHF (Swiss Franc) regardless
 * of what the user sees on screen. The active display currency is a separate
 * state field; conversion is a UI-boundary concern (see state.ts -> fmtMoney,
 * displayToChf, chfToDisplay). Same pattern as units.ts in the workout
 * module (storage = canonical, UI converts).
 */

export type Currency = 'CHF' | 'USD' | 'EUR' | 'GBP'
export const CURRENCIES: Currency[] = ['CHF', 'USD', 'EUR', 'GBP']

export type AccountType = 'bank' | 'stocks' | 'crypto' | 'debt' | 'other'

export type SubPeriod = 'weekly' | 'monthly' | 'yearly'

export type TabKey = 'net' | 'subs' | 'orders' | 'wish' | 'coach' | 'stocks' | 'crypto'
export const TAB_KEYS: TabKey[] = ['net', 'subs', 'orders', 'wish', 'coach', 'stocks', 'crypto']
/**
 * The tabs actually mounted in the launch Finance tile. The rest of TAB_KEYS
 * (net / orders / wish / coach) stay parked in the type but aren't rendered —
 * the shipped module is the subscription radar + the focused stocks view.
 */
export const MOUNTED_TABS: TabKey[] = ['subs', 'stocks', 'crypto']

export interface Account {
  id: string
  type: AccountType
  name: string
  /**
   * Canonical CHF balance.
   *
   * For manual accounts (no `ticker`), this is the user-entered value.
   * For holdings (`ticker` + `shares` set), this is the last-computed
   * `shares × livePriceUSD ÷ rates.USD` — refreshed by the quote sync
   * effect in state.ts whenever a fresh price arrives. We still store it
   * so net worth chart + donut work the moment state hydrates from
   * localStorage, before the first /api/finance/quote round-trip.
   */
  amountCHF: number
  /**
   * Stocks: the uppercase ticker (e.g. "VTI").
   * Crypto: the CoinGecko coin id (e.g. "bitcoin"). A live crypto holding is
   * the same shape as a stock holding — `ticker` (coin id) + `shares`
   * (quantity) + live `amountCHF` filled by the crypto quote-sync effect.
   */
  ticker?: string
  /** Shares held (stocks) or coin quantity (crypto). */
  shares?: number
  /**
   * Per-holding price history for the row sparkline. Snapshotted by the
   * quote-sync effect at most once every 6h (a 7-day sparkline gets up to
   * ~28 points), capped at PRICE_HISTORY_MAX (30). Stores the holding's
   * native quote price — raw USD for stocks, CHF for crypto (CoinGecko
   * returns CHF directly). Each account's series is internally consistent;
   * the sparkline only plots relative trend, so the unit never matters.
   */
  priceHistory?: PricePoint[]
}

export interface PricePoint {
  /** ms since epoch. */
  t: number
  /** USD price. */
  p: number
}

export interface StockQuote {
  ticker: string
  /** Last trade price in USD (Finnhub returns USD for US tickers). */
  priceUSD: number
  /** Day change % (sign included). null when Finnhub returns 0/0. */
  changePct: number | null
  /** ms since epoch when this quote was fetched (server-side). */
  fetchedAt: number
  /** Today's open price (USD). Optional — older cached quotes won't have it. */
  openUSD?: number | null
  /** Today's intraday high (USD). */
  highUSD?: number | null
  /** Today's intraday low (USD). */
  lowUSD?: number | null
  /** Previous close (USD). */
  prevCloseUSD?: number | null
  /** Absolute day change (USD, sign included). */
  changeUSD?: number | null
}

export interface CryptoQuote {
  /** CoinGecko coin id, e.g. "bitcoin". */
  coinId: string
  /** Last price in CHF (CoinGecko returns the requested vs_currency directly). */
  priceCHF: number
  /** 24h change % (sign included). null when unavailable. */
  changePct: number | null
  /** ms since epoch when this quote was fetched (server-side). */
  fetchedAt: number
}

export interface Subscription {
  id: string
  name: string
  /** Canonical CHF cost per `period`. */
  amountCHF: number
  period: SubPeriod
  /** Raw amount the user typed (display currency). */
  enteredAmount?: number
  enteredCurrency?: Currency
  /** ISO date (YYYY-MM-DD) of the next renewal anchor. */
  renewal?: string | null
  fromAccountId?: string | null
  autoDeduct: boolean
  lastDeductedAt?: number | null
  /** ISO date (YYYY-MM-DD) a free trial converts to paid. Drives the trial-ending alert. */
  trialEnds?: string | null
  /** Prior canonical CHF price, stamped when the amount changes. Drives the price-hike alert. */
  previousAmountCHF?: number | null
  /** ms epoch of the last price change. */
  priceChangedAt?: number | null
  /** Direct link to this service's billing/manage page — opens in a new tab from the sub row. */
  manageUrl?: string | null
}

export interface Order {
  id: string
  name: string
  /** Canonical CHF cost. */
  amountCHF: number
  /**
   * Cash-flow direction. 'out' (default/legacy) = money spent; 'in' = income
   * received (paycheck, refund, sale). Income entries are log-only — they
   * never deduct from an account — and feed the monthly cash-flow recap.
   */
  direction?: 'in' | 'out'
  enteredAmount?: number
  enteredCurrency?: Currency
  fromAccountId?: string | null
  /** ISO date (YYYY-MM-DD) of expected arrival. */
  date?: string | null
  ts: number
  /** Timestamp when the user marked it deducted from net worth. */
  deductedAt?: number | null
  /** Frozen pct of NW at the moment of deduction. */
  pctAtDeduction?: number | null
  /** Snapshot of the account name money was pulled from (in case the account is later renamed/deleted). */
  deductedFromName?: string | null
}

export interface WishItem {
  id: string
  name: string
  amountCHF: number
  enteredAmount?: number
  enteredCurrency?: Currency
  ts: number
  /** Storefront link (e.g. the Amazon page) — opens in a new tab from the row. */
  url?: string | null
}

export type ActivityKind = 'add' | 'edit' | 'delete'

export interface ActivityEntry {
  id: string
  ts: number
  accountType: AccountType
  name: string
  /** Positive = added value, negative = removed. */
  deltaCHF: number
  kind: ActivityKind
}

export interface NwHistoryPoint {
  /** ms since epoch. */
  t: number
  /** Net worth in CHF at this moment. */
  v: number
}

/**
 * Single-object persistence shape. Replaces the standalone's seven separate
 * localStorage keys with one namespaced blob — easier to clear, easier to
 * migrate to Supabase later, less collision risk with other Vitality modules.
 */
export interface FinanceState {
  /** Persistence schema version. Currently always 1 — no migration branches on
   *  it yet (deferred to the Supabase migration). Typed as number, not the
   *  literal 1, so a future bump doesn't require a type change first. */
  version: number
  currency: Currency
  activeTab: TabKey
  accounts: Account[]
  subscriptions: Subscription[]
  orders: Order[]
  wishlist: WishItem[]
  /** Capped at ACTIVITY_MAX (50). Newest pushed last. */
  activity: ActivityEntry[]
  /** Capped at NW_HISTORY_MAX (500). Oldest first. */
  netWorthHistory: NwHistoryPoint[]
}

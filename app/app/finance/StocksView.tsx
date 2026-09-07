'use client'

import { useMemo, useState } from 'react'
import styles from './finance.module.css'
import type { Account, FinanceState, StockQuote } from './types'
import type { FinanceActions, QuoteMap } from './state'

/**
 * Stocks tab — "Apple Health for stocks".
 *
 * Built for a long-term investor, not a trader. It answers three questions in
 * five seconds: is this still good, did anything change, should I look today.
 * Top to bottom:
 *   1. Your stocks   — every holding treated as one personal index.
 *   2. Today's pick  — one plain-English idea a day, given what you own.
 *   3. News          — only about the tickers you actually hold.
 *   4. Holdings      — each a plain-English health card, tap to expand.
 *
 * All jargon is funnelled to plain words ("Expensive", not "P/E 32x"). Prices
 * come from the SAME quote machinery net worth uses (the sync effect in state.ts
 * fills each holding's amountCHF); here we only render numbers and read changePct
 * off the live QuoteMap. No new pricing, no new state slice.
 *
 * Colour law (hard): mint = good, amber = caution. Never red for state — a down
 * day or a struggling holding is warm amber, never a red alarm.
 */
interface Props {
  state: FinanceState
  actions: FinanceActions
  fmt: (chf: number) => string
  quotes: QuoteMap
  refreshQuotes: () => void
}

// small formatters ------------------------------------------------------------

function fmtPct(p: number): string {
  return `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`
}
/** mint when up/flat, warm amber when down — never red (colour law). */
function moveClass(p: number): string {
  return p >= 0 ? styles.stkUp : styles.stkDown
}
function arrow(p: number): string {
  return p >= 0 ? '↑' : '↓'
}

// -----------------------------------------------------------------------------
// 2. Today's pick — seed data
//
// A scheduled Claude routine overwrites this daily (read_data / save_data into a
// finance slot) with a fresh, personalised idea. Until then it ships as a clearly
// marked EXAMPLE so the tab boots with something real instead of an empty shell.
// The user's holdings lean broad-market US + tech (VOO, VO, QQQ) plus Disney and
// Altria, so the seeded pick diversifies AWAY from that concentration.
// -----------------------------------------------------------------------------

interface DailyPick {
  ticker: string
  name: string
  kind: 'etf' | 'stock'
  /** Plain-English "why this, for you" — no jargon. */
  reason: string
}

const DAILY_PICK: DailyPick = {
  ticker: 'VXUS',
  name: 'Vanguard Total International Stock',
  kind: 'etf',
  reason:
    'You lean heavily on US companies and tech. This one holds thousands of businesses outside the US, so a rough patch at home does not drag down everything you own at once.',
}

// -----------------------------------------------------------------------------
// 3. News — only about tickers you hold
//
// A scheduled Claude routine refreshes this daily. Seeded with plausible,
// plain-English items for the user's actual tickers; RENDERED only when the
// ticker is in the user's stock holdings, so the feed is always about you.
// -----------------------------------------------------------------------------

type NewsSignal = 'good' | 'watch' | 'negative'

interface HoldingNews {
  ticker: string
  signal: NewsSignal
  /** Plain headline, no jargon. */
  headline: string
  /** One line: why it matters to the person holding it. */
  why: string
}

// Ships empty on purpose. The scheduled routine writes real news in through the
// connector. An invented headline reads as fact to someone paying for this.
const HOLDING_NEWS: HoldingNews[] = []

const SIGNAL_LABEL: Record<NewsSignal, string> = {
  good: 'good',
  watch: 'watch',
  negative: 'heads up',
}
const SIGNAL_CLASS: Record<NewsSignal, string> = {
  good: styles.stkSigGood,
  watch: styles.stkSigWatch,
  negative: styles.stkSigNeg,
}

// -----------------------------------------------------------------------------
// 4. Holdings health — seed data
//
// A scheduled Claude routine fills this in (read_data / save_data). Keyed by
// ticker. Everything is plain English on purpose: "Growing" not "revenue CAGR",
// "Expensive" not "P/E 32x", "Low" not a debt ratio. `flagged` gives the card an
// amber pulse + a "worth a look" nudge — amber, never red. MO is seeded flagged
// so the attention state is visible out of the box.
// -----------------------------------------------------------------------------

type Mark = 'good' | 'caution'
type Standpoint = 'Strong' | 'Healthy' | 'Watch' | 'Weak'

interface StockHealth {
  standpoint: Standpoint
  /** Amber attention state: bad news / overvalued / deteriorating. */
  flagged?: boolean
  /** Plain nudge shown on a flagged card. */
  nudge?: string
  /** Five plain-word health signals. */
  marks: {
    business: Mark
    value: Mark
    growth: Mark
    financials: Mark
    news: Mark
  }
  /** "What changed" — plain. */
  changed: string
  /** "Long term" — all plain words, never ratios. */
  longTerm: {
    tenYear: string
    revenue: string
    cashFlow: string
    debt: string
  }
}

// Ships empty on purpose. The scheduled routine writes the real read in through
// the connector. A made up health rating is a lie with a mint dot next to it.
const STOCK_HEALTH: Record<string, StockHealth> = {}

const STANDPOINT_CLASS: Record<Standpoint, string> = {
  Strong: styles.stkStandStrong,
  Healthy: styles.stkStandHealthy,
  Watch: styles.stkStandWatch,
  Weak: styles.stkStandWeak,
}

const DOT_META: { key: keyof StockHealth['marks']; label: string }[] = [
  { key: 'business', label: 'Business' },
  { key: 'value', label: 'Value' },
  { key: 'growth', label: 'Growth' },
  { key: 'financials', label: 'Financials' },
  { key: 'news', label: 'News' },
]

// =============================================================================
// 1. Your stocks — every holding as one personal index
// =============================================================================

function YourStocks({
  holdings,
  total,
  fmt,
  quotes,
}: {
  holdings: Account[]
  total: number
  fmt: (chf: number) => string
  quotes: QuoteMap
}) {
  // Value-weighted daily move: weight each holding's changePct by its value,
  // over only the holdings we currently have a live quote for. No new data —
  // straight off the QuoteMap + the cached amountCHF.
  const move = useMemo(() => {
    let sumValue = 0
    let sumWeighted = 0
    let priced = 0
    for (const h of holdings) {
      const q = quotes[(h.ticker || '').toUpperCase()]
      if (!q || q.changePct == null) continue
      const v = Number(h.amountCHF) || 0
      if (v <= 0) continue
      sumValue += v
      sumWeighted += v * q.changePct
      priced++
    }
    if (priced === 0 || sumValue <= 0) return null
    return { pct: sumWeighted / sumValue, priced }
  }, [holdings, quotes])

  return (
    <div className={styles.stkIndexCard}>
      <div className={styles.stkIndexLabel}>Your stocks</div>
      <div className={styles.stkIndexValueRow}>
        <span className={styles.stkIndexValue}>{fmt(total)}</span>
        {move ? (
          <span className={`${styles.stkIndexChange} ${moveClass(move.pct)}`}>
            {arrow(move.pct)} {fmtPct(move.pct)} <span className={styles.stkIndexChangeUnit}>today</span>
          </span>
        ) : (
          <span className={styles.stkIndexWaiting}>waiting on today&apos;s prices</span>
        )}
      </div>
      <div className={styles.stkIndexSub}>
        {holdings.length} {holdings.length === 1 ? 'holding' : 'holdings'}, read as one basket
        {move && move.priced < holdings.length ? ` · ${move.priced} priced live` : ''}
      </div>
    </div>
  )
}

// =============================================================================
// 2. Today's pick
// =============================================================================

function TodaysPick() {
  const p = DAILY_PICK
  return (
    <div className={styles.stkPickCard}>
      <div className={styles.stkPickHead}>
        <span className={styles.stkPickKind}>{p.kind === 'etf' ? 'ETF' : 'Stock'}</span>
        <span className={styles.stkPickExample} title="An illustrative example, refreshed daily">example</span>
      </div>
      <div className={styles.stkPickTicker}>{p.ticker}</div>
      <div className={styles.stkPickName}>{p.name}</div>
      <div className={styles.stkPickReason}>{p.reason}</div>
      <div className={styles.stkPickNote}>Research, not financial advice.</div>
    </div>
  )
}

// =============================================================================
// 3. News — your holdings only
// =============================================================================

function HoldingsNews({ heldTickers }: { heldTickers: Set<string> }) {
  const items = useMemo(
    () => HOLDING_NEWS.filter(n => heldTickers.has(n.ticker.toUpperCase())),
    [heldTickers],
  )
  if (items.length === 0) return null

  return (
    <div className={styles.stkNewsList}>
      {items.map(n => (
        <div key={`${n.ticker}-${n.headline}`} className={styles.stkNewsItem}>
          <div className={styles.stkNewsHead}>
            <span className={`${styles.stkSignal} ${SIGNAL_CLASS[n.signal]}`}>{SIGNAL_LABEL[n.signal]}</span>
            <span className={styles.stkNewsTicker}>{n.ticker}</span>
          </div>
          <div className={styles.stkNewsHeadline}>{n.headline}</div>
          <div className={styles.stkNewsWhy}>{n.why}</div>
        </div>
      ))}
    </div>
  )
}

// =============================================================================
// 4. Holdings — plain-English health cards
// =============================================================================

function HealthCard({
  acct,
  quote,
  fmt,
  onDelete,
}: {
  acct: Account
  quote: StockQuote | undefined
  fmt: (chf: number) => string
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const ticker = (acct.ticker || acct.name || '').toUpperCase()
  const health = STOCK_HEALTH[ticker]
  const pct = quote && quote.changePct != null ? quote.changePct : null
  const flagged = !!health?.flagged

  return (
    <div className={`${styles.stkHealthCard} ${flagged ? styles.stkHealthFlagged : ''}`}>
      <button
        type="button"
        className={styles.stkHealthTop}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={`${ticker} details`}
      >
        <div className={styles.stkHealthIdent}>
          <span className={styles.stkHealthTicker}>{ticker}</span>
          {health && (
            <span className={`${styles.stkStandpoint} ${STANDPOINT_CLASS[health.standpoint]}`}>
              {health.standpoint}
            </span>
          )}
        </div>
        <div className={styles.stkHealthNums}>
          <span className={styles.stkHealthValue}>{fmt(acct.amountCHF)}</span>
          {pct != null ? (
            <span className={`${styles.stkHealthChange} ${moveClass(pct)}`}>{fmtPct(pct)}</span>
          ) : (
            <span className={styles.stkHealthChangeNone}>{acct.amountCHF > 0 ? 'cached' : 'pending'}</span>
          )}
        </div>
        <span className={`${styles.stkChevron} ${open ? styles.stkChevronOpen : ''}`} aria-hidden>⌄</span>
      </button>

      {health ? (
        <>
          <div className={styles.stkDots}>
            {DOT_META.map(d => {
              const m = health.marks[d.key]
              return (
                <span key={d.key} className={styles.stkDotItem} title={`${d.label}: ${m === 'good' ? 'good' : 'worth a look'}`}>
                  <span className={`${styles.stkDotCircle} ${m === 'good' ? styles.stkGood : styles.stkCaution}`} aria-hidden />
                  <span className={styles.stkDotLabel}>{d.label}</span>
                </span>
              )
            })}
          </div>

          {flagged && health.nudge && (
            <div className={styles.stkFlagNudge}>
              <span className={styles.stkFlagTag}>worth a look</span>
              {health.nudge}
            </div>
          )}

          {open && (
            <div className={styles.stkExpand}>
              <div className={styles.stkExpandBlock}>
                <div className={styles.stkExpandLabel}>What changed</div>
                <div className={styles.stkExpandText}>{health.changed}</div>
              </div>
              <div className={styles.stkExpandBlock}>
                <div className={styles.stkExpandLabel}>Long term</div>
                <div className={styles.stkLongGrid}>
                  <div className={styles.stkLongItem}><span className={styles.stkLongLabel}>10-year</span><span className={styles.stkLongValue}>{health.longTerm.tenYear}</span></div>
                  <div className={styles.stkLongItem}><span className={styles.stkLongLabel}>Revenue</span><span className={styles.stkLongValue}>{health.longTerm.revenue}</span></div>
                  <div className={styles.stkLongItem}><span className={styles.stkLongLabel}>Cash flow</span><span className={styles.stkLongValue}>{health.longTerm.cashFlow}</span></div>
                  <div className={styles.stkLongItem}><span className={styles.stkLongLabel}>Debt</span><span className={styles.stkLongValue}>{health.longTerm.debt}</span></div>
                </div>
              </div>
              <button type="button" className={styles.stkRemove} onClick={onDelete}>Remove holding</button>
            </div>
          )}
        </>
      ) : (
        open && (
          <div className={styles.stkExpand}>
            <div className={styles.stkExpandText}>No read yet for {ticker}. A daily routine fills this in.</div>
            <button type="button" className={styles.stkRemove} onClick={onDelete}>Remove holding</button>
          </div>
        )
      )}
    </div>
  )
}

function Holdings({ holdings, fmt, quotes, actions, refreshQuotes }: {
  holdings: Account[]
  fmt: (chf: number) => string
  quotes: QuoteMap
  actions: FinanceActions
  refreshQuotes: () => void
}) {
  const [ticker, setTicker] = useState('')
  const [shares, setShares] = useState('')

  function addStock() {
    const s = parseFloat(shares)
    if (!ticker.trim() || !isFinite(s) || s <= 0) return
    actions.addHolding(ticker, s)
    setTicker('')
    setShares('')
  }

  return (
    <>
      {holdings.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No holdings yet.</div>
          <div className={styles.emptyBody}>
            Add a ticker and how many shares you hold. Live prices pull in on their own once your
            Finnhub key is set, and each holding gets its own plain-English health card.
          </div>
        </div>
      ) : (
        <div className={styles.stkHealthList}>
          {holdings.map(acct => (
            <HealthCard
              key={acct.id}
              acct={acct}
              quote={quotes[(acct.ticker || '').toUpperCase()]}
              fmt={fmt}
              onDelete={() => actions.deleteAccount(acct.id)}
            />
          ))}
        </div>
      )}

      <div className={styles.addEyebrow}>+ add a stock</div>
      <div className={styles.quickAdd}>
        <input
          className={styles.quickAddInput}
          type="text"
          value={ticker}
          placeholder="Ticker (e.g. VOO)"
          autoCapitalize="characters"
          spellCheck={false}
          onChange={e => setTicker(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === 'Enter') addStock() }}
        />
        <input
          className={styles.quickAddInput}
          type="number"
          inputMode="decimal"
          step="0.0001"
          value={shares}
          placeholder="Shares"
          onChange={e => setShares(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addStock() }}
        />
        <button type="button" className={styles.quickAddBtn} onClick={addStock}>+ Add</button>
      </div>

      {holdings.length > 0 && (
        <div className={styles.holdingsFooter}>
          <button
            type="button"
            className={styles.linkAction}
            onClick={refreshQuotes}
            title="Force a fresh quote fetch (otherwise cached for 15 min)"
          >
            ↻ refresh prices
          </button>
        </div>
      )}
    </>
  )
}

// =============================================================================
// Root view
// =============================================================================

export default function StocksView({ state, actions, fmt, quotes, refreshQuotes }: Props) {
  const holdings = useMemo(
    () => state.accounts.filter(a => a.type === 'stocks'),
    [state.accounts],
  )
  const total = useMemo(
    () => holdings.reduce((s, a) => s + (Number(a.amountCHF) || 0), 0),
    [holdings],
  )
  const heldTickers = useMemo(() => {
    const set = new Set<string>()
    holdings.forEach(a => { if (a.ticker) set.add(a.ticker.toUpperCase()) })
    return set
  }, [holdings])

  const newsCount = useMemo(
    () => HOLDING_NEWS.filter(n => heldTickers.has(n.ticker.toUpperCase())).length,
    [heldTickers],
  )

  return (
    <section className={styles.section}>
      {/* 1. Your stocks */}
      <div className={styles.sectionEyebrow}>
        <span>Your stocks</span>
        <span className={styles.sectionCount}>{holdings.length} {holdings.length === 1 ? 'holding' : 'holdings'}</span>
      </div>
      <YourStocks holdings={holdings} total={total} fmt={fmt} quotes={quotes} />

      {/* 2. Today's pick */}
      <div className={styles.sectionEyebrow}>
        <span>Today&apos;s pick</span>
        <span className={styles.sectionCount}>for you</span>
      </div>
      <TodaysPick />

      {/* 3. News, your holdings only */}
      {newsCount > 0 && (
        <>
          <div className={styles.sectionEyebrow}>
            <span>News on what you own</span>
            <span className={styles.sectionCount}>{newsCount} {newsCount === 1 ? 'item' : 'items'}</span>
          </div>
          <HoldingsNews heldTickers={heldTickers} />
        </>
      )}

      {/* 4. Holdings health */}
      <div className={styles.sectionEyebrow}>
        <span>Holdings</span>
      </div>
      <Holdings holdings={holdings} fmt={fmt} quotes={quotes} actions={actions} refreshQuotes={refreshQuotes} />
    </section>
  )
}

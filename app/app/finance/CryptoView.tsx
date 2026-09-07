'use client'

import { useMemo, useState } from 'react'
import styles from './finance.module.css'
import type { Account, FinanceState, CryptoQuote } from './types'
import type { FinanceActions, CryptoQuoteMap } from './state'
import { COINS, resolveCoin, symbolForId } from './coins'

/**
 * Crypto tab — the stocks tab's twin, for coins.
 *
 * Same format on purpose: the user already learned this page once. Top to
 * bottom: 1. Your crypto as one basket. 2. Today's pick (a clearly marked
 * example until the routine writes a real one). 3. News, only about coins you
 * hold. 4. Holdings as plain-English health cards.
 *
 * Prices come from the SAME machinery net worth uses: the crypto quote-sync
 * effect in state.ts fills each holding's amountCHF from CoinGecko (keyless),
 * and we read the 24h changePct off the live CryptoQuoteMap. No new pricing,
 * no new state slice. Holdings are type 'crypto': ticker = the CoinGecko coin
 * id ("bitcoin"), shares = the quantity held.
 *
 * Colour law (hard): mint = good, amber = caution. Never red for state — a
 * down day is warm amber, never a red alarm. Crypto swings harder than stocks;
 * the calm face is the whole point of the page.
 */
interface Props {
  state: FinanceState
  actions: FinanceActions
  fmt: (chf: number) => string
  cryptoQuotes: CryptoQuoteMap
  refreshCryptoQuotes: () => void
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
// A scheduled Claude routine overwrites this daily with a fresh, personalised
// idea. Until then it ships as a clearly marked EXAMPLE, exactly like the
// stocks tab's VXUS card. Deliberately the most boring idea in crypto: the
// example must model calm, not chase heat.
// -----------------------------------------------------------------------------

interface DailyPick {
  symbol: string
  name: string
  kind: 'coin' | 'stablecoin'
  /** Plain-English "why this, for you" — no jargon. */
  reason: string
}

const DAILY_PICK: DailyPick = {
  symbol: 'BTC',
  name: 'Bitcoin',
  kind: 'coin',
  reason:
    'The oldest and largest coin, and the one most portfolios treat as the base layer. If you want crypto exposure without picking winners, this is where most people start — small, and held long.',
}

// -----------------------------------------------------------------------------
// 3. News — only about coins you hold
//
// Ships empty on purpose. The scheduled routine writes real news in through
// the connector. An invented headline reads as fact to someone paying for this.
// -----------------------------------------------------------------------------

type NewsSignal = 'good' | 'watch' | 'negative'

interface CoinNews {
  /** Display symbol, e.g. "BTC". */
  symbol: string
  signal: NewsSignal
  headline: string
  why: string
}

const COIN_NEWS: CoinNews[] = []

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
// Ships empty on purpose, same law as stocks: a made up health rating is a lie
// with a mint dot next to it. Keyed by display symbol ("BTC"). The marks map
// to crypto-honest words in DOT_META below — "Adoption" instead of a business,
// "Liquidity" instead of financials.
// -----------------------------------------------------------------------------

type Mark = 'good' | 'caution'
type Standpoint = 'Strong' | 'Healthy' | 'Watch' | 'Weak'

interface CoinHealth {
  standpoint: Standpoint
  flagged?: boolean
  nudge?: string
  marks: {
    adoption: Mark
    value: Mark
    momentum: Mark
    liquidity: Mark
    news: Mark
  }
  changed: string
  longTerm: {
    fiveYear: string
    adoption: string
    volatility: string
    risk: string
  }
}

const COIN_HEALTH: Record<string, CoinHealth> = {}

const STANDPOINT_CLASS: Record<Standpoint, string> = {
  Strong: styles.stkStandStrong,
  Healthy: styles.stkStandHealthy,
  Watch: styles.stkStandWatch,
  Weak: styles.stkStandWeak,
}

const DOT_META: { key: keyof CoinHealth['marks']; label: string }[] = [
  { key: 'adoption', label: 'Adoption' },
  { key: 'value', label: 'Value' },
  { key: 'momentum', label: 'Momentum' },
  { key: 'liquidity', label: 'Liquidity' },
  { key: 'news', label: 'News' },
]

// =============================================================================
// 1. Your crypto — every coin as one basket
// =============================================================================

function YourCrypto({
  holdings,
  total,
  fmt,
  quotes,
}: {
  holdings: Account[]
  total: number
  fmt: (chf: number) => string
  quotes: CryptoQuoteMap
}) {
  // Value-weighted 24h move over the holdings we have a live quote for —
  // identical arithmetic to the stocks basket, keyed by coin id.
  const move = useMemo(() => {
    let sumValue = 0
    let sumWeighted = 0
    let priced = 0
    for (const h of holdings) {
      const q = quotes[(h.ticker || '').toLowerCase()]
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
      <div className={styles.stkIndexLabel}>Your crypto</div>
      <div className={styles.stkIndexValueRow}>
        <span className={styles.stkIndexValue}>{fmt(total)}</span>
        {move ? (
          <span className={`${styles.stkIndexChange} ${moveClass(move.pct)}`}>
            {arrow(move.pct)} {fmtPct(move.pct)} <span className={styles.stkIndexChangeUnit}>24h</span>
          </span>
        ) : (
          <span className={styles.stkIndexWaiting}>waiting on live prices</span>
        )}
      </div>
      <div className={styles.stkIndexSub}>
        {holdings.length} {holdings.length === 1 ? 'coin' : 'coins'}, read as one basket
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
        <span className={styles.stkPickKind}>{p.kind === 'stablecoin' ? 'Stablecoin' : 'Coin'}</span>
        <span className={styles.stkPickExample} title="An illustrative example, refreshed daily">example</span>
      </div>
      <div className={styles.stkPickTicker}>{p.symbol}</div>
      <div className={styles.stkPickName}>{p.name}</div>
      <div className={styles.stkPickReason}>{p.reason}</div>
      <div className={styles.stkPickNote}>Research, not financial advice.</div>
    </div>
  )
}

// =============================================================================
// 3. News — your coins only
// =============================================================================

function CoinsNews({ heldSymbols }: { heldSymbols: Set<string> }) {
  const items = useMemo(
    () => COIN_NEWS.filter(n => heldSymbols.has(n.symbol.toUpperCase())),
    [heldSymbols],
  )
  if (items.length === 0) return null

  return (
    <div className={styles.stkNewsList}>
      {items.map(n => (
        <div key={`${n.symbol}-${n.headline}`} className={styles.stkNewsItem}>
          <div className={styles.stkNewsHead}>
            <span className={`${styles.stkSignal} ${SIGNAL_CLASS[n.signal]}`}>{SIGNAL_LABEL[n.signal]}</span>
            <span className={styles.stkNewsTicker}>{n.symbol}</span>
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
  quote: CryptoQuote | undefined
  fmt: (chf: number) => string
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const symbol = symbolForId(acct.ticker || acct.name || '')
  const health = COIN_HEALTH[symbol]
  const pct = quote && quote.changePct != null ? quote.changePct : null
  const flagged = !!health?.flagged

  return (
    <div className={`${styles.stkHealthCard} ${flagged ? styles.stkHealthFlagged : ''}`}>
      <button
        type="button"
        className={styles.stkHealthTop}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={`${symbol} details`}
      >
        <div className={styles.stkHealthIdent}>
          <span className={styles.stkHealthTicker}>{symbol}</span>
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
                  <div className={styles.stkLongItem}><span className={styles.stkLongLabel}>5-year</span><span className={styles.stkLongValue}>{health.longTerm.fiveYear}</span></div>
                  <div className={styles.stkLongItem}><span className={styles.stkLongLabel}>Adoption</span><span className={styles.stkLongValue}>{health.longTerm.adoption}</span></div>
                  <div className={styles.stkLongItem}><span className={styles.stkLongLabel}>Volatility</span><span className={styles.stkLongValue}>{health.longTerm.volatility}</span></div>
                  <div className={styles.stkLongItem}><span className={styles.stkLongLabel}>Risk</span><span className={styles.stkLongValue}>{health.longTerm.risk}</span></div>
                </div>
              </div>
              <button type="button" className={styles.stkRemove} onClick={onDelete}>Remove holding</button>
            </div>
          )}
        </>
      ) : (
        open && (
          <div className={styles.stkExpand}>
            <div className={styles.stkExpandText}>No read yet for {symbol}. A daily routine fills this in.</div>
            <button type="button" className={styles.stkRemove} onClick={onDelete}>Remove holding</button>
          </div>
        )
      )}
    </div>
  )
}

function Holdings({ holdings, fmt, quotes, actions, refreshCryptoQuotes }: {
  holdings: Account[]
  fmt: (chf: number) => string
  quotes: CryptoQuoteMap
  actions: FinanceActions
  refreshCryptoQuotes: () => void
}) {
  const [coin, setCoin] = useState('')
  const [qty, setQty] = useState('')
  const [unknown, setUnknown] = useState<string | null>(null)

  function addCoin() {
    const q = parseFloat(qty)
    if (!coin.trim() || !isFinite(q) || q <= 0) return
    const meta = resolveCoin(coin)
    if (!meta) {
      // A coin outside the registry: say so instead of guessing an id — a
      // wrong CoinGecko id would price the holding as zero forever.
      setUnknown(coin.trim())
      return
    }
    actions.addCryptoHolding(meta.id, meta.symbol, q)
    setCoin('')
    setQty('')
    setUnknown(null)
  }

  return (
    <>
      {holdings.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No coins yet.</div>
          <div className={styles.emptyBody}>
            Add a coin and how much you hold. Live prices pull in on their own — no key needed —
            and each coin gets its own plain-English health card.
          </div>
        </div>
      ) : (
        <div className={styles.stkHealthList}>
          {holdings.map(acct => (
            <HealthCard
              key={acct.id}
              acct={acct}
              quote={quotes[(acct.ticker || '').toLowerCase()]}
              fmt={fmt}
              onDelete={() => actions.deleteAccount(acct.id)}
            />
          ))}
        </div>
      )}

      <div className={styles.addEyebrow}>+ add a coin</div>
      <div className={styles.quickAdd}>
        <input
          className={styles.quickAddInput}
          type="text"
          value={coin}
          placeholder="Coin (e.g. BTC)"
          autoCapitalize="characters"
          spellCheck={false}
          list="cryptoCoins"
          onChange={e => { setCoin(e.target.value.toUpperCase()); setUnknown(null) }}
          onKeyDown={e => { if (e.key === 'Enter') addCoin() }}
        />
        <datalist id="cryptoCoins">
          {COINS.map(c => (
            <option key={c.id} value={c.symbol}>{c.name}</option>
          ))}
        </datalist>
        <input
          className={styles.quickAddInput}
          type="number"
          inputMode="decimal"
          step="0.00000001"
          value={qty}
          placeholder="Amount"
          onChange={e => setQty(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addCoin() }}
        />
        <button type="button" className={styles.quickAddBtn} onClick={addCoin}>+ Add</button>
      </div>
      {unknown && (
        <div className={styles.stkFlagNudge}>
          <span className={styles.stkFlagTag}>unknown coin</span>
          I don&apos;t know &quot;{unknown}&quot; yet. Try its ticker (BTC, ETH, SOL…) — the common coins are all here.
        </div>
      )}

      {holdings.length > 0 && (
        <div className={styles.holdingsFooter}>
          <button
            type="button"
            className={styles.linkAction}
            onClick={refreshCryptoQuotes}
            title="Force a fresh price fetch (otherwise cached)"
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

export default function CryptoView({ state, actions, fmt, cryptoQuotes, refreshCryptoQuotes }: Props) {
  const holdings = useMemo(
    () => state.accounts.filter(a => a.type === 'crypto'),
    [state.accounts],
  )
  const total = useMemo(
    () => holdings.reduce((s, a) => s + (Number(a.amountCHF) || 0), 0),
    [holdings],
  )
  const heldSymbols = useMemo(() => {
    const set = new Set<string>()
    holdings.forEach(a => { if (a.ticker) set.add(symbolForId(a.ticker).toUpperCase()) })
    return set
  }, [holdings])

  const newsCount = useMemo(
    () => COIN_NEWS.filter(n => heldSymbols.has(n.symbol.toUpperCase())).length,
    [heldSymbols],
  )

  return (
    <section className={styles.section}>
      {/* 1. Your crypto */}
      <div className={styles.sectionEyebrow}>
        <span>Your crypto</span>
        <span className={styles.sectionCount}>{holdings.length} {holdings.length === 1 ? 'coin' : 'coins'}</span>
      </div>
      <YourCrypto holdings={holdings} total={total} fmt={fmt} quotes={cryptoQuotes} />

      {/* 2. Today's pick */}
      <div className={styles.sectionEyebrow}>
        <span>Today&apos;s pick</span>
        <span className={styles.sectionCount}>for you</span>
      </div>
      <TodaysPick />

      {/* 3. News, your coins only */}
      {newsCount > 0 && (
        <>
          <div className={styles.sectionEyebrow}>
            <span>News on what you own</span>
            <span className={styles.sectionCount}>{newsCount} {newsCount === 1 ? 'item' : 'items'}</span>
          </div>
          <CoinsNews heldSymbols={heldSymbols} />
        </>
      )}

      {/* 4. Holdings health */}
      <div className={styles.sectionEyebrow}>
        <span>Holdings</span>
      </div>
      <Holdings
        holdings={holdings}
        fmt={fmt}
        quotes={cryptoQuotes}
        actions={actions}
        refreshCryptoQuotes={refreshCryptoQuotes}
      />
    </section>
  )
}

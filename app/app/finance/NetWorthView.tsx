'use client'

import { useEffect, useMemo, useState } from 'react'
import styles from './finance.module.css'
import type { Account, AccountType, ActivityEntry, CryptoQuote, Currency, FinanceState, NwHistoryPoint, PricePoint, StockQuote } from './types'
import {
  type CryptoQuoteMap,
  type ExchangeRates,
  type FinanceActions,
  type QuoteMap,
  assetsChf,
  chfToDisplay,
  cryptoValueChf,
  debtChf,
  displayToChf,
  formatActivityDate,
  monthlyEquivalent,
  netWorthByType,
  percentBreakdown,
  priceHistoryWithin,
  projectGoalDate,
  runwayMonths,
  useNetWorthGoal,
} from './state'
import { COINS, resolveCoin } from './coins'
import ImportStatement from './ImportStatement'
import { useCountUp } from './useCountUp'

interface Props {
  state: FinanceState
  actions: FinanceActions
  fmt: (chf: number) => string
  rates: ExchangeRates
  netWorth: number
  quotes: QuoteMap
  refreshQuotes: () => void
  cryptoQuotes: CryptoQuoteMap
  refreshCryptoQuotes: () => void
}

// -----------------------------------------------------------------------------
// Derived helpers
// -----------------------------------------------------------------------------

/**
 * 24-hour net-worth delta. Finds the snapshot closest to (latest - 24h);
 * returns null when we don't have enough history to make a meaningful
 * call (e.g. user just opened the app for the first time).
 */
function dailyDelta(history: NwHistoryPoint[]): { delta: number; pct: number | null } | null {
  if (history.length < 2) return null
  const last = history[history.length - 1]
  const cutoff = last.t - 86_400_000
  // Walk backwards: prefer the most recent point that is at-or-before cutoff.
  // Falls back to the oldest known point if everything is younger than 24h.
  let baseline: NwHistoryPoint | null = null
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].t <= cutoff) { baseline = history[i]; break }
  }
  if (!baseline) baseline = history[0]
  // Skip the pill if we don't have at least an hour of separation —
  // computing a "24h delta" off two points 5 minutes apart is misleading.
  if (last.t - baseline.t < 60 * 60 * 1000) return null
  const delta = last.v - baseline.v
  const pct = Math.abs(baseline.v) > 0.005 ? (delta / Math.abs(baseline.v)) * 100 : null
  return { delta, pct }
}

const ACTIVITY_BUCKETS: { key: 'today' | 'yesterday' | 'thisWeek' | 'earlier'; label: string }[] = [
  { key: 'today',     label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'thisWeek',  label: 'Earlier this week' },
  { key: 'earlier',   label: 'Earlier' },
]

function bucketActivity(entries: ActivityEntry[]): Record<'today' | 'yesterday' | 'thisWeek' | 'earlier', ActivityEntry[]> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86_400_000
  const weekStart = todayStart - 7 * 86_400_000
  const out = { today: [] as ActivityEntry[], yesterday: [] as ActivityEntry[], thisWeek: [] as ActivityEntry[], earlier: [] as ActivityEntry[] }
  entries.forEach(e => {
    if (e.ts >= todayStart) out.today.push(e)
    else if (e.ts >= yesterdayStart) out.yesterday.push(e)
    else if (e.ts >= weekStart) out.thisWeek.push(e)
    else out.earlier.push(e)
  })
  return out
}

function DailyDelta({ history, fmt }: { history: NwHistoryPoint[]; fmt: (chf: number) => string }) {
  const dd = useMemo(() => dailyDelta(history), [history])
  if (!dd) return null
  const { delta, pct } = dd
  if (Math.abs(delta) < 0.005) {
    return <span className={`${styles.dailyDelta} ${styles.flat}`}>flat · 24h</span>
  }
  const up = delta > 0
  const sign = up ? '+' : '−'
  const amt = fmt(Math.abs(delta))
  const pctLabel = pct == null
    ? null
    : `${up ? '+' : '−'}${Math.abs(pct) >= 100 ? Math.abs(pct).toFixed(0) : Math.abs(pct).toFixed(2)}%`
  return (
    <span className={`${styles.dailyDelta} ${up ? styles.up : styles.down}`}>
      {sign}{amt}
      {pctLabel && <span className={styles.dailyDeltaPct}>{pctLabel}</span>}
      <span className={styles.dailyDeltaWindow}>· 24h</span>
    </span>
  )
}

const CATEGORY_ORDER: { key: AccountType; label: string; placeholderName: string; placeholderAmt: string }[] = [
  { key: 'bank',   label: 'Bank accounts',       placeholderName: 'Account name',  placeholderAmt: 'Amount' },
  { key: 'stocks', label: 'Stocks · investments', placeholderName: 'Stock / fund',  placeholderAmt: 'Value'  },
  { key: 'crypto', label: 'Crypto · live',       placeholderName: 'Coin (e.g. BTC)', placeholderAmt: 'Value' },
  { key: 'other',  label: 'Other assets',        placeholderName: 'Asset name',    placeholderAmt: 'Value'  },
  { key: 'debt',   label: 'Debt · liabilities',  placeholderName: 'Card / loan',   placeholderAmt: 'Balance owed' },
]

/**
 * Donut + activity colors. Mint variations carry the assets; amber on subs
 * is semantically "outflow" (echoes the dashboard ·04 amber that opens the
 * module). Red would feel alarmist for normal monthly bills.
 */
const TYPE_COLORS: Record<AccountType, string> = {
  bank:   '#6EE7B7',  // mint
  stocks: '#A7F3D0',  // pale mint
  crypto: '#34D399',  // deeper mint
  debt:   '#F87171',  // soft red — liability
  other:  'rgba(255, 255, 255, 0.45)',
}

const SUBS_COLOR = '#F59E0B'  // amber — subs slice

/**
 * Per-account accent dots for bank accounts, so "star", "Revolut", "UBS" etc.
 * each read as a distinct row at a glance instead of an undifferentiated list.
 * Picked deterministically from the account id so a given account keeps its
 * color across sessions and devices.
 */
const BANK_COLORS = [
  '#6EE7B7', '#34D399', '#5EEAD4', '#38BDF8', '#818CF8',
  '#C084FC', '#F472B6', '#FBBF24', '#FB923C', '#A3E635',
]
function bankColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return BANK_COLORS[h % BANK_COLORS.length]
}

const TYPE_LABELS: Record<AccountType, string> = {
  bank: 'Bank',
  stocks: 'Stocks',
  crypto: 'Crypto',
  debt: 'Debt',
  other: 'Other',
}

// -----------------------------------------------------------------------------
// Account category card
// -----------------------------------------------------------------------------

function AccountCard({
  type,
  label,
  placeholderName,
  placeholderAmt,
  accounts,
  actions,
  fmt,
  state,
  rates,
  netWorth,
}: {
  type: AccountType
  label: string
  placeholderName: string
  placeholderAmt: string
  accounts: Account[]
  actions: FinanceActions
  fmt: (chf: number) => string
  state: FinanceState
  rates: ExchangeRates
  netWorth: number
}) {
  const items = accounts.filter(a => a.type === type)
  const total = items.reduce((s, a) => s + a.amountCHF, 0)
  const isDebt = type === 'debt'
  // Debt is a liability — show it as a red minus, no "% of net worth".
  const pct = !isDebt && netWorth > 0 && total > 0 ? (total / netWorth) * 100 : null
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [showAdd, setShowAdd] = useState(items.length === 0)

  function handleAdd() {
    const a = parseFloat(amount)
    if (!name.trim() || !isFinite(a)) return
    actions.addAccount(type, name, a)
    setName('')
    setAmount('')
  }

  return (
    <div className={styles.accountCard}>
      <div className={styles.accountHead}>
        <span className={styles.accountLabel}>{label}</span>
        <span className={`${styles.accountTotal} ${isDebt ? styles.accountTotalDebt : ''}`}>
          {isDebt && total > 0 ? '−' : ''}{fmt(total)}
          {pct != null && <span className={styles.accountTotalPct}>· {pct.toFixed(1)}%</span>}
        </span>
      </div>

      <div className={styles.accountList}>
        {items.map(acct => (
          <AccountRow
            key={acct.id}
            acct={acct}
            actions={actions}
            fmt={fmt}
            state={state}
            rates={rates}
          />
        ))}
      </div>

      {showAdd ? (
        <div className={styles.quickAdd}>
          <input
            className={styles.quickAddInput}
            type="text"
            value={name}
            placeholder={placeholderName}
            autoFocus={items.length > 0}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          />
          <input
            className={styles.quickAddInput}
            type="number"
            inputMode="decimal"
            step="0.01"
            value={amount}
            placeholder={placeholderAmt}
            onChange={e => setAmount(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          />
          <button type="button" className={styles.quickAddBtn} onClick={handleAdd}>+</button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.addToggle}
          onClick={() => setShowAdd(true)}
        >
          + add
        </button>
      )}
    </div>
  )
}

function AccountRow({
  acct,
  actions,
  fmt,
  state,
  rates,
}: {
  acct: Account
  actions: FinanceActions
  fmt: (chf: number) => string
  state: FinanceState
  rates: ExchangeRates
}) {
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(acct.name)
  const [editingAmt, setEditingAmt] = useState(false)
  const displayAmt = chfToDisplay(acct.amountCHF, state.currency, rates)
  const initialAmtStr = String(displayAmt.toFixed(displayAmt % 1 === 0 ? 0 : 2))
  const [amtDraft, setAmtDraft] = useState(initialAmtStr)

  function saveName() {
    actions.renameAccount(acct.id, nameDraft)
    setEditingName(false)
  }
  function saveAmt() {
    const v = amtDraft.trim()
    if (v === '') { setEditingAmt(false); return }
    let nextDisplay = displayAmt
    if (/^[+\-]\s*\d/.test(v)) {
      const delta = parseFloat(v.replace(/\s+/g, ''))
      if (isFinite(delta)) nextDisplay = displayAmt + delta
    } else {
      const n = parseFloat(v)
      if (isFinite(n)) nextDisplay = n
    }
    actions.setAccountAmount(acct.id, Math.max(0, nextDisplay))
    setEditingAmt(false)
  }

  return (
    <div className={styles.accountRow}>
      <div className={styles.accountRowNameWrap}>
      {acct.type === 'bank' && (
        <span className={styles.accountDot} style={{ background: bankColor(acct.id) }} aria-hidden />
      )}
      {editingName ? (
        <input
          className={styles.inlineEditInput}
          autoFocus
          value={nameDraft}
          onChange={e => setNameDraft(e.target.value)}
          onBlur={saveName}
          onKeyDown={e => {
            if (e.key === 'Enter') saveName()
            else if (e.key === 'Escape') { setNameDraft(acct.name); setEditingName(false) }
          }}
        />
      ) : (
        <span
          className={styles.accountRowName}
          role="button"
          tabIndex={0}
          aria-label={`Rename ${acct.name}`}
          title="Edit to rename"
          onClick={() => { setNameDraft(acct.name); setEditingName(true) }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setNameDraft(acct.name); setEditingName(true) }
          }}
        >
          {acct.name}
        </span>
      )}
      </div>

      {editingAmt ? (
        <input
          className={`${styles.inlineEditInput} ${styles.inlineEditAmt}`}
          autoFocus
          value={amtDraft}
          onChange={e => setAmtDraft(e.target.value)}
          onBlur={saveAmt}
          onKeyDown={e => {
            if (e.key === 'Enter') saveAmt()
            else if (e.key === 'Escape') setEditingAmt(false)
          }}
        />
      ) : (
        <span
          className={styles.accountRowAmount}
          role="button"
          tabIndex={0}
          aria-label={`Edit balance, currently ${fmt(acct.amountCHF)}`}
          title="Edit · type +500 to add, -200 to subtract, or a new total"
          onClick={() => { setAmtDraft(initialAmtStr); setEditingAmt(true) }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAmtDraft(initialAmtStr); setEditingAmt(true) }
          }}
        >
          {fmt(acct.amountCHF)}
        </span>
      )}

      <button
        type="button"
        className={styles.deleteBtn}
        title="Delete"
        onClick={() => actions.deleteAccount(acct.id)}
      >
        ×
      </button>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Stocks card — holdings + manual entries
// -----------------------------------------------------------------------------

/**
 * Build a plain-English research prompt from the user's stock holdings + live
 * quotes. Pasted into Claude (Desktop, where their connectors live, or the web)
 * it asks, simply, whether each is good to hold and what news is moving it.
 */
function buildStockResearchPrompt(stockAccounts: Account[], quotes: QuoteMap): string {
  const lines = stockAccounts.map(a => {
    if (a.ticker) {
      const q = quotes[a.ticker.toUpperCase()]
      const price = q ? `$${q.priceUSD.toFixed(2)}` : 'price n/a'
      const chg = q && q.changePct != null ? `, ${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}% today` : ''
      return `- ${a.ticker}${a.shares ? ` (${a.shares} sh)` : ''}: ${price}${chg}`
    }
    return `- ${a.name} (manual entry, no ticker)`
  })
  return [
    'I want a simple, plain-English read on my stock & ETF holdings.',
    'For EACH holding below, in 2–3 short sentences max:',
    '1) Is it good to hold right now, or should I be cautious — and why, simply.',
    "2) The latest news moving it (today / this week).",
    '3) Any red flags I should know.',
    'Use web search for current prices and news. No jargon, no disclaimers padding — just an honest, simple read.',
    '',
    "My holdings (with today's move):",
    ...lines,
  ].join('\n')
}

function StocksCard({
  accounts,
  actions,
  fmt,
  state,
  rates,
  quotes,
  refreshQuotes,
  netWorth,
}: {
  accounts: Account[]
  actions: FinanceActions
  fmt: (chf: number) => string
  state: FinanceState
  rates: ExchangeRates
  quotes: QuoteMap
  refreshQuotes: () => void
  netWorth: number
}) {
  const stockAccounts = accounts.filter(a => a.type === 'stocks')
  const holdings = stockAccounts.filter(a => !!a.ticker)
  const manuals = stockAccounts.filter(a => !a.ticker)
  const total = stockAccounts.reduce((s, a) => s + a.amountCHF, 0)
  const pct = netWorth > 0 && total > 0 ? (total / netWorth) * 100 : null

  const [ticker, setTicker] = useState('')
  const [shares, setShares] = useState('')
  const [showAdd, setShowAdd] = useState(holdings.length === 0 && manuals.length === 0)
  const [showManual, setShowManual] = useState(manuals.length > 0)
  const [manualName, setManualName] = useState('')
  const [manualAmt, setManualAmt] = useState('')

  function handleAddHolding() {
    const s = parseFloat(shares)
    if (!ticker.trim() || !isFinite(s) || s <= 0) return
    actions.addHolding(ticker, s)
    setTicker('')
    setShares('')
  }

  function handleAddManual() {
    const a = parseFloat(manualAmt)
    if (!manualName.trim() || !isFinite(a)) return
    actions.addAccount('stocks', manualName, a)
    setManualName('')
    setManualAmt('')
  }

  const [askedClaude, setAskedClaude] = useState(false)
  function askClaude() {
    const prompt = buildStockResearchPrompt(stockAccounts, quotes)
    // Copy so it can be pasted into Claude Desktop (where the user's connectors
    // live), and also open a fresh claude.ai chat pre-filled with the prompt.
    navigator.clipboard?.writeText(prompt).catch(() => {})
    window.open(`https://claude.ai/new?q=${encodeURIComponent(prompt)}`, '_blank', 'noopener,noreferrer')
    setAskedClaude(true)
    setTimeout(() => setAskedClaude(false), 3000)
  }

  return (
    <div className={styles.accountCard}>
      <div className={styles.accountHead}>
        <span className={styles.accountLabel}>Stocks · investments</span>
        <span className={styles.accountTotal}>
          {fmt(total)}
          {pct != null && <span className={styles.accountTotalPct}>· {pct.toFixed(1)}%</span>}
        </span>
      </div>

      <div className={styles.accountList}>
        {holdings.map(acct => (
          <HoldingRow
            key={acct.id}
            acct={acct}
            quote={quotes[(acct.ticker || '').toUpperCase()]}
            actions={actions}
            fmt={fmt}
          />
        ))}
        {manuals.map(acct => (
          <AccountRow
            key={acct.id}
            acct={acct}
            actions={actions}
            fmt={fmt}
            state={state}
            rates={rates}
          />
        ))}
      </div>

      {showAdd ? (
        <div className={styles.quickAdd}>
          <input
            className={styles.quickAddInput}
            type="text"
            value={ticker}
            placeholder="Ticker (e.g. VTI)"
            autoCapitalize="characters"
            spellCheck={false}
            autoFocus={holdings.length > 0}
            onChange={e => setTicker(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter') handleAddHolding() }}
          />
          <input
            className={styles.quickAddInput}
            type="number"
            inputMode="decimal"
            step="0.0001"
            value={shares}
            placeholder="Shares"
            onChange={e => setShares(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddHolding() }}
          />
          <button type="button" className={styles.quickAddBtn} onClick={handleAddHolding}>+</button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.addToggle}
          onClick={() => setShowAdd(true)}
        >
          + add holding
        </button>
      )}

      <div className={styles.holdingsFooter}>
        <button
          type="button"
          className={styles.linkAction}
          onClick={refreshQuotes}
          title="Force a fresh quote fetch (otherwise cached for 15 min)"
        >
          ↻ refresh prices
        </button>
        {showManual ? null : (
          <button
            type="button"
            className={styles.linkAction}
            onClick={() => setShowManual(true)}
          >
            + add manual entry
          </button>
        )}
      </div>

      {stockAccounts.length > 0 && (
        <button
          type="button"
          className={styles.askClaudeBtn}
          onClick={askClaude}
          title="Copies a ready-made prompt and opens Claude — paste into Claude Desktop to use your connectors"
        >
          <span className={styles.askClaudeIcon} aria-hidden>✦</span>
          {askedClaude
            ? 'Prompt copied — paste into Claude Desktop'
            : 'Ask Claude: are these good to hold?'}
        </button>
      )}

      {showManual && (
        <div className={styles.quickAdd}>
          <input
            className={styles.quickAddInput}
            type="text"
            value={manualName}
            placeholder="Name (e.g. 401k)"
            onChange={e => setManualName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddManual() }}
          />
          <input
            className={styles.quickAddInput}
            type="number"
            inputMode="decimal"
            step="0.01"
            value={manualAmt}
            placeholder="Value"
            onChange={e => setManualAmt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddManual() }}
          />
          <button type="button" className={styles.quickAddBtn} onClick={handleAddManual}>+</button>
        </div>
      )}
    </div>
  )
}

const SPARK_W = 52
const SPARK_H = 16

function Sparkline({ points }: { points: PricePoint[] }) {
  // Memoize: points is recomputed per render upstream, but the path/min/max only
  // change when the underlying price series does.
  const geom = useMemo(() => {
    if (points.length < 2) return null
    const vals = points.map(p => p.p)
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const range = max - min || 1
    // 1px stroke would clip at the top/bottom edges; reserve a small inset.
    const PAD = 1.5
    const path = points
      .map((p, i) => {
        const x = (i / (points.length - 1)) * SPARK_W
        const y = SPARK_H - PAD - ((p.p - min) / range) * (SPARK_H - PAD * 2)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(' ')
    const first = points[0].p
    const lastP = points[points.length - 1].p
    const pctChange = first ? ((lastP - first) / first) * 100 : 0
    return { path, up: lastP >= first, pctChange }
  }, [points])

  if (!geom) return null
  const { path, up, pctChange } = geom
  // Text equivalent so the 7-day trend isn't color/shape-only (this is the only
  // place the 7-day direction is shown).
  const trendLabel = `7-day trend: ${up ? 'up' : 'down'} ${Math.abs(pctChange).toFixed(1)}%`
  return (
    <svg
      className={`${styles.sparkline} ${up ? styles.up : styles.down}`}
      width={SPARK_W}
      height={SPARK_H}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      role="img"
      aria-label={trendLabel}
    >
      <title>{trendLabel}</title>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function HoldingRow({
  acct,
  quote,
  actions,
  fmt,
}: {
  acct: Account
  quote: StockQuote | undefined
  actions: FinanceActions
  fmt: (chf: number) => string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(acct.shares ?? 0))
  const sparkPoints = useMemo(() => priceHistoryWithin(acct.priceHistory, 7), [acct.priceHistory])

  function saveShares() {
    const next = parseFloat(draft)
    if (isFinite(next) && next >= 0) actions.setHoldingShares(acct.id, next)
    setEditing(false)
  }

  const [open, setOpen] = useState(false)

  // Price formatted as plain USD with up to 2 decimals.
  const usd = (n: number | null | undefined) =>
    n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const priceLabel = quote ? usd(quote.priceUSD) : '-'
  const changeLabel = quote && quote.changePct != null
    ? `${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(2)}%`
    : null
  const changeCls = quote && quote.changePct != null
    ? (quote.changePct >= 0 ? styles.up : styles.down)
    : ''

  // "Today" detail — only offered when Finnhub gave us at least one intraday stat.
  const dayStats: { label: string; value: number | null | undefined }[] = quote
    ? [
        { label: 'Open', value: quote.openUSD },
        { label: 'High', value: quote.highUSD },
        { label: 'Low', value: quote.lowUSD },
        { label: 'Prev close', value: quote.prevCloseUSD },
      ]
    : []
  const hasDetail = dayStats.some(s => s.value != null)
  const dayChangeLabel = quote && quote.changeUSD != null
    ? `${quote.changeUSD >= 0 ? '+' : '−'}$${Math.abs(quote.changeUSD).toFixed(2)}${changeLabel ? ` (${changeLabel})` : ''}`
    : changeLabel

  return (
    <div className={styles.holdingWrap}>
    <div className={styles.holdingRow}>
      <span className={styles.tickerPill}>{acct.ticker}</span>

      {editing ? (
        <input
          className={`${styles.inlineEditInput} ${styles.holdingSharesInput}`}
          autoFocus
          type="number"
          inputMode="decimal"
          step="0.0001"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={saveShares}
          onKeyDown={e => {
            if (e.key === 'Enter') saveShares()
            else if (e.key === 'Escape') { setDraft(String(acct.shares ?? 0)); setEditing(false) }
          }}
        />
      ) : (
        <span
          className={styles.holdingShares}
          role="button"
          tabIndex={0}
          aria-label={`Edit share count, currently ${acct.shares ?? 0}`}
          title="Edit share count"
          onClick={() => { setDraft(String(acct.shares ?? 0)); setEditing(true) }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDraft(String(acct.shares ?? 0)); setEditing(true) }
          }}
        >
          {acct.shares ?? 0} sh
        </span>
      )}

      {hasDetail ? (
        <span
          className={`${styles.holdingPrice} ${styles.holdingPriceToggle}`}
          role="button"
          tabIndex={0}
          aria-expanded={open}
          title="See how it's moving today"
          onClick={() => setOpen(o => !o)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o) } }}
        >
          <Sparkline points={sparkPoints} />
          {priceLabel}
          {changeLabel && (
            <span className={`${styles.holdingChange} ${changeCls}`}>{changeLabel}</span>
          )}
          <span className={styles.holdingCaret} aria-hidden>{open ? '▴' : '▾'}</span>
        </span>
      ) : (
        <span className={styles.holdingPrice}>
          <Sparkline points={sparkPoints} />
          {priceLabel}
          {changeLabel && (
            <span className={`${styles.holdingChange} ${changeCls}`}>{changeLabel}</span>
          )}
        </span>
      )}

      <span
        className={styles.accountRowAmount}
        title={quote ? 'Live value (USD price × shares, converted to display currency)' : 'Last known value — live price unavailable right now'}
      >
        {fmt(acct.amountCHF)}
        {!quote && acct.amountCHF > 0 && <span className={styles.holdingStale}> · cached</span>}
      </span>

      <button
        type="button"
        className={styles.deleteBtn}
        title="Delete"
        onClick={() => actions.deleteAccount(acct.id)}
      >
        ×
      </button>
    </div>
    {open && hasDetail && (
      <div className={styles.holdingDetail}>
        <div className={styles.holdingDetailHead}>
          <span>{acct.ticker} today</span>
          {dayChangeLabel && (
            <span className={`${styles.holdingDetailChange} ${changeCls}`}>{dayChangeLabel}</span>
          )}
        </div>
        <div className={styles.holdingDetailStats}>
          {dayStats.map(s => (
            <div key={s.label} className={styles.holdingStat}>
              <span className={styles.holdingStatLabel}>{s.label}</span>
              <span className={styles.holdingStatValue}>{usd(s.value)}</span>
            </div>
          ))}
        </div>
      </div>
    )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Crypto — live holdings (mirror of stocks, priced in CHF via CoinGecko)
// -----------------------------------------------------------------------------

function CryptoRow({
  acct,
  quote,
  actions,
  fmt,
}: {
  acct: Account
  quote: CryptoQuote | undefined
  actions: FinanceActions
  fmt: (chf: number) => string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(acct.shares ?? 0))
  const sparkPoints = useMemo(() => priceHistoryWithin(acct.priceHistory, 7), [acct.priceHistory])

  function saveQty() {
    const next = parseFloat(draft)
    if (isFinite(next) && next >= 0) actions.setHoldingShares(acct.id, next)
    setEditing(false)
  }

  const priceLabel = quote ? fmt(quote.priceCHF) : '-'
  const changeLabel = quote && quote.changePct != null
    ? `${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(2)}%`
    : null
  const changeCls = quote && quote.changePct != null
    ? (quote.changePct >= 0 ? styles.up : styles.down)
    : ''

  return (
    <div className={styles.holdingRow}>
      <span className={styles.tickerPill}>{acct.name}</span>

      {editing ? (
        <input
          className={`${styles.inlineEditInput} ${styles.holdingSharesInput}`}
          autoFocus
          type="number"
          inputMode="decimal"
          step="0.00000001"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={saveQty}
          onKeyDown={e => {
            if (e.key === 'Enter') saveQty()
            else if (e.key === 'Escape') { setDraft(String(acct.shares ?? 0)); setEditing(false) }
          }}
        />
      ) : (
        <span
          className={styles.holdingShares}
          role="button"
          tabIndex={0}
          aria-label={`Edit quantity, currently ${acct.shares ?? 0}`}
          title="Edit quantity"
          onClick={() => { setDraft(String(acct.shares ?? 0)); setEditing(true) }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDraft(String(acct.shares ?? 0)); setEditing(true) }
          }}
        >
          {acct.shares ?? 0}
        </span>
      )}

      <span className={styles.holdingPrice}>
        <Sparkline points={sparkPoints} />
        {priceLabel}
        {changeLabel && (
          <span className={`${styles.holdingChange} ${changeCls}`}>{changeLabel}</span>
        )}
      </span>

      <span
        className={styles.accountRowAmount}
        title={quote ? 'Live value (CHF price × quantity)' : 'Last known value — live price unavailable right now'}
      >
        {fmt(acct.amountCHF)}
        {!quote && acct.amountCHF > 0 && <span className={styles.holdingStale}> · cached</span>}
      </span>

      <button
        type="button"
        className={styles.deleteBtn}
        title="Delete"
        onClick={() => actions.deleteAccount(acct.id)}
      >
        ×
      </button>
    </div>
  )
}

function CryptoCard({
  accounts,
  actions,
  fmt,
  state,
  rates,
  cryptoQuotes,
  refreshCryptoQuotes,
  netWorth,
}: {
  accounts: Account[]
  actions: FinanceActions
  fmt: (chf: number) => string
  state: FinanceState
  rates: ExchangeRates
  cryptoQuotes: CryptoQuoteMap
  refreshCryptoQuotes: () => void
  netWorth: number
}) {
  const cryptoAccounts = accounts.filter(a => a.type === 'crypto')
  const holdings = cryptoAccounts.filter(a => !!a.ticker)
  const manuals = cryptoAccounts.filter(a => !a.ticker)
  const total = cryptoAccounts.reduce((s, a) => s + a.amountCHF, 0)
  const pct = netWorth > 0 && total > 0 ? (total / netWorth) * 100 : null

  const [coin, setCoin] = useState('')
  const [qty, setQty] = useState('')
  const [showAdd, setShowAdd] = useState(holdings.length === 0 && manuals.length === 0)
  const [showManual, setShowManual] = useState(manuals.length > 0)
  const [manualName, setManualName] = useState('')
  const [manualAmt, setManualAmt] = useState('')
  const [coinErr, setCoinErr] = useState(false)

  function handleAddHolding() {
    const q = parseFloat(qty)
    const meta = resolveCoin(coin)
    if (!meta) { setCoinErr(true); return }
    if (!isFinite(q) || q <= 0) return
    actions.addCryptoHolding(meta.id, meta.symbol, q)
    setCoin(''); setQty(''); setCoinErr(false)
  }

  function handleAddManual() {
    const a = parseFloat(manualAmt)
    if (!manualName.trim() || !isFinite(a)) return
    actions.addAccount('crypto', manualName, a)
    setManualName(''); setManualAmt('')
  }

  return (
    <div className={styles.accountCard}>
      <div className={styles.accountHead}>
        <span className={styles.accountLabel}>Crypto · live</span>
        <span className={styles.accountTotal}>
          {fmt(total)}
          {pct != null && <span className={styles.accountTotalPct}>· {pct.toFixed(1)}%</span>}
        </span>
      </div>

      <div className={styles.accountList}>
        {holdings.map(acct => (
          <CryptoRow
            key={acct.id}
            acct={acct}
            quote={cryptoQuotes[(acct.ticker || '').toLowerCase()]}
            actions={actions}
            fmt={fmt}
          />
        ))}
        {manuals.map(acct => (
          <AccountRow
            key={acct.id}
            acct={acct}
            actions={actions}
            fmt={fmt}
            state={state}
            rates={rates}
          />
        ))}
      </div>

      {showAdd ? (
        <div className={styles.quickAdd}>
          <input
            className={styles.quickAddInput}
            type="text"
            value={coin}
            placeholder="Coin (e.g. BTC)"
            list="vty-coin-list"
            autoCapitalize="characters"
            spellCheck={false}
            autoFocus={holdings.length > 0}
            onChange={e => { setCoin(e.target.value); setCoinErr(false) }}
            onKeyDown={e => { if (e.key === 'Enter') handleAddHolding() }}
          />
          <input
            className={styles.quickAddInput}
            type="number"
            inputMode="decimal"
            step="0.00000001"
            value={qty}
            placeholder="Quantity"
            onChange={e => setQty(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddHolding() }}
          />
          <button type="button" className={styles.quickAddBtn} onClick={handleAddHolding}>+</button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.addToggle}
          onClick={() => setShowAdd(true)}
        >
          + add coin
        </button>
      )}
      {coinErr && (
        <div className={styles.cryptoHint}>
          Unknown coin — try a ticker like BTC, ETH, or SOL, or add it as a manual entry below.
        </div>
      )}

      <datalist id="vty-coin-list">
        {COINS.map(c => (
          <option key={c.id} value={c.symbol}>{c.name}</option>
        ))}
      </datalist>

      <div className={styles.holdingsFooter}>
        <button
          type="button"
          className={styles.linkAction}
          onClick={refreshCryptoQuotes}
          title="Force a fresh price fetch (otherwise cached for 15 min)"
        >
          ↻ refresh prices
        </button>
        {showManual ? null : (
          <button
            type="button"
            className={styles.linkAction}
            onClick={() => setShowManual(true)}
          >
            + add manual entry
          </button>
        )}
      </div>

      {showManual && (
        <div className={styles.quickAdd}>
          <input
            className={styles.quickAddInput}
            type="text"
            value={manualName}
            placeholder="Name (e.g. cold wallet)"
            onChange={e => setManualName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddManual() }}
          />
          <input
            className={styles.quickAddInput}
            type="number"
            inputMode="decimal"
            step="0.01"
            value={manualAmt}
            placeholder="Value"
            onChange={e => setManualAmt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddManual() }}
          />
          <button type="button" className={styles.quickAddBtn} onClick={handleAddManual}>+</button>
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Chart
// -----------------------------------------------------------------------------

function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return ''
  if (points.length === 2) {
    return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`
  }
  const d = [`M${points[0].x},${points[0].y}`]
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] || p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d.push(`C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`)
  }
  return d.join(' ')
}

const CHART_PERIODS: { key: string; label: string; days: number | null }[] = [
  { key: '1D',  label: '1D', days: 1 },
  { key: '1W',  label: '1W', days: 7 },
  { key: '1M',  label: '1M', days: 30 },
  { key: '1Y',  label: '1Y', days: 365 },
  { key: 'ALL', label: 'All', days: null },
]

function PeriodToggle({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <div className={styles.periodSeg}>
      {CHART_PERIODS.map(p => (
        <button
          key={p.key}
          type="button"
          className={`${styles.periodBtn} ${value === p.key ? styles.periodBtnActive : ''}`}
          onClick={() => onChange(p.key)}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

const NW_W = 600
const NW_H = 200
const NW_PAD = 8

function NwChart({
  history: fullHistory,
  fmt,
}: {
  history: NwHistoryPoint[]
  fmt: (chf: number) => string
}) {
  const [periodKey, setPeriodKey] = useState<string>('ALL')
  const activePeriod = CHART_PERIODS.find(p => p.key === periodKey) ?? CHART_PERIODS[CHART_PERIODS.length - 1]

  // Filter to the active window. If filtering would leave fewer than 2 points,
  // pad with the most recent earlier snapshot so the chart still draws a line
  // anchored at "where you were entering this window."
  const history = useMemo(() => {
    if (activePeriod.days == null) return fullHistory
    const cutoff = Date.now() - activePeriod.days * 86_400_000
    const inWindow = fullHistory.filter(p => p.t >= cutoff)
    if (inWindow.length >= 2 || fullHistory.length === 0) return inWindow
    // Anchor: latest point before the window, so 1-point windows still render.
    let anchor: NwHistoryPoint | null = null
    for (let i = fullHistory.length - 1; i >= 0; i--) {
      if (fullHistory[i].t < cutoff) { anchor = fullHistory[i]; break }
    }
    return anchor ? [anchor, ...inWindow] : inWindow
  }, [fullHistory, activePeriod])

  // The expensive geometry (min/max + Catmull-Rom path strings) only depends on
  // the windowed history + formatter, so memoize it rather than rebuilding the
  // path on every parent re-render (currency toggle, quote tick, persist cycle).
  const chart = useMemo(() => {
    if (history.length < 1) return null
    const first = history[0].v
    const last = history[history.length - 1].v
    const change = last - first
    const direction = Math.abs(change) < 0.005 ? 'flat' : change > 0 ? 'up' : 'down'
    const color = direction === 'up' ? 'var(--mint)' : direction === 'down' ? 'var(--red)' : 'var(--muted)'

    let deltaLabel = '-'
    if (direction === 'flat') {
      deltaLabel = 'Flat'
    } else if (Math.abs(first) < 0.5) {
      const sign = change > 0 ? '+' : '−'
      deltaLabel = sign + fmt(Math.abs(change))
    } else {
      const pct = (change / Math.abs(first)) * 100
      const sign = change > 0 ? '+' : '−'
      const absPct = Math.abs(pct)
      // Cap percentages off a near-zero baseline so a CHF 0.01 → 1000 jump
      // doesn't render +9,999,900%.
      const pctStr = absPct >= 1000 ? '>999' : absPct >= 100 ? absPct.toFixed(0) : absPct >= 10 ? absPct.toFixed(1) : absPct.toFixed(2)
      deltaLabel = `${sign}${pctStr}%`
    }

    const vals = history.map(p => p.v)
    const minV = Math.min(...vals)
    const maxV = Math.max(...vals)
    const range = maxV - minV || Math.max(1, Math.abs(maxV))

    let lineD = ''
    let areaD = ''
    if (history.length === 1) {
      const y = NW_H / 2
      lineD = `M0,${y} L${NW_W},${y}`
      areaD = `${lineD} L${NW_W},${NW_H} L0,${NW_H} Z`
    } else {
      const points = history.map((p, i) => ({
        x: (i / (history.length - 1)) * NW_W,
        y: NW_H - NW_PAD - ((p.v - minV) / range) * (NW_H - NW_PAD * 2),
      }))
      lineD = smoothPath(points)
      const lastPt = points[points.length - 1]
      const firstPt = points[0]
      areaD = `${lineD} L${lastPt.x},${NW_H} L${firstPt.x},${NW_H} Z`
    }
    return { first, last, change, direction, color, deltaLabel, lineD, areaD }
  }, [history, fmt])

  if (!chart) {
    return (
      <div className={styles.chartWrap}>
        <div className={styles.chartHead}>
          <span className={styles.chartLabel}>{activePeriod.key === 'ALL' ? 'All-time' : activePeriod.label}</span>
          <PeriodToggle value={periodKey} onChange={setPeriodKey} />
        </div>
        <div className={styles.chartEmpty}>Add or edit an asset to start tracking net worth over time.</div>
        <ChartStats history={history} fmt={fmt} />
      </div>
    )
  }

  const { first, last, direction, color, deltaLabel, lineD, areaD } = chart
  const periodName = activePeriod.key === 'ALL' ? 'All-time' : activePeriod.label
  const chartLabel = `Net worth ${periodName}: ${deltaLabel}, ${fmt(first)} to ${fmt(last)}`

  return (
    <div className={styles.chartWrap}>
      <div className={styles.chartHead}>
        <div className={styles.chartHeadLeft}>
          <span className={styles.chartLabel}>{activePeriod.key === 'ALL' ? 'All-time' : activePeriod.label}</span>
          <span className={`${styles.chartDelta} ${direction === 'up' ? styles.up : direction === 'down' ? styles.down : ''}`}>
            {deltaLabel}
          </span>
        </div>
        <PeriodToggle value={periodKey} onChange={setPeriodKey} />
      </div>
      <svg
        className={styles.chartSvg}
        viewBox={`0 0 ${NW_W} ${NW_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={chartLabel}
        style={{ color }}
      >
        <title>{chartLabel}</title>
        <defs>
          <linearGradient id="nwChartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
            <stop offset="60%" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line className={styles.chartGrid} x1="0" x2={NW_W} y1="40" y2="40" />
        <line className={styles.chartGrid} x1="0" x2={NW_W} y1="100" y2="100" />
        <line className={styles.chartGrid} x1="0" x2={NW_W} y1="160" y2="160" />
        <path d={areaD} fill="url(#nwChartGrad)" className={styles.chartArea} />
        <path
          d={lineD}
          pathLength={1}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`${styles.chartLineStroke} ${styles.chartLineDraw}`}
        />
      </svg>
      <ChartStats history={history} fmt={fmt} />
    </div>
  )
}

function ChartStats({
  history,
  fmt,
}: {
  history: NwHistoryPoint[]
  fmt: (chf: number) => string
}) {
  if (!history.length) {
    return (
      <div className={styles.chartStatsRow}>
        <Stat label="1% of NW" value="-" />
        <Stat label="All-time high" value="-" />
        <Stat label="All-time low" value="-" />
        <Stat label="Snapshots" value="0" />
      </div>
    )
  }
  const vals = history.map(p => p.v)
  const last = vals[vals.length - 1]
  const high = Math.max(...vals)
  const low = Math.min(...vals)
  return (
    <div className={styles.chartStatsRow}>
      <Stat label="1% of NW" value={fmt(last / 100)} />
      <Stat label="All-time high" value={fmt(high)} />
      <Stat label="All-time low" value={fmt(low)} />
      <Stat label="Snapshots" value={String(history.length)} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.chartStat}>
      <span className={styles.chartStatLabel}>{label}</span>
      <span className={styles.chartStatVal}>{value}</span>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Donut
// -----------------------------------------------------------------------------

function donutArcPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
): string {
  const x1o = cx + rOuter * Math.cos(startAngle)
  const y1o = cy + rOuter * Math.sin(startAngle)
  const x2o = cx + rOuter * Math.cos(endAngle)
  const y2o = cy + rOuter * Math.sin(endAngle)
  const x1i = cx + rInner * Math.cos(endAngle)
  const y1i = cy + rInner * Math.sin(endAngle)
  const x2i = cx + rInner * Math.cos(startAngle)
  const y2i = cy + rInner * Math.sin(startAngle)
  const large = endAngle - startAngle > Math.PI ? 1 : 0
  return (
    `M ${x1o.toFixed(2)} ${y1o.toFixed(2)}` +
    ` A ${rOuter} ${rOuter} 0 ${large} 1 ${x2o.toFixed(2)} ${y2o.toFixed(2)}` +
    ` L ${x1i.toFixed(2)} ${y1i.toFixed(2)}` +
    ` A ${rInner} ${rInner} 0 ${large} 0 ${x2i.toFixed(2)} ${y2i.toFixed(2)}` +
    ' Z'
  )
}

function Donut({
  state,
  fmt,
  netWorth,
}: {
  state: FinanceState
  fmt: (chf: number) => string
  netWorth: number
}) {
  // Per-account slices colored by parent category, plus an annualized subs slice.
  const slices = useMemo(() => {
    const out: { id: string; name: string; color: string; value: number }[] = []
    state.accounts.forEach(a => {
      if (a.type === 'debt') return  // liabilities aren't part of asset allocation
      const v = a.amountCHF
      if (v > 0) {
        out.push({ id: a.id, name: a.name, color: TYPE_COLORS[a.type], value: v })
      }
    })
    const annualSubsCHF = state.subscriptions.reduce((s, sub) => s + monthlyEquivalent(sub) * 12, 0)
    if (annualSubsCHF > 0) {
      out.push({ id: '__subs', name: 'Subs / yr', color: SUBS_COLOR, value: annualSubsCHF })
    }
    out.sort((a, b) => b.value - a.value)
    return out
  }, [state.accounts, state.subscriptions])

  // Memoize the arc path strings + exact-100% legend percentages so the trig
  // only re-runs when the slices change, not on every parent re-render.
  const { total, arcs, legendPcts } = useMemo(() => {
    const total = slices.reduce((s, x) => s + x.value, 0)
    if (total <= 0) return { total: 0, arcs: [] as { id: string; color: string; d: string }[], legendPcts: [] as number[] }
    let angle = -Math.PI / 2
    const arcs: { id: string; color: string; d: string }[] = []
    slices.forEach(s => {
      const sliceAngle = (s.value / total) * Math.PI * 2
      const pad = slices.length > 1 ? 0.015 : 0
      const a1 = angle + pad
      const a2 = angle + sliceAngle - pad
      if (a2 > a1) {
        arcs.push({ id: s.id, color: s.color, d: donutArcPath(70, 70, 60, 44, a1, a2) })
      }
      angle += sliceAngle
    })
    const legendPcts = percentBreakdown(slices.map(s => s.value), total)
    return { total, arcs, legendPcts }
  }, [slices])

  if (!slices.length || total <= 0) {
    return (
      <div className={styles.donutWrap}>
        <div className={styles.chartHead}>
          <span className={styles.chartLabel}>Allocation</span>
          <span className={styles.chartDelta}>-</span>
        </div>
        <div className={styles.donutStage}>
          <svg className={styles.donutSvg} viewBox="0 0 140 140" aria-hidden>
            <circle cx="70" cy="70" r="60" fill="rgba(255,255,255,0.025)" />
            <circle cx="70" cy="70" r="44" fill="#000" />
          </svg>
          <div className={styles.donutCenter}>
            <div className={styles.donutNum}>-</div>
            <div className={styles.donutSub}>total</div>
          </div>
        </div>
        <div className={styles.donutEmpty}>Add an account to see your breakdown</div>
      </div>
    )
  }

  return (
    <div className={styles.donutWrap}>
      <div className={styles.chartHead}>
        <span className={styles.chartLabel}>Allocation</span>
        <span className={styles.chartDelta}>{slices.length} slice{slices.length === 1 ? '' : 's'}</span>
      </div>
      <div className={styles.donutStage}>
        <svg
          className={styles.donutSvg}
          viewBox="0 0 140 140"
          role="img"
          aria-label={`Allocation breakdown across ${slices.length} ${slices.length === 1 ? 'slice' : 'slices'}, total ${fmt(netWorth)}`}
        >
          {arcs.map(a => (
            <path key={a.id} d={a.d} fill={a.color} />
          ))}
        </svg>
        <div className={styles.donutCenter}>
          <div className={styles.donutNum}>{fmt(netWorth)}</div>
          <div className={styles.donutSub}>total</div>
        </div>
      </div>
      <div className={styles.donutLegend}>
        {slices.map((s, i) => (
          <div key={s.id} className={styles.donutLeg}>
            <span className={styles.donutLegDot} style={{ background: s.color }} aria-hidden />
            <span>{s.name}</span>
            <span className={styles.donutLegPct}>{(legendPcts[i] ?? 0).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Activity feed
// -----------------------------------------------------------------------------

function ActivityFeed({
  state,
  fmt,
}: {
  state: FinanceState
  fmt: (chf: number) => string
}) {
  const buckets = useMemo(() => {
    // Render all retained entries (capped at ACTIVITY_MAX upstream) so the
    // "N events" header count matches the rows actually shown.
    const sorted = [...state.activity].sort((a, b) => b.ts - a.ts)
    return bucketActivity(sorted)
  }, [state.activity])

  if (!state.activity.length) {
    return (
      <div className={styles.activity}>
        <div className={styles.activityHead}>
          <span className={styles.chartLabel}>Recent activity</span>
          <span className={styles.chartDelta}>-</span>
        </div>
        <div className={styles.activityEmpty}>Activity will appear here as you add or edit accounts.</div>
      </div>
    )
  }

  return (
    <div className={styles.activity}>
      <div className={styles.activityHead}>
        <span className={styles.chartLabel}>Recent activity</span>
        <span className={styles.chartDelta}>{state.activity.length} event{state.activity.length === 1 ? '' : 's'}</span>
      </div>
      <div className={styles.activityList}>
        {ACTIVITY_BUCKETS.map(b => {
          const entries = buckets[b.key]
          if (!entries.length) return null
          return (
            <div key={b.key} className={styles.activityBucket}>
              <div className={styles.activityBucketLabel}>{b.label}</div>
              {entries.map(e => {
                const color = TYPE_COLORS[e.accountType]
                const sign = e.deltaCHF >= 0 ? '+' : '−'
                const cls = e.deltaCHF >= 0 ? styles.up : styles.down
                const kind = e.kind === 'edit' ? 'edit' : e.kind === 'delete' ? 'delete' : 'add'
                return (
                  <div key={e.id} className={styles.activityRow}>
                    <span className={styles.activityBar} style={{ background: color }} />
                    <div className={styles.activityInfo}>
                      <div className={styles.activityName}>{e.name || '(unnamed)'}</div>
                      <div className={styles.activityMeta}>
                        {TYPE_LABELS[e.accountType]} · {kind}
                      </div>
                    </div>
                    <span className={`${styles.activityAmt} ${cls}`}>
                      {sign}{fmt(Math.abs(e.deltaCHF))}
                    </span>
                    <span className={styles.activityDate}>{formatActivityDate(e.ts)}</span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Net-worth goal ring (device-local target → progress around the hero)
// -----------------------------------------------------------------------------

function GoalRing({
  goalCHF,
  setGoalCHF,
  netWorth,
  fmt,
  rates,
  currency,
}: {
  goalCHF: number | null
  setGoalCHF: (v: number | null) => void
  netWorth: number
  fmt: (chf: number) => string
  rates: ExchangeRates
  currency: Currency
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const pct = goalCHF && goalCHF > 0 ? Math.max(0, Math.min(100, (netWorth / goalCHF) * 100)) : 0
  const R = 26
  const C = 2 * Math.PI * R
  const dash = (pct / 100) * C

  function save() {
    const v = parseFloat(draft)
    if (isFinite(v) && v > 0) setGoalCHF(displayToChf(v, currency, rates))
    else if (draft.trim() === '') setGoalCHF(null)
    setEditing(false)
    setDraft('')
  }

  if (editing) {
    return (
      <input
        className={styles.goalInput}
        type="number"
        inputMode="decimal"
        autoFocus
        placeholder="Target net worth"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === 'Enter') save()
          else if (e.key === 'Escape') { setEditing(false); setDraft('') }
        }}
      />
    )
  }

  if (!goalCHF) {
    return (
      <button type="button" className={styles.goalSet} onClick={() => { setEditing(true); setDraft('') }}>
        ◎ set a goal
      </button>
    )
  }

  return (
    <button
      type="button"
      className={styles.goalRing}
      onClick={() => { setEditing(true); setDraft('') }}
      title={`${Math.round(pct)}% of your ${fmt(goalCHF)} goal — click to edit`}
      aria-label={`Net-worth goal progress: ${Math.round(pct)} percent of ${fmt(goalCHF)}`}
    >
      <svg viewBox="0 0 64 64" className={styles.goalRingSvg} aria-hidden>
        <circle cx="32" cy="32" r={R} className={styles.goalTrack} fill="none" />
        <circle
          cx="32"
          cy="32"
          r={R}
          className={styles.goalProgress}
          fill="none"
          strokeDasharray={`${dash.toFixed(2)} ${C.toFixed(2)}`}
          strokeLinecap="round"
          transform="rotate(-90 32 32)"
        />
      </svg>
      <span className={styles.goalCenter}>{Math.round(pct)}%</span>
    </button>
  )
}

// -----------------------------------------------------------------------------
// Root view
// -----------------------------------------------------------------------------

export default function NetWorthView({ state, actions, fmt, rates, netWorth, quotes, refreshQuotes, cryptoQuotes, refreshCryptoQuotes }: Props) {
  const [importOpen, setImportOpen] = useState(false)
  const animatedNetWorth = useCountUp(netWorth)

  // Pull fresh quotes every time the Net Worth tab is opened. This view remounts
  // on tab switch (FinanceModule keys the tab wrapper), so this runs on each open
  // rather than only the first. The server cache (15 min) keeps it cheap.
  useEffect(() => {
    refreshQuotes()
    refreshCryptoQuotes()
  }, [refreshQuotes, refreshCryptoQuotes])

  const assets = useMemo(() => assetsChf(state.accounts), [state.accounts])
  const debt = useMemo(() => debtChf(state.accounts), [state.accounts])
  const runway = useMemo(
    () => runwayMonths(state.accounts, state.subscriptions, state.orders),
    [state.accounts, state.subscriptions, state.orders],
  )
  const { goalCHF, setGoalCHF } = useNetWorthGoal()
  const goalPace = useMemo(
    () => (goalCHF ? projectGoalDate(state.netWorthHistory, goalCHF) : null),
    [goalCHF, state.netWorthHistory],
  )

  const breakdown = useMemo(() => {
    const byType = netWorthByType(state.accounts)
    const parts: string[] = []
    ;(['bank', 'stocks', 'crypto', 'other'] as AccountType[]).forEach(t => {
      if (byType[t] > 0) parts.push(`${TYPE_LABELS[t]}: ${fmt(byType[t])}`)
    })
    return parts.join('  ·  ')
  }, [state.accounts, fmt])

  // Group once so each category card gets its own pre-filtered slice, instead of
  // every card re-filtering the full accounts array on each render.
  const accountsByType = useMemo(() => {
    const groups: Record<AccountType, Account[]> = { bank: [], stocks: [], crypto: [], debt: [], other: [] }
    state.accounts.forEach(a => { groups[a.type].push(a) })
    return groups
  }, [state.accounts])

  // First-run: no accounts have been added yet. We use this to upgrade the
  // hero's import affordance (larger CTA, helper line under the CHF 0) so
  // first contact feels like a guided moment instead of a blank dashboard.
  // Once the user has any account at all, we shrink back to the standard
  // "secondary action in the hero corner" treatment.
  const isFirstRun = state.accounts.length === 0

  return (
    <section className={styles.section}>
      <div className={styles.sectionEyebrow}>
        <span>Net worth</span>
      </div>

      <div className={`${styles.nwHero} ${isFirstRun ? styles.nwHeroFirstRun : ''}`}>
        <div className={styles.nwHeroMain}>
          <div className={styles.nwHeroLabel}>Total net worth</div>
          <div className={styles.nwHeroNumRow}>
            <span className={styles.nwHeroNum}>{fmt(animatedNetWorth)}</span>
            <DailyDelta history={state.netWorthHistory} fmt={fmt} />
            {!isFirstRun && <GoalRing goalCHF={goalCHF} setGoalCHF={setGoalCHF} netWorth={netWorth} fmt={fmt} rates={rates} currency={state.currency} />}
          </div>
          {breakdown && <div className={styles.nwHeroBreakdown}>{breakdown}</div>}
          {debt > 0 && (
            <div className={styles.nwHeroLiab}>
              Assets {fmt(assets)} <span className={styles.nwHeroLiabSep}>·</span>{' '}
              <span className={styles.nwHeroDebt}>Debt −{fmt(debt)}</span>
            </div>
          )}
          {runway != null && (
            <div className={styles.nwHeroRunway} title="Bank cash ÷ your monthly burn (subscriptions + last 30 days of spend)">
              ≈ <strong>{runway >= 99 ? '99+' : runway.toFixed(runway < 10 ? 1 : 0)}</strong> months of runway
            </div>
          )}
          {goalCHF != null && goalPace && (
            <div className={styles.nwHeroRunway} title="Projected from your recent net-worth trend">
              Goal: on pace for <strong>{goalPace.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</strong>
            </div>
          )}
          {isFirstRun && (
            <div className={styles.firstRunHint}>
              Import a statement screenshot, or add an account manually below to start tracking.
            </div>
          )}
        </div>
        <button
          type="button"
          className={`${styles.importTrigger} ${isFirstRun ? styles.importTriggerLarge : ''}`}
          onClick={() => setImportOpen(true)}
          aria-label="Import accounts from a screenshot"
        >
          <span className={styles.importTriggerIcon} aria-hidden>↗</span>
          <span className={styles.importTriggerText}>
            <span className={styles.importTriggerTitle}>Import from screenshot</span>
            <span className={styles.importTriggerSub}>
              {isFirstRun ? 'fastest way to get started' : 'read a statement in 5 seconds'}
            </span>
          </span>
        </button>
      </div>

      <ImportStatement
        open={importOpen}
        onClose={() => setImportOpen(false)}
        actions={actions}
        currentCurrency={state.currency}
        rates={rates}
      />

      <div className={styles.overviewGrid}>
        <NwChart history={state.netWorthHistory} fmt={fmt} />
        <Donut state={state} fmt={fmt} netWorth={netWorth} />
      </div>

      <div className={styles.accountsGrid}>
        {CATEGORY_ORDER.map(cat => (
          cat.key === 'stocks' ? (
            <StocksCard
              key={cat.key}
              accounts={accountsByType.stocks}
              actions={actions}
              fmt={fmt}
              state={state}
              rates={rates}
              quotes={quotes}
              refreshQuotes={refreshQuotes}
              netWorth={netWorth}
            />
          ) : cat.key === 'crypto' ? (
            <CryptoCard
              key={cat.key}
              accounts={accountsByType.crypto}
              actions={actions}
              fmt={fmt}
              state={state}
              rates={rates}
              cryptoQuotes={cryptoQuotes}
              refreshCryptoQuotes={refreshCryptoQuotes}
              netWorth={netWorth}
            />
          ) : (
            <AccountCard
              key={cat.key}
              type={cat.key}
              label={cat.label}
              placeholderName={cat.placeholderName}
              placeholderAmt={cat.placeholderAmt}
              accounts={accountsByType[cat.key]}
              actions={actions}
              fmt={fmt}
              state={state}
              rates={rates}
              netWorth={netWorth}
            />
          )
        ))}
      </div>

      <ActivityFeed state={state} fmt={fmt} />
    </section>
  )
}

// re-export so other views can read TYPE_COLORS / SUBS_COLOR consistently
export { TYPE_COLORS, SUBS_COLOR, TYPE_LABELS }

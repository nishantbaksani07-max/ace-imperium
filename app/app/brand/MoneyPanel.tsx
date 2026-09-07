'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import styles from './brand.module.css'
import type { Brand, BrandAccount, BrandMoneyEntry, BrandMoneyKind, BrandMoneyPeriod, Platform } from './types'
import type { BrandActions } from './state'
import type { SocialPlatform } from '@/lib/social/types'
import { analyticsUrl } from '@/lib/social/prompts'
import { getLocalDateKey } from '@/lib/dates'
import {
  type FinanceContext,
  deleteExpense,
  getFinanceContext,
  pullFinanceSubs,
  pushExpense,
} from './financeBridge'

/**
 * Money — the brand's tiny P&L. Two stacked lists in the Finance module's
 * shape (name · amount · period): money OUT (subs, tools, ad spend) and money
 * IN (sales, sponsorships, ad revenue). A single diverging chart shows green
 * (in) against red (out) per month so you can SEE whether the brand profits.
 *
 * Recurring entries (monthly/yearly) feed the steady monthly numbers and apply
 * to every month in the chart window; `once` entries are one-off spikes that
 * land on their dated month. Ad revenue has a "pull with Claude" helper that
 * opens the channel's earnings page read-only — paste the number back as income.
 *
 * Two-way Finance sync: a "Pull from Finance" button imports your Finance
 * subscriptions as money-out entries, and adding/editing/deleting a recurring
 * expense writes through to Finance (see ./financeBridge). Currency follows
 * Finance so amounts round-trip cleanly. One-offs + income stay brand-only.
 */

const SP: Partial<Record<Platform, SocialPlatform>> = {
  instagram: 'instagram', tiktok: 'tiktok', youtube: 'youtube', youtube_long: 'youtube',
}

const PERIODS: { value: BrandMoneyPeriod; label: string }[] = [
  { value: 'monthly', label: '/ mo' },
  { value: 'yearly', label: '/ yr' },
  { value: 'once', label: 'one-off' },
]

/** A recurring money-OUT entry mirrors to Finance; one-offs + income don't. */
function syncs(kind: BrandMoneyKind, period: BrandMoneyPeriod): boolean {
  return kind === 'out' && period !== 'once'
}

/** Monthly-equivalent of an entry (one-off entries don't recur). */
function monthlyOf(e: BrandMoneyEntry): number {
  if (e.period === 'monthly') return e.amount
  if (e.period === 'yearly') return e.amount / 12
  return 0
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function MoneyPanel({
  brand, actions, focusAccount,
}: {
  brand: Brand
  actions: BrandActions
  focusAccount: BrandAccount | null
}) {
  const currency = brand.finance?.currency ?? '$'
  const entries = useMemo(() => brand.finance?.entries ?? [], [brand.finance])
  const fmt = useCallback((n: number) => {
    const rounded = Math.round(n * 100) / 100
    const txt = Number.isInteger(rounded)
      ? rounded.toLocaleString()
      : rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return `${currency}${txt}`
  }, [currency])

  const ins = useMemo(() => entries.filter((e) => e.kind === 'in'), [entries])
  const outs = useMemo(() => entries.filter((e) => e.kind === 'out'), [entries])

  const monthlyIn = useMemo(() => ins.reduce((s, e) => s + monthlyOf(e), 0), [ins])
  const monthlyOut = useMemo(() => outs.reduce((s, e) => s + monthlyOf(e), 0), [outs])
  const profit = monthlyIn - monthlyOut

  // Finance context (currency + FX) — loaded once so add/pull convert correctly.
  const [ctx, setCtx] = useState<FinanceContext | null>(null)
  const [pulling, setPulling] = useState(false)
  const [pullMsg, setPullMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void getFinanceContext().then((c) => {
      if (cancelled) return
      setCtx(c)
      // Adopt Finance's currency before any money exists, so amounts match.
      if ((brand.finance?.entries.length ?? 0) === 0 && (brand.finance?.currency ?? '$') !== c.symbol) {
        actions.setMoneyCurrency(brand.id, c.symbol)
      }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand.id])

  const addEntry = useCallback(async (kind: BrandMoneyKind, input: { name: string; amount: number; period: BrandMoneyPeriod; at?: string }) => {
    let financeId: string | undefined
    if (syncs(kind, input.period) && ctx) {
      const id = await pushExpense({ name: input.name, amount: input.amount, period: input.period as 'monthly' | 'yearly' }, ctx)
      financeId = id ?? undefined
    }
    actions.addMoneyEntry(brand.id, { ...input, kind, financeId })
  }, [actions, brand.id, ctx])

  const removeEntry = useCallback((entry: BrandMoneyEntry) => {
    if (entry.financeId) void deleteExpense(entry.financeId)
    actions.removeMoneyEntry(brand.id, entry.id)
  }, [actions, brand.id])

  const pullFromFinance = useCallback(async () => {
    if (pulling) return
    setPulling(true)
    setPullMsg(null)
    try {
      const context = ctx ?? (await getFinanceContext())
      if (!ctx) setCtx(context)
      const linked = new Set(entries.filter((e) => e.financeId).map((e) => e.financeId))
      const subs = await pullFinanceSubs(context)
      const fresh = subs.filter((s) => !linked.has(s.financeId))
      if ((brand.finance?.entries.length ?? 0) === 0 && (brand.finance?.currency ?? '$') !== context.symbol) {
        actions.setMoneyCurrency(brand.id, context.symbol)
      }
      for (const s of fresh) {
        actions.addMoneyEntry(brand.id, { name: s.name, amount: s.amount, kind: 'out', period: s.period, financeId: s.financeId })
      }
      setPullMsg(fresh.length ? `Pulled ${fresh.length} from Finance` : subs.length ? 'Already in sync' : 'No Finance subs found')
    } catch {
      setPullMsg('Could not reach Finance')
    } finally {
      setPulling(false)
      setTimeout(() => setPullMsg(null), 2800)
    }
  }, [actions, brand.finance, brand.id, ctx, entries, pulling])

  // Trailing 6 months: recurring entries apply to every month (steady state),
  // one-off entries land on their dated month.
  const months = useMemo(() => {
    const now = new Date()
    const recIn = ins.reduce((s, e) => s + monthlyOf(e), 0)
    const recOut = outs.reduce((s, e) => s + monthlyOf(e), 0)
    const out: { key: string; label: string; in: number; out: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = monthKey(d)
      const onceIn = ins.filter((e) => e.period === 'once' && e.at.startsWith(key)).reduce((s, e) => s + e.amount, 0)
      const onceOut = outs.filter((e) => e.period === 'once' && e.at.startsWith(key)).reduce((s, e) => s + e.amount, 0)
      out.push({ key, label: d.toLocaleDateString('en-US', { month: 'short' }), in: recIn + onceIn, out: recOut + onceOut })
    }
    return out
  }, [ins, outs])

  const hasData = entries.length > 0

  return (
    <section className={styles.moneyPanel}>
      <header className={styles.moneyHead}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowMark}>💰</span>
          <span className={styles.eyebrowRule} />
          Money in &amp; out
        </span>
      </header>

      {hasData && (
        <>
          <div className={styles.moneySummary}>
            <div className={styles.moneyStat}>
              <span className={styles.moneyStatLabel}>In</span>
              <span className={`${styles.moneyStatNum} ${styles.moneyIn}`}>{fmt(monthlyIn)}</span>
              <span className={styles.moneyStatUnit}>/ mo</span>
            </div>
            <div className={styles.moneyStat}>
              <span className={styles.moneyStatLabel}>Out</span>
              <span className={`${styles.moneyStatNum} ${styles.moneyOut}`}>{fmt(monthlyOut)}</span>
              <span className={styles.moneyStatUnit}>/ mo</span>
            </div>
            <div className={styles.moneyStat}>
              <span className={styles.moneyStatLabel}>Profit</span>
              <span className={`${styles.moneyStatNum} ${profit >= 0 ? styles.moneyIn : styles.moneyOut}`}>
                {profit >= 0 ? '' : '−'}{fmt(Math.abs(profit))}
              </span>
              <span className={styles.moneyStatUnit}>/ mo</span>
            </div>
          </div>

          <ProfitChart months={months} fmt={fmt} />
        </>
      )}

      <MoneySection
        title="Money out"
        sub="Subscriptions, tools, ad spend"
        kind="out"
        entries={outs}
        currency={currency}
        fmt={fmt}
        onAdd={addEntry}
        onDelete={removeEntry}
        onPull={pullFromFinance}
        pulling={pulling}
        pullMsg={pullMsg}
      />

      <MoneySection
        title="Money in"
        sub="Sales, sponsorships, ad revenue"
        kind="in"
        entries={ins}
        currency={currency}
        fmt={fmt}
        onAdd={addEntry}
        onDelete={removeEntry}
        adRevenue={focusAccount}
        brandId={brand.id}
        actions={actions}
      />
    </section>
  )
}

// -----------------------------------------------------------------------------
// Diverging green/red chart — income above the baseline, costs below.
// -----------------------------------------------------------------------------

function ProfitChart({
  months, fmt,
}: {
  months: { key: string; label: string; in: number; out: number }[]
  fmt: (n: number) => string
}) {
  const W = 560
  const H = 150
  const padX = 8
  const midY = H / 2
  const maxMag = Math.max(1, ...months.flatMap((m) => [m.in, m.out]))
  const slot = (W - padX * 2) / months.length
  const barW = Math.min(26, slot * 0.42)
  const half = (H / 2) - 22 // vertical room for one direction

  return (
    <div className={styles.moneyChartWrap}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className={styles.moneyChart} role="img" aria-label="Monthly money in versus out">
        <line x1={padX} y1={midY} x2={W - padX} y2={midY} stroke="var(--border-strong)" strokeWidth="1" />
        {months.map((m, i) => {
          const cx = padX + slot * i + slot / 2
          const inH = (m.in / maxMag) * half
          const outH = (m.out / maxMag) * half
          const net = m.in - m.out
          return (
            <g key={m.key}>
              <rect x={cx - barW - 1.5} y={midY - inH} width={barW} height={inH} rx={3} fill="var(--mint)" opacity={0.92} />
              <rect x={cx + 1.5} y={midY} width={barW} height={outH} rx={3} fill="var(--red)" opacity={0.85} />
              <text x={cx} y={H - 6} textAnchor="middle" className={styles.moneyChartLabel}>{m.label}</text>
              {(m.in > 0 || m.out > 0) && (
                <text
                  x={cx}
                  y={12}
                  textAnchor="middle"
                  className={styles.moneyChartNet}
                  fill={net >= 0 ? 'var(--mint)' : 'var(--red)'}
                >
                  {net >= 0 ? '+' : '−'}{fmt(Math.abs(net)).replace(/^[^\d-]+/, '')}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <div className={styles.moneyChartKey}>
        <span><span className={styles.moneyKeyDot} style={{ background: 'var(--mint)' }} /> in</span>
        <span><span className={styles.moneyKeyDot} style={{ background: 'var(--red)' }} /> out</span>
        <span className={styles.moneyChartKeyHint}>net per month</span>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// One side of the ledger — a list of entries + an add row, Finance-style.
// -----------------------------------------------------------------------------

function MoneySection({
  title, sub, kind, entries, currency, fmt, onAdd, onDelete,
  onPull, pulling, pullMsg, adRevenue, brandId, actions,
}: {
  title: string
  sub: string
  kind: BrandMoneyKind
  entries: BrandMoneyEntry[]
  currency: string
  fmt: (n: number) => string
  onAdd: (kind: BrandMoneyKind, input: { name: string; amount: number; period: BrandMoneyPeriod }) => Promise<void> | void
  onDelete: (entry: BrandMoneyEntry) => void
  onPull?: () => void
  pulling?: boolean
  pullMsg?: string | null
  adRevenue?: BrandAccount | null
  brandId?: string
  actions?: BrandActions
}) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [period, setPeriod] = useState<BrandMoneyPeriod>(kind === 'in' ? 'once' : 'monthly')

  function submit() {
    const a = parseFloat(amount)
    if (!name.trim() || !Number.isFinite(a) || a <= 0) return
    void onAdd(kind, { name, amount: a, period })
    setName('')
    setAmount('')
  }

  return (
    <div className={styles.moneySection}>
      <div className={styles.moneySectionHead}>
        <span className={`${styles.moneyDot} ${kind === 'in' ? styles.moneyDotIn : styles.moneyDotOut}`} aria-hidden />
        <span className={styles.moneySectionTitle}>{title}</span>
        <span className={styles.moneySectionSub}>{sub}</span>
        {onPull && (
          <button type="button" className={styles.moneyPull} onClick={onPull} disabled={pulling}>
            {pulling ? 'Pulling…' : '⇄ Pull from Finance'}
          </button>
        )}
      </div>

      {pullMsg && <p className={styles.moneyPullMsg}>{pullMsg}</p>}

      {kind === 'in' && adRevenue && brandId && actions && SP[adRevenue.platform] && (
        <AdRevenuePull account={adRevenue} brandId={brandId} actions={actions} currency={currency} />
      )}

      {entries.length > 0 && (
        <div className={styles.moneyList}>
          {entries.map((e) => (
            <MoneyRow key={e.id} entry={e} fmt={fmt} onDelete={onDelete} />
          ))}
        </div>
      )}

      <div className={styles.moneyAddRow}>
        <input
          className={styles.moneyInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder={kind === 'in' ? 'Sponsorship, sale, payout…' : 'Service, tool, ad spend…'}
          aria-label={`${title} name`}
        />
        <input
          className={`${styles.moneyInput} ${styles.moneyAmt}`}
          type="number"
          inputMode="decimal"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder={`Amt (${currency.trim()})`}
          aria-label={`${title} amount`}
        />
        <select
          className={`${styles.moneyInput} ${styles.moneyPeriod}`}
          value={period}
          onChange={(e) => setPeriod(e.target.value as BrandMoneyPeriod)}
          aria-label="How often"
        >
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <button type="button" className={styles.moneyAddBtn} onClick={submit} aria-label={`Add ${title}`}>
          + Add
        </button>
      </div>
    </div>
  )
}

function MoneyRow({
  entry, fmt, onDelete,
}: {
  entry: BrandMoneyEntry
  fmt: (n: number) => string
  onDelete: (entry: BrandMoneyEntry) => void
}) {
  const periodLabel = entry.period === 'monthly' ? '/ mo' : entry.period === 'yearly' ? '/ yr' : 'one-off'
  return (
    <div className={styles.moneyRow}>
      <span className={styles.moneyRowName}>
        {entry.name || '—'}
        {entry.financeId && <span className={styles.moneySyncDot} title="Synced with Finance" aria-label="Synced with Finance"> ⇄</span>}
      </span>
      <span className={styles.moneyRowPeriod}>{periodLabel}</span>
      <span className={`${styles.moneyRowAmt} ${entry.kind === 'in' ? styles.moneyIn : styles.moneyOut}`}>
        {entry.kind === 'in' ? '+' : '−'}{fmt(entry.amount)}
      </span>
      <button
        type="button"
        className={styles.moneyDel}
        onClick={() => { if (confirm(`Delete "${entry.name || 'this entry'}"?`)) onDelete(entry) }}
        aria-label="Delete"
        title={entry.financeId ? 'Delete (also removes from Finance)' : 'Delete'}
      >
        ×
      </button>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Ad revenue — open the channel's earnings page read-only with Claude, then
// paste the number back as a one-off income entry for the current month.
// -----------------------------------------------------------------------------

function AdRevenuePull({
  account, brandId, actions, currency,
}: {
  account: BrandAccount
  brandId: string
  actions: BrandActions
  currency: string
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [amount, setAmount] = useState('')
  const sp = SP[account.platform]!

  const prompt = `You are a READ-ONLY reader. Open my ${sp} earnings / monetization page${account.handle ? ` for ${account.handle}` : ''} and read my estimated revenue for this month (or the last 28 days). Do not change any setting — only read.

Reply with ONLY the number, like: 1234.56`

  async function launch() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* tab still opens */ }
    const url = analyticsUrl(sp, account.handle)
    if (url) window.open(url, '_blank', 'noopener')
    setOpen(true)
  }

  function save() {
    const a = parseFloat(amount)
    if (!Number.isFinite(a) || a <= 0) return
    actions.addMoneyEntry(brandId, { name: 'Ad revenue', amount: a, kind: 'in', period: 'once', at: getLocalDateKey() })
    setAmount('')
    setOpen(false)
  }

  return (
    <div className={styles.moneyAd}>
      <button type="button" className={styles.moneyAdBtn} onClick={launch}>
        ✦ {copied ? 'Copied ✓ — opening' : 'Pull ad revenue with Claude'}
      </button>
      {open && (
        <div className={styles.moneyAdRow}>
          <input
            className={`${styles.moneyInput} ${styles.moneyAmt}`}
            type="number"
            inputMode="decimal"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save() }}
            placeholder={`Amount (${currency.trim()})`}
            aria-label="Ad revenue amount"
            autoFocus
          />
          <button type="button" className={styles.moneyAddBtn} onClick={save} disabled={!amount.trim()}>
            Add this month
          </button>
        </div>
      )}
    </div>
  )
}

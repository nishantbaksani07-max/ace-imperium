'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import styles from './finance.module.css'
import type { Currency, FinanceState, Order } from './types'
import {
  type ExchangeRates,
  type FinanceActions,
  type SpendCategory,
  categoryBreakdown,
  chfToDisplay,
  displayToChf,
  monthlyRecap,
  pctClass,
  relativeDateParts,
  useMonthlyBudget,
} from './state'
import ImportReceipt from './ImportReceipt'
import { clearOrderPrefill, readOrderPrefill } from '@/lib/orderPrefill'

interface Props {
  state: FinanceState
  actions: FinanceActions
  fmt: (chf: number) => string
  rates: ExchangeRates
  netWorth: number
}

function arrivalLabel(iso: string | null | undefined): { label: string; cls: string } | null {
  const parts = relativeDateParts(iso)
  if (!parts) return null
  const { diffDays, dateLabel } = parts
  if (diffDays < 0)  return { label: `${Math.abs(diffDays)}d late · ${dateLabel}`, cls: 'past' }
  if (diffDays === 0) return { label: `arrives today · ${dateLabel}`, cls: 'today' }
  if (diffDays === 1) return { label: `arrives tomorrow · ${dateLabel}`, cls: 'imminent' }
  if (diffDays <= 5)  return { label: `in ${diffDays}d · ${dateLabel}`, cls: 'imminent' }
  return { label: `in ${diffDays}d · ${dateLabel}`, cls: '' }
}

// -----------------------------------------------------------------------------
// Spending insights + budget (Phase 5 feature 3)
// -----------------------------------------------------------------------------

const CATEGORY_LABELS: Record<SpendCategory, string> = {
  groceries: 'Groceries', dining: 'Dining', shopping: 'Shopping', transport: 'Transport',
  subscriptions: 'Subscriptions', health: 'Health', tech: 'Tech', other: 'Other',
}

function SpendingInsights({
  orders,
  fmt,
  rates,
  currency,
}: {
  orders: Order[]
  fmt: (chf: number) => string
  rates: ExchangeRates
  currency: Currency
}) {
  const recap = useMemo(() => monthlyRecap(orders), [orders])
  const cats = useMemo(() => categoryBreakdown(orders), [orders])
  const { budgetCHF, setBudgetCHF } = useMonthlyBudget()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (!orders.length) return null

  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long' })
  const overBudget = budgetCHF != null && recap.thisMonthCHF > budgetCHF
  const pctOfBudget = budgetCHF && budgetCHF > 0 ? Math.min(100, (recap.thisMonthCHF / budgetCHF) * 100) : 0
  const budgetTone = budgetCHF == null ? '' : overBudget ? styles.bad : pctOfBudget >= 80 ? styles.warn : ''

  function saveBudget() {
    const v = parseFloat(draft)
    setBudgetCHF(isFinite(v) && v > 0 ? displayToChf(v, currency, rates) : null)
    setEditing(false)
  }

  return (
    <div className={styles.insightsCard}>
      <div className={styles.insightsHead}>
        <div>
          <div className={styles.chartLabel}>{monthLabel} spending</div>
          <div className={styles.insightsTotal}>{fmt(recap.thisMonthCHF)}</div>
        </div>
        {recap.deltaPct != null && (
          <span className={`${styles.insightsDelta} ${recap.deltaCHF > 0 ? styles.down : styles.up}`}>
            {recap.deltaCHF > 0 ? '↑' : '↓'} {Math.abs(recap.deltaPct).toFixed(0)}% vs last mo
          </span>
        )}
      </div>

      {recap.thisMonthIncomeCHF > 0 && (
        <div className={styles.cashflowRow}>
          <span className={styles.cashflowIn}>+{fmt(recap.thisMonthIncomeCHF)} in</span>
          <span className={styles.cashflowOut}>−{fmt(recap.thisMonthCHF)} out</span>
          <span className={`${styles.cashflowNet} ${recap.netCHF >= 0 ? styles.up : styles.down}`}>
            net {recap.netCHF >= 0 ? '+' : '−'}{fmt(Math.abs(recap.netCHF))}
            <span className={styles.cashflowSaved}>
              {' '}· {recap.netCHF >= 0 ? 'kept' : 'over'} {Math.abs(Math.round((recap.netCHF / recap.thisMonthIncomeCHF) * 100))}%
            </span>
          </span>
        </div>
      )}

      <div className={styles.budgetBlock}>
        {editing ? (
          <div className={styles.budgetEdit}>
            <input
              className={styles.quickAddInput}
              type="number"
              inputMode="decimal"
              step="1"
              autoFocus
              placeholder={`Monthly budget (${currency})`}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveBudget(); else if (e.key === 'Escape') setEditing(false) }}
            />
            <button type="button" className={styles.iconBtn} onClick={saveBudget}>save</button>
          </div>
        ) : budgetCHF == null ? (
          <button type="button" className={styles.addToggle} onClick={() => { setDraft(''); setEditing(true) }}>
            + set a monthly budget
          </button>
        ) : (
          <>
            <div className={styles.budgetBar}>
              <div className={`${styles.budgetBarFill} ${budgetTone}`} style={{ width: `${pctOfBudget}%` }} />
            </div>
            <div className={styles.budgetMeta}>
              <span className={budgetTone || styles.up}>
                {overBudget
                  ? `${fmt(recap.thisMonthCHF - budgetCHF)} over budget`
                  : `${fmt(budgetCHF - recap.thisMonthCHF)} left this month`}
              </span>
              <button
                type="button"
                className={styles.linkAction}
                onClick={() => { setDraft(String(Math.round(chfToDisplay(budgetCHF, currency, rates)))); setEditing(true) }}
              >
                {fmt(budgetCHF)} budget · edit
              </button>
            </div>
          </>
        )}
      </div>

      {cats.length > 0 && (
        <div className={styles.catList}>
          {cats.map(c => (
            <div key={c.category} className={styles.catRow}>
              <span className={styles.catName}>{CATEGORY_LABELS[c.category]}</span>
              <div className={styles.catBarTrack}>
                <div className={styles.catBarFill} style={{ width: `${c.pct}%` }} />
              </div>
              <span className={styles.catAmt}>{fmt(c.total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Add form (live % preview)
// -----------------------------------------------------------------------------

type OrderMode = 'incoming' | 'bought' | 'income'

function AddOrderForm({
  state,
  actions,
  fmt,
  rates,
  netWorth,
}: {
  state: FinanceState
  actions: FinanceActions
  fmt: (chf: number) => string
  rates: ExchangeRates
  netWorth: number
}) {
  const [mode, setMode] = useState<OrderMode>('incoming')
  const [name, setName] = useState('')
  const [cost, setCost] = useState('')
  const [fromAccountId, setFromAccountId] = useState('')
  const [arrival, setArrival] = useState('')

  const isBought = mode === 'bought'
  const isIncome = mode === 'income'
  const needsAccount = isBought && !fromAccountId

  // Consume a prefill from a supplement recommendation, if one is pending.
  // Runs once on mount; clears the prefill so a tab refresh doesn't replay it.
  // useRef guard means React strict-mode double-invocation can't re-fire it
  // either (the prefill is one-shot).
  const prefillConsumed = useRef(false)
  useEffect(() => {
    if (prefillConsumed.current) return
    const prefill = readOrderPrefill()
    if (!prefill) return
    prefillConsumed.current = true
    setName(prefill.name)
    // USD → display currency. rates[c] is "display units per CHF", so
    // USD price × (display/CHF) ÷ (USD/CHF) = display price.
    const usdToChf = (prefill.priceUsdMonthly) / (rates.USD || 1)
    const displayPrice = usdToChf * (rates[state.currency] || 1)
    setCost(displayPrice.toFixed(2))
    setMode('incoming')
    clearOrderPrefill()
  }, [rates, state.currency])

  function submit() {
    const a = parseFloat(cost)
    if (!name.trim() || !isFinite(a) || a <= 0) return
    if (needsAccount) return
    actions.addOrder({
      name,
      displayAmount: a,
      direction: isIncome ? 'in' : 'out',
      fromAccountId: isIncome ? null : (fromAccountId || null),
      date: (isBought || isIncome) ? null : (arrival || null),
      immediate: isBought,
    })
    setName('')
    setCost('')
    setArrival('')
  }

  const preview = useMemo(() => {
    const a = parseFloat(cost)
    if (!isFinite(a) || a <= 0) {
      const hint = isIncome
        ? 'Log money coming in (paycheck, refund, sale). It won’t touch an account.'
        : isBought
        ? 'Type a cost. We will deduct it from the chosen account on Add.'
        : 'Type a cost. Preview will show what % of net worth it takes.'
      return { text: hint, cls: '' }
    }
    const amountCHF = displayToChf(a, state.currency, rates)
    if (isIncome) {
      return { text: `+${fmt(amountCHF)} income — adds to this month’s cash flow`, cls: '' }
    }
    const fromName = fromAccountId
      ? state.accounts.find(x => x.id === fromAccountId)?.name ?? 'unassigned'
      : 'unassigned'
    if (isBought && !fromAccountId) {
      return {
        text: `${fmt(amountCHF)} · pick a "from account" to deduct from`,
        cls: 'warn',
      }
    }
    if (netWorth > 0) {
      const pct = (amountCHF / netWorth) * 100
      const cls = pctClass(pct)
      const prefix = isBought ? `Will debit ${fromName}: ` : `${fmt(amountCHF)} from ${fromName} · `
      const text = isBought
        ? `${prefix}${fmt(amountCHF)} · ${pct.toFixed(2)}% of your ${fmt(netWorth)} net worth`
        : `${prefix}${pct.toFixed(2)}% of your ${fmt(netWorth)} net worth`
      return { text, cls: cls === 'good' ? '' : cls }
    }
    return {
      text: `${fmt(amountCHF)} from ${fromName} · add net worth first to see %`,
      cls: '',
    }
  }, [cost, fromAccountId, isBought, isIncome, netWorth, state.accounts, state.currency, rates, fmt])

  return (
    <div className={styles.addCard}>
      <div className={styles.addCardHead}>
        <div className={styles.addEyebrow}>{isIncome ? '+ income received' : isBought ? '+ today’s purchase' : '+ new order'}</div>
        <div className={styles.modeSeg} role="group" aria-label="Entry type">
          <button
            type="button"
            aria-pressed={mode === 'incoming'}
            className={`${styles.modeBtn} ${mode === 'incoming' ? styles.modeBtnActive : ''}`}
            onClick={() => setMode('incoming')}
          >
            Ordered
          </button>
          <button
            type="button"
            aria-pressed={isBought}
            className={`${styles.modeBtn} ${isBought ? styles.modeBtnActive : ''}`}
            onClick={() => setMode('bought')}
          >
            Bought today
          </button>
          <button
            type="button"
            aria-pressed={isIncome}
            className={`${styles.modeBtn} ${isIncome ? styles.modeBtnActive : ''}`}
            onClick={() => setMode('income')}
          >
            Income
          </button>
        </div>
      </div>
      <div className={`${styles.addGrid} ${isBought ? styles.addGridBought : ''} ${isIncome ? styles.addGridIncome : ''}`}>
        <input
          className={styles.quickAddInput}
          type="text"
          placeholder={isIncome ? 'Source (e.g. Paycheck)' : isBought ? 'What did you buy?' : 'Item (e.g. New iPhone)'}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
        />
        <input
          className={styles.quickAddInput}
          type="number"
          inputMode="decimal"
          step="0.01"
          placeholder={`${isIncome ? 'Amount' : 'Cost'} (${state.currency})`}
          value={cost}
          onChange={e => setCost(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
        />
        {!isIncome && (
          <select
            className={`${styles.quickAddInput} ${needsAccount ? styles.quickAddInputAlert : ''}`}
            value={fromAccountId}
            onChange={e => setFromAccountId(e.target.value)}
            aria-label="From account"
            title={isBought ? 'Required: account to debit' : 'Which net worth account this comes out of'}
          >
            <option value="">{isBought ? 'From account (required)…' : 'From account…'}</option>
            {state.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        {!isBought && !isIncome && (
          <input
            className={styles.quickAddInput}
            type="date"
            aria-label="Expected arrival date"
            title="Expected arrival"
            value={arrival}
            onChange={e => setArrival(e.target.value)}
          />
        )}
        <button
          type="button"
          className={styles.quickAddBtn}
          onClick={submit}
          disabled={needsAccount || !name.trim() || !cost}
        >
          {isIncome ? '+ Log income' : isBought ? '− Log purchase' : '+ Add order'}
        </button>
      </div>
      <div className={`${styles.addPreview} ${preview.cls === 'warn' ? styles.warn : preview.cls === 'bad' ? styles.bad : ''}`}>
        {preview.text}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Order card
// -----------------------------------------------------------------------------

function OrderCard({
  order,
  state,
  actions,
  fmt,
  netWorth,
}: {
  order: Order
  state: FinanceState
  actions: FinanceActions
  fmt: (chf: number) => string
  netWorth: number
}) {
  // Income is a log-only inflow — no "from account", no % of NW, no deduct.
  if (order.direction === 'in') {
    return (
      <div className={`${styles.ordCard} ${styles.ordIncome}`}>
        <div className={styles.ordHead}>
          <div className={styles.ordName}>{order.name}</div>
          <div className={`${styles.ordAmt} ${styles.up}`}>+{fmt(order.amountCHF)}</div>
          <button
            type="button"
            className={styles.iconBtn}
            title="Remove"
            onClick={() => actions.deleteOrder(order.id)}
          >
            ×
          </button>
        </div>
        <div className={styles.ordMetaRow}>
          <span className={`${styles.ordPill} ${styles.up}`}>income</span>
          <span className={`${styles.ordPill} ${styles.ordDate}`}>
            {new Date(order.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>
    )
  }

  const fromName = order.fromAccountId
    ? state.accounts.find(a => a.id === order.fromAccountId)?.name ?? 'unassigned'
    : 'unassigned'
  const isDeducted = !!order.deductedAt
  const arr = arrivalLabel(order.date)

  let pctText: string
  let pctSeverity: 'good' | 'warn' | 'bad' | null
  let pctFrozen = false
  if (isDeducted && typeof order.pctAtDeduction === 'number') {
    pctText = `${order.pctAtDeduction.toFixed(2)}% of NW`
    pctSeverity = pctClass(order.pctAtDeduction)
    pctFrozen = true
  } else if (netWorth > 0) {
    const pct = (order.amountCHF / netWorth) * 100
    pctText = `${pct.toFixed(2)}% of NW`
    pctSeverity = pctClass(pct)
  } else {
    pctText = '- of NW'
    pctSeverity = null
  }
  const pctSeverityClass =
    pctSeverity === 'good' ? styles.good :
    pctSeverity === 'warn' ? styles.warn :
    pctSeverity === 'bad'  ? styles.bad  : ''

  return (
    <div className={`${styles.ordCard} ${isDeducted ? styles.deducted : ''}`}>
      <div className={styles.ordHead}>
        <div className={styles.ordName}>{order.name}</div>
        <div className={styles.ordAmt}>{fmt(order.amountCHF)}</div>
        <button
          type="button"
          className={styles.iconBtn}
          title="Remove"
          onClick={() => actions.deleteOrder(order.id)}
        >
          ×
        </button>
      </div>
      <div className={styles.ordMetaRow}>
        <span className={styles.ordPill}>from · {fromName}</span>
        <span className={`${styles.ordPill} ${pctSeverityClass} ${pctFrozen ? styles.frozen : ''}`}>
          {pctText}
        </span>
        {isDeducted ? (
          <span className={`${styles.ordPill} ${styles.ordDate}`}>
            bought {new Date(order.deductedAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        ) : arr ? (
          <span className={`${styles.ordPill} ${styles.ordDate} ${
            arr.cls === 'today' ? styles.today :
            arr.cls === 'imminent' ? styles.imminent :
            arr.cls === 'past' ? styles.past : ''
          }`}>
            {arr.label}
          </span>
        ) : (
          <span className={styles.ordPill}>no arrival date</span>
        )}
      </div>
      <div className={styles.ordFoot}>
        {isDeducted ? (
          <>
            <span className={styles.ordDeductedPill}>
              Deducted from {order.deductedFromName ?? fromName}
            </span>
            <button
              type="button"
              className={styles.ordDeductBtn}
              onClick={() => actions.undoDeductOrder(order.id)}
            >
              Undo
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.ordDeductBtn}
            onClick={() => {
              if (!order.fromAccountId) {
                alert('Set a “from account” to deduct from.')
                return
              }
              actions.deductOrder(order.id)
            }}
          >
            − Deduct from net worth
          </button>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Root
// -----------------------------------------------------------------------------

export default function OrdersView({ state, actions, fmt, rates, netWorth }: Props) {
  const [importOpen, setImportOpen] = useState(false)

  // Sort: dated orders by arrival soonest first (ties broken by most-recently
  // added), then undated orders (bought-today + receipt imports) by recency.
  const sorted = useMemo(
    () =>
      [...state.orders].sort((a, b) => {
        if (!a.date && !b.date) return (b.deductedAt ?? b.ts) - (a.deductedAt ?? a.ts)
        if (!a.date) return 1
        if (!b.date) return -1
        const cmp = a.date.localeCompare(b.date)
        return cmp !== 0 ? cmp : b.ts - a.ts
      }),
    [state.orders],
  )

  return (
    <section className={styles.section}>
      <div className={styles.sectionEyebrow}>
        <span>Incoming orders</span>
        <span className={styles.sectionCount}>
          {state.orders.length} {state.orders.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      <SpendingInsights orders={state.orders} fmt={fmt} rates={rates} currency={state.currency} />

      <button
        type="button"
        className={styles.importTrigger}
        onClick={() => setImportOpen(true)}
        aria-label="Import a receipt to auto-log a purchase"
      >
        <span className={styles.importTriggerIcon} aria-hidden>↗</span>
        <span className={styles.importTriggerText}>
          <span className={styles.importTriggerTitle}>Import receipt</span>
          <span className={styles.importTriggerSub}>snap a receipt, auto-log the purchase</span>
        </span>
      </button>

      <ImportReceipt
        open={importOpen}
        onClose={() => setImportOpen(false)}
        state={state}
        actions={actions}
        currentCurrency={state.currency}
        rates={rates}
      />

      <AddOrderForm
        state={state}
        actions={actions}
        fmt={fmt}
        rates={rates}
        netWorth={netWorth}
      />

      {state.orders.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>Nothing on the way.</div>
          <div className={styles.emptyBody}>
            Log an order above. Pick the account it comes out of and the expected arrival date. The dashboard will show what % of your net worth it costs.
          </div>
        </div>
      ) : (
        <div>
          {sorted.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              state={state}
              actions={actions}
              fmt={fmt}
              netWorth={netWorth}
            />
          ))}
        </div>
      )}
    </section>
  )
}

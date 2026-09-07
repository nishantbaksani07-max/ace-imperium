'use client'

import { useMemo, useState } from 'react'
import styles from './finance.module.css'
import type { FinanceState } from './types'
import { type ExchangeRates, type FinanceActions, monthlyRecap } from './state'
import ImportReceipt from './ImportReceipt'

/**
 * The spend strip — the lean discretionary-spend logger under the subscription
 * radar (launch, 2026-07-12). Every entry lands in finance_orders (direction
 * 'out'), the same store Vee reads for the spending x sleep seam, so a night out
 * logged here is what lets "you spend more in the weeks you sleep less" ever
 * fire. Two ways in: a one-line quick log, or snap a receipt and let the AI read
 * the total. Kept compact on purpose — the radar is the star; this is the feed
 * that gives Vee real daily spend.
 */
export default function SpendStrip({
  state,
  actions,
  fmt,
  rates,
}: {
  state: FinanceState
  actions: FinanceActions
  fmt: (chf: number) => string
  rates: ExchangeRates
}) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [receiptOpen, setReceiptOpen] = useState(false)

  const monthSpend = useMemo(() => monthlyRecap(state.orders).thisMonthCHF, [state.orders])

  function logSpend() {
    const a = parseFloat(amount)
    if (!isFinite(a) || a <= 0) return
    actions.addOrder({
      name: note.trim() || 'Spending',
      displayAmount: a,
      direction: 'out',
    })
    setAmount('')
    setNote('')
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionEyebrow}>
        <span>Spending</span>
        <span className={styles.sectionCount}>feeds Vee</span>
      </div>

      <div className={styles.addCard}>
        <div className={styles.subsHero}>
          <div>
            <div className={styles.nwHeroLabel}>Spent this month</div>
            <div className={styles.subsHeroNum}>{fmt(monthSpend)}</div>
          </div>
        </div>
      </div>

      <div className={styles.addCard}>
        <div className={styles.addEyebrow}>+ log a spend</div>
        <div className={styles.spendGrid}>
          <input
            className={styles.quickAddInput}
            type="text"
            placeholder="What for (e.g. night out)"
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') logSpend() }}
          />
          <input
            className={styles.quickAddInput}
            type="number"
            inputMode="decimal"
            step="0.01"
            placeholder={`Amount (${state.currency})`}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') logSpend() }}
          />
          <button type="button" className={styles.quickAddBtn} onClick={logSpend}>+ Log</button>
        </div>
      </div>

      <button
        type="button"
        className={styles.importTrigger}
        onClick={() => setReceiptOpen(true)}
        aria-label="Snap a receipt to log spending"
      >
        <span className={styles.importTriggerIcon} aria-hidden>↗</span>
        <span className={styles.importTriggerText}>
          <span className={styles.importTriggerTitle}>Snap a receipt</span>
          <span className={styles.importTriggerSub}>the AI reads the total and logs it</span>
        </span>
      </button>

      <ImportReceipt
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        state={state}
        actions={actions}
        currentCurrency={state.currency}
        rates={rates}
      />
    </section>
  )
}

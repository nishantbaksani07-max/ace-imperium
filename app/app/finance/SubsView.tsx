'use client'

import { useMemo, useState } from 'react'
import styles from './finance.module.css'
import type { Account, FinanceState, SubPeriod, Subscription } from './types'
import {
  type ExchangeRates,
  type FinanceActions,
  chfToDisplay,
  formatRenewal,
  monthlyEquivalent,
  nextRenewalDate,
  normalizeUrl,
  subscriptionAlerts,
  upcomingBills,
} from './state'
import type { Currency } from './types'
import ImportSubscriptions from './ImportSubscriptions'

/* Inline SVG icons — the app never ships emoji in the UI. */
const LinkIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 15 15 9" />
    <path d="M11 6.5 12.5 5a4 4 0 0 1 5.7 5.7l-1.5 1.5" />
    <path d="M13 17.5 11.5 19a4 4 0 0 1-5.7-5.7l1.5-1.5" />
  </svg>
)
const PencilIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="M13.5 6.5l3 3" />
  </svg>
)

interface Props {
  state: FinanceState
  actions: FinanceActions
  fmt: (chf: number) => string
  rates: ExchangeRates
}

const PERIODS: { value: SubPeriod; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly',  label: 'Yearly' },
  { value: 'weekly',  label: 'Weekly' },
]

function accountLabel(accounts: Account[], id: string | null | undefined): string | null {
  if (!id) return null
  const a = accounts.find(x => x.id === id)
  return a ? a.name : null
}

function daysToNext(s: Pick<Subscription, 'renewal' | 'period'>): number | null {
  if (!s.renewal) return null
  const next = nextRenewalDate(s.renewal, s.period)
  if (!next) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((next.getTime() - today) / 86_400_000)
}

// -----------------------------------------------------------------------------
// Add form
// -----------------------------------------------------------------------------

function AddSubForm({ state, actions }: { state: FinanceState; actions: FinanceActions }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [period, setPeriod] = useState<SubPeriod>('monthly')
  const [renewal, setRenewal] = useState('')
  const [fromAccountId, setFromAccountId] = useState('')

  function submit() {
    const a = parseFloat(amount)
    if (!name.trim() || !isFinite(a) || a <= 0) return
    actions.addSubscription({
      name,
      displayAmount: a,
      period,
      renewal: renewal || null,
      fromAccountId: fromAccountId || null,
    })
    setName('')
    setAmount('')
    setRenewal('')
    setFromAccountId('')
  }

  return (
    <div className={styles.addCard}>
      <div className={styles.addEyebrow}>+ new subscription</div>
      <div className={styles.addGrid}>
        <input
          className={styles.quickAddInput}
          type="text"
          placeholder="Service (e.g. Netflix)"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
        />
        <input
          className={styles.quickAddInput}
          type="number"
          inputMode="decimal"
          step="0.01"
          placeholder={`Amount (${state.currency})`}
          value={amount}
          onChange={e => setAmount(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
        />
        <select
          className={styles.quickAddInput}
          value={period}
          onChange={e => setPeriod(e.target.value as SubPeriod)}
        >
          {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <input
          className={styles.quickAddInput}
          type="date"
          aria-label="Next renewal date"
          title="Next renewal date"
          value={renewal}
          onChange={e => setRenewal(e.target.value)}
        />
        <select
          className={styles.quickAddInput}
          value={fromAccountId}
          onChange={e => setFromAccountId(e.target.value)}
          aria-label="From account to deduct from"
          title="Which net worth account to deduct from"
        >
          <option value="">From account…</option>
          {state.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button type="button" className={styles.quickAddBtn} onClick={submit}>+ Add</button>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Inline edit form for a sub
// -----------------------------------------------------------------------------

function SubEditRow({
  sub,
  accounts,
  currency,
  rates,
  onSave,
  onCancel,
  onDelete,
}: {
  sub: Subscription
  accounts: Account[]
  currency: Currency
  rates: ExchangeRates
  onSave: (patch: Partial<Subscription> & { displayAmount?: number }) => void
  onCancel: () => void
  onDelete: () => void
}) {
  const [name, setName] = useState(sub.name)
  // Seed the amount in the CURRENT display currency (not the original entered
  // currency) so the number the user edits matches what the rest of the UI shows.
  const [amount, setAmount] = useState(
    String(Math.round(chfToDisplay(sub.amountCHF, currency, rates) * 100) / 100),
  )
  const [period, setPeriod] = useState<SubPeriod>(sub.period)
  const [renewal, setRenewal] = useState(sub.renewal ?? '')
  const [fromAccountId, setFromAccountId] = useState(sub.fromAccountId ?? '')
  const [trialEnds, setTrialEnds] = useState(sub.trialEnds ?? '')
  const [manageUrl, setManageUrl] = useState(sub.manageUrl ?? '')

  function save() {
    const a = parseFloat(amount)
    if (!name.trim() || !isFinite(a) || a <= 0) return
    onSave({
      name: name.trim(),
      displayAmount: a,
      enteredCurrency: currency,
      period,
      renewal: renewal || null,
      fromAccountId: fromAccountId || null,
      trialEnds: trialEnds || null,
      manageUrl: normalizeUrl(manageUrl),
    })
  }

  return (
    <div className={styles.subRow}>
      <div className={styles.subEditGrid}>
        <input className={styles.quickAddInput} value={name} onChange={e => setName(e.target.value)} placeholder="Service" aria-label="Service name" />
        <input className={styles.quickAddInput} type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount" aria-label="Amount" />
        <select className={styles.quickAddInput} value={period} onChange={e => setPeriod(e.target.value as SubPeriod)} aria-label="Billing period">
          {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <input className={styles.quickAddInput} type="date" value={renewal} onChange={e => setRenewal(e.target.value)} aria-label="Next renewal date" title="Next renewal date" />
        <select className={styles.quickAddInput} value={fromAccountId} onChange={e => setFromAccountId(e.target.value)} aria-label="From account">
          <option value="">From account…</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input className={styles.quickAddInput} type="date" value={trialEnds} onChange={e => setTrialEnds(e.target.value)} aria-label="Free trial ends (optional)" title="Free trial ends — leave blank if not a trial" />
        <input className={styles.quickAddInput} type="url" inputMode="url" value={manageUrl} onChange={e => setManageUrl(e.target.value)} placeholder="Billing / manage link (optional)" aria-label="Billing or manage page URL" title="Direct link to this service's billing page" />
      </div>
      <div />
      <div className={styles.subRowActions}>
        <button type="button" className={styles.iconBtn} onClick={save}>save</button>
        <button type="button" className={styles.iconBtn} onClick={onCancel}>cancel</button>
        <button type="button" className={styles.iconBtn} onClick={onDelete}>delete</button>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Subscription alerts — trial ending + price hike (Phase 5 feature 2)
// -----------------------------------------------------------------------------

function SubAlerts({ subs, fmt }: { subs: Subscription[]; fmt: (chf: number) => string }) {
  const alerts = useMemo(() => subscriptionAlerts(subs, 14, 60), [subs])
  if (!alerts.length) return null

  return (
    <div className={styles.alertsCard}>
      {alerts.map(a => (
        <div
          key={`${a.kind}-${a.id}`}
          className={`${styles.alertRow} ${a.kind === 'hike' ? styles.alertHike : styles.alertTrial}`}
          role="status"
        >
          <span className={styles.alertTag}>{a.kind === 'trial' ? 'Trial ending' : 'Price up'}</span>
          <div className={styles.alertText}>
            {a.kind === 'trial' ? (
              <>
                <span className={styles.alertName}>{a.name}</span> free trial ends{' '}
                {a.daysUntil === 0 ? 'today' : a.daysUntil === 1 ? 'tomorrow' : `in ${a.daysUntil} days`}
                <span className={styles.alertSub}> — cancel before you{'’'}re charged.</span>
              </>
            ) : (
              <>
                <span className={styles.alertName}>{a.name}</span> went up{' '}
                {fmt(a.fromCHF ?? 0)} → <strong>{fmt(a.toCHF ?? 0)}</strong>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Upcoming bills timeline (Phase 5 feature 1)
// -----------------------------------------------------------------------------

function UpcomingBills({ subs, fmt }: { subs: Subscription[]; fmt: (chf: number) => string }) {
  const bills = useMemo(() => upcomingBills(subs, 30), [subs])
  if (!bills.length) return null
  const total = bills.reduce((s, b) => s + b.amountCHF, 0)

  return (
    <div className={styles.billsCard}>
      <div className={styles.billsHead}>
        <span className={styles.chartLabel}>Coming up</span>
        <span className={styles.billsTotal}>
          {fmt(total)}
          <span className={styles.billsTotalSub}>next 30 days</span>
        </span>
      </div>
      <div className={styles.billsList}>
        {bills.map(b => {
          const tone = b.daysUntil <= 3 ? styles.imminent : b.daysUntil <= 7 ? styles.soon : ''
          const when = b.daysUntil === 0 ? 'today' : b.daysUntil === 1 ? 'tomorrow' : `in ${b.daysUntil}d`
          const dateLabel = b.nextDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          return (
            <div key={b.id} className={styles.billRow}>
              <span className={`${styles.billDot} ${tone}`} aria-hidden />
              <div className={styles.billInfo}>
                <div className={styles.billName}>{b.name}</div>
                <div className={`${styles.billWhen} ${tone}`}>{when} · {dateLabel}</div>
              </div>
              <div className={styles.billAmt}>{fmt(b.amountCHF)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Root view
// -----------------------------------------------------------------------------

export default function SubsView({ state, actions, fmt, rates }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const monthlyTotal = useMemo(
    () => state.subscriptions.reduce((s, sub) => s + monthlyEquivalent(sub), 0),
    [state.subscriptions],
  )

  return (
    <section className={styles.section}>
      <div className={styles.sectionEyebrow}>
        <span>Active subscriptions</span>
        <span className={styles.sectionCount}>
          {state.subscriptions.length} {state.subscriptions.length === 1 ? 'sub' : 'subs'}
          {monthlyTotal > 0 && (
            <span className={styles.sectionCountSep}> · {fmt(monthlyTotal * 12)} / yr</span>
          )}
        </span>
      </div>

      <SubAlerts subs={state.subscriptions} fmt={fmt} />

      <UpcomingBills subs={state.subscriptions} fmt={fmt} />

      <button
        type="button"
        className={styles.importTrigger}
        onClick={() => setImportOpen(true)}
        aria-label="Import subscriptions from a screenshot"
      >
        <span className={styles.importTriggerIcon} aria-hidden>↗</span>
        <span className={styles.importTriggerText}>
          <span className={styles.importTriggerTitle}>Import subscriptions</span>
          <span className={styles.importTriggerSub}>snap a billing page, pull every sub at once</span>
        </span>
      </button>

      <ImportSubscriptions
        open={importOpen}
        onClose={() => setImportOpen(false)}
        actions={actions}
        currentCurrency={state.currency}
        rates={rates}
      />

      <div className={styles.addCard}>
        <div className={styles.subsHero}>
          <div>
            <div className={styles.nwHeroLabel}>Monthly burn</div>
            <div className={styles.subsHeroNum}>
              {fmt(monthlyTotal)}
              <span className={styles.subsHeroNumSuffix}>/ mo</span>
            </div>
            {monthlyTotal > 0 && (
              <div className={styles.subsHeroSub}>~{fmt(monthlyTotal * 12)} per year</div>
            )}
          </div>
        </div>
      </div>

      <AddSubForm state={state} actions={actions} />

      {state.subscriptions.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No subscriptions yet.</div>
          <div className={styles.emptyBody}>Add anything that auto-renews. Netflix, gym, hosting bills, whatever drains money on a schedule.</div>
        </div>
      ) : (
        <div>
          {state.subscriptions.map(sub => {
            if (editingId === sub.id) {
              return (
                <SubEditRow
                  key={sub.id}
                  sub={sub}
                  accounts={state.accounts}
                  currency={state.currency}
                  rates={rates}
                  onSave={patch => {
                    actions.updateSubscription(sub.id, patch)
                    setEditingId(null)
                  }}
                  onCancel={() => setEditingId(null)}
                  onDelete={() => {
                    if (confirm(`Delete "${sub.name}"?`)) {
                      actions.deleteSubscription(sub.id)
                      setEditingId(null)
                    }
                  }}
                />
              )
            }

            const days = daysToNext(sub)
            const isUrgent = days != null && days <= 5
            const monthly = monthlyEquivalent(sub)
            const fromAccountName = accountLabel(state.accounts, sub.fromAccountId)
            const billedOriginal = sub.enteredCurrency && sub.enteredCurrency !== 'CHF' && sub.enteredAmount != null
              ? `billed ${sub.enteredCurrency} ${sub.enteredAmount.toLocaleString('en-US', {
                  minimumFractionDigits: sub.enteredAmount % 1 === 0 ? 0 : 2,
                  maximumFractionDigits: 2,
                })} / ${sub.period}`
              : sub.period !== 'monthly'
                ? `billed ${fmt(sub.amountCHF)} / ${sub.period}`
                : null

            return (
              <div key={sub.id} className={`${styles.subRow} ${isUrgent ? styles.urgent : ''}`}>
                <div style={{ minWidth: 0 }}>
                  <div className={styles.subRowName}>{sub.name}</div>
                  <div className={styles.subRowPeriod}>{sub.period}</div>
                  {sub.renewal && (
                    <div className={styles.subRowRenew}>↻ renews {formatRenewal(sub.renewal)}</div>
                  )}
                  {fromAccountName && (
                    <div className={styles.subRowPills}>
                      <span className={styles.subPill}>from · {fromAccountName}</span>
                    </div>
                  )}
                </div>
                <div className={styles.subRowCost}>
                  <div className={styles.subRowCostBig}>{fmt(monthly)}</div>
                  <div className={styles.subRowCostUnit}>/ month</div>
                  {billedOriginal && <div className={styles.subRowCostBilled}>{billedOriginal}</div>}
                </div>
                <div className={styles.subRowActions}>
                  {sub.manageUrl ? (
                    <a
                      className={`${styles.iconBtn} ${styles.iconLink}`}
                      href={sub.manageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Open ${sub.name} billing page`}
                      aria-label={`Open ${sub.name} billing page`}
                    >
                      <LinkIcon />
                    </a>
                  ) : (
                    <button
                      type="button"
                      className={styles.iconBtn}
                      title="Add billing link"
                      aria-label={`Add billing link for ${sub.name}`}
                      onClick={() => {
                        const input = window.prompt(`Paste the billing / manage URL for ${sub.name}`)
                        if (input == null) return
                        const url = normalizeUrl(input)
                        if (!url) {
                          if (input.trim()) alert('That doesn’t look like a valid web link.')
                          return
                        }
                        actions.updateSubscription(sub.id, { manageUrl: url })
                      }}
                    >
                      <LinkIcon />
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.iconBtn}
                    title="Edit"
                    onClick={() => setEditingId(sub.id)}
                  >
                    <PencilIcon />
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    title="Delete"
                    onClick={() => {
                      if (confirm(`Delete "${sub.name}"?`)) actions.deleteSubscription(sub.id)
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

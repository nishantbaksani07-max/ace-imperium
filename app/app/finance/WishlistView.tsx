'use client'

import { useMemo, useState } from 'react'
import styles from './finance.module.css'
import type { FinanceState } from './types'
import { type FinanceActions, formatActivityDate, normalizeUrl, pctClass } from './state'

interface Props {
  state: FinanceState
  actions: FinanceActions
  fmt: (chf: number) => string
  netWorth: number
}

function pctSuffix(cls: 'good' | 'warn' | 'bad' | null): string {
  if (cls === 'warn') return styles.warn
  if (cls === 'bad')  return styles.bad
  return ''
}

function AddWishForm({ state, actions }: { state: FinanceState; actions: FinanceActions }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [url, setUrl] = useState('')

  function submit() {
    const a = parseFloat(amount)
    if (!name.trim() || !isFinite(a) || a <= 0) return
    actions.addWish(name, a, normalizeUrl(url))
    setName('')
    setAmount('')
    setUrl('')
  }

  return (
    <div className={styles.addCard}>
      <div className={styles.addEyebrow}>+ add to wishlist</div>
      <div className={styles.addGrid} style={{ gridTemplateColumns: '2fr 1fr auto' }}>
        <input
          className={styles.quickAddInput}
          type="text"
          placeholder="Item name (e.g. New iPhone Pro Max)"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
        />
        <input
          className={styles.quickAddInput}
          type="number"
          inputMode="decimal"
          step="0.01"
          placeholder={`Cost (${state.currency})`}
          value={amount}
          onChange={e => setAmount(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
        />
        <button type="button" className={styles.quickAddBtn} onClick={submit}>+ Add</button>
      </div>
      <input
        className={styles.quickAddInput}
        style={{ marginTop: 'var(--space-2)', width: '100%' }}
        type="url"
        inputMode="url"
        placeholder="Store link (optional) — e.g. the Amazon page"
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
        aria-label="Storefront link"
      />
    </div>
  )
}

export default function WishlistView({ state, actions, fmt, netWorth }: Props) {
  const totalChf = useMemo(
    () => state.wishlist.reduce((s, w) => s + w.amountCHF, 0),
    [state.wishlist],
  )

  const heroPct = netWorth > 0 ? (totalChf / netWorth) * 100 : null
  const heroCls = heroPct == null ? null : pctClass(heroPct)
  const heroFill = heroPct == null ? 0 : Math.min(100, heroPct)

  const sorted = useMemo(
    () => [...state.wishlist].sort((a, b) => b.amountCHF - a.amountCHF),
    [state.wishlist],
  )

  return (
    <section className={styles.section}>
      <div className={styles.sectionEyebrow}>
        <span>Wishlist</span>
        <span className={styles.sectionCount}>
          {state.wishlist.length} {state.wishlist.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      <div className={styles.wishHero}>
        <div className={styles.wishHeroTop}>
          <div>
            <div className={styles.nwHeroLabel}>Wishlist total</div>
            <div className={styles.wishHeroNum}>{fmt(totalChf)}</div>
          </div>
          <div>
            <div className={styles.nwHeroLabel}>% of net worth</div>
            <div className={`${styles.wishHeroPctNum} ${pctSuffix(heroCls)}`}>
              {heroPct == null ? '-' : `${heroPct.toFixed(2)}%`}
            </div>
          </div>
        </div>
        <div className={styles.wishHeroBar}>
          <div
            className={`${styles.wishHeroBarFill} ${pctSuffix(heroCls)}`}
            style={{ width: `${heroFill}%` }}
          />
        </div>
        <div className={styles.wishHeroFoot}>
          {heroPct == null
            ? 'Add net worth first to see this as a %'
            : `Your wishlist is ${heroPct.toFixed(2)}% of your ${fmt(netWorth)} net worth`}
        </div>
      </div>

      <AddWishForm state={state} actions={actions} />

      {state.wishlist.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No wishes yet.</div>
          <div className={styles.emptyBody}>
            Add anything you're saving for. The dashboard will calculate what % of your net worth it'd cost.
          </div>
        </div>
      ) : (
        <div>
          {sorted.map(item => {
            const pct = netWorth > 0 ? (item.amountCHF / netWorth) * 100 : null
            const cls = pct == null ? null : pctClass(pct)
            const fill = pct == null ? 0 : Math.min(100, pct)
            const originalLabel =
              item.enteredCurrency && item.enteredAmount != null
                ? `${item.enteredCurrency} ${item.enteredAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                : fmt(item.amountCHF)

            return (
              <div key={item.id} className={styles.wishRow}>
                <div className={styles.wishRowH}>
                  <div>
                    <div className={styles.wishRowName}>{item.name}</div>
                    <div className={styles.wishRowMeta}>
                      {originalLabel} · added {formatActivityDate(item.ts)}
                    </div>
                  </div>
                  <div className={styles.wishRowAmtWrap}>
                    <div className={styles.wishRowAmt}>{fmt(item.amountCHF)}</div>
                    <div className={`${styles.wishRowPct} ${pctSuffix(cls)}`}>
                      {pct == null ? '-' : `${pct.toFixed(2)}%`} of NW
                    </div>
                  </div>
                  {item.url ? (
                    <a
                      className={`${styles.iconBtn} ${styles.iconLink}`}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Open ${item.name} store page`}
                      aria-label={`Open ${item.name} store page`}
                    >
                      🔗
                    </a>
                  ) : (
                    <button
                      type="button"
                      className={styles.iconBtn}
                      title="Add store link"
                      aria-label={`Add store link for ${item.name}`}
                      onClick={() => {
                        const input = window.prompt(`Paste the store link for ${item.name}`)
                        if (input == null) return
                        const u = normalizeUrl(input)
                        if (!u) {
                          if (input.trim()) alert('That doesn’t look like a valid web link.')
                          return
                        }
                        actions.setWishUrl(item.id, u)
                      }}
                    >
                      🔗
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.iconBtn}
                    title="Remove"
                    onClick={() => actions.deleteWish(item.id)}
                  >
                    ×
                  </button>
                </div>
                <div className={styles.wishRowBar}>
                  <div
                    className={`${styles.wishRowBarFill} ${pctSuffix(cls)}`}
                    style={{ width: `${fill}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

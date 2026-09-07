'use client'

import Link from 'next/link'
import styles from './finance.module.css'
import type { Currency } from './types'
import { CURRENCIES } from './types'

interface Props {
  currency: Currency
  onCurrencyChange: (c: Currency) => void
}

/**
 * Page header: back-to-dashboard pill, serif italic title + subtitle,
 * segmented currency selector on the right.
 */
export default function FinanceHeader({ currency, onCurrencyChange }: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <Link href="/app" className={styles.back}>
          <span className={styles.backArrow}>←</span> Vitality
        </Link>
        <h1 className={styles.title}>Finance</h1>
        <p className={styles.subtitle}>Net worth · subs · orders · wishlist</p>
      </div>

      <div className={styles.currencySeg} role="group" aria-label="Display currency">
        {CURRENCIES.map(c => (
          <button
            key={c}
            type="button"
            aria-pressed={c === currency}
            aria-label={`Show amounts in ${c}`}
            className={`${styles.currencyBtn} ${c === currency ? styles.currencyBtnActive : ''}`}
            onClick={() => onCurrencyChange(c)}
          >
            {c}
          </button>
        ))}
      </div>
    </header>
  )
}

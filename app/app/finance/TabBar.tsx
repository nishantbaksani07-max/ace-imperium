'use client'

import styles from './finance.module.css'
import type { TabKey } from './types'
import { TAB_KEYS } from './types'

const LABELS: Record<TabKey, string> = {
  net: 'net worth',
  subs: 'subscriptions',
  orders: 'orders',
  wish: 'wishlist',
  coach: 'coach',
  stocks: 'stocks',
  crypto: 'crypto',
}

interface Props {
  active: TabKey
  onChange: (t: TabKey) => void
  /** Which tabs to render. Defaults to the full TAB_KEYS set; the mounted
   *  Finance tile passes MOUNTED_TABS so only subs + stocks show. */
  tabs?: TabKey[]
}

/**
 * Floating bottom-bar tab switcher. Mirrors the standalone's behavior but
 * with Vitality voice (lowercase labels, no emoji, mint active pill).
 */
export default function TabBar({ active, onChange, tabs = TAB_KEYS }: Props) {
  return (
    <nav className={styles.tabBar} aria-label="Finance sections">
      <div className={styles.tabBarInner}>
        {tabs.map(key => (
          <button
            key={key}
            type="button"
            className={`${styles.tab} ${key === active ? styles.active : ''}`}
            onClick={() => onChange(key)}
            aria-pressed={key === active}
          >
            {LABELS[key]}
          </button>
        ))}
      </div>
    </nav>
  )
}

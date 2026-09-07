'use client'

import Link from 'next/link'
import styles from './supplements.module.css'

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export default function SupplementsHeader() {
  const d = new Date()
  const dayLabel = `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`

  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <Link href="/app/fuel" className={styles.back}>
          <span className={styles.backArrow}>←</span> Fuel
        </Link>
        <span className={styles.dayPill}>{dayLabel}</span>
        <h1 className={styles.title}>Supplements</h1>
        <p className={styles.subtitle}>Daily stack · resets at 6 AM</p>
      </div>
    </header>
  )
}

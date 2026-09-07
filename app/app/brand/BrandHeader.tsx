'use client'

import Link from 'next/link'
import styles from './brand.module.css'

interface Props {
  totalBrands: number
  onNew: () => void
}

/**
 * Top-of-page header. Back to /app, serif italic title, subtle pill
 * count of how many brands are active, and a "+ new brand" CTA.
 */
export default function BrandHeader({ totalBrands, onNew }: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <Link href="/app" className={styles.back}>
          <span className={styles.backArrow}>←</span> Vitality
        </Link>
        <span className={styles.countPill}>
          {totalBrands === 0
            ? 'No brands yet'
            : `${totalBrands} ${totalBrands === 1 ? 'brand' : 'brands'}`}
        </span>
        <h1 className={styles.title}>Brand</h1>
        <p className={styles.subtitle}>Track what you’re building</p>
      </div>

      <button type="button" className={styles.newBtn} onClick={onNew}>
        <span className={styles.newBtnPlus} aria-hidden>+</span>
        New brand
      </button>
    </header>
  )
}

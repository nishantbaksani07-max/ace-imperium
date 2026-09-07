'use client'

import { useState } from 'react'
import styles from './brand.module.css'
import type { Brand } from './types'
import type { BrandActions } from './state'

/**
 * Copy another brand's social setup (accounts + post links) into this one.
 * Generic: lists every other brand that has accounts, so any brand can pull a
 * setup from any other (e.g. a fresh brand replicating a fully-built one).
 * Hidden when there's nothing to copy from.
 */
export default function CopyFromBrand({
  targetBrand, brands, actions,
}: {
  targetBrand: Brand
  brands: Brand[]
  actions: BrandActions
}) {
  const others = brands.filter((b) => b.id !== targetBrand.id && b.accounts.length > 0)
  const [sourceId, setSourceId] = useState('')
  const [done, setDone] = useState(false)
  if (others.length === 0) return null

  return (
    <div className={styles.copyBar}>
      <span className={styles.copyBarLabel}>Copy setup from</span>
      <select
        className={styles.scSelect}
        value={sourceId}
        onChange={(e) => { setSourceId(e.target.value); setDone(false) }}
        aria-label="Brand to copy from"
      >
        <option value="">another brand…</option>
        {others.map((b) => (
          <option key={b.id} value={b.id}>{b.name} ({b.accounts.length})</option>
        ))}
      </select>
      <button
        type="button"
        className={styles.copyBarBtn}
        disabled={!sourceId}
        onClick={() => {
          actions.copySocialFrom(targetBrand.id, sourceId)
          setSourceId('')
          setDone(true)
          setTimeout(() => setDone(false), 2200)
        }}
      >
        {done ? 'Copied ✓' : 'Copy accounts + links'}
      </button>
    </div>
  )
}

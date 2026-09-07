'use client'

import { useEffect, useState } from 'react'
import styles from './brand.module.css'
import BrandHeader from './BrandHeader'
import BrandList from './BrandList'
import IntakeFlow from './IntakeFlow'
import { TabNav } from './socials/SocialsView'
import { useBrandState } from './state'
import type { NewBrandInput } from './state'

/**
 * Root of the Brand module — the multi-venture portfolio view.
 *
 * Holds:
 *  - the brand list state (useBrandState, localStorage-backed)
 *  - the "new brand" modal open/closed flag
 *
 * The list itself is a grid of compact cards (one per brand); tapping a
 * card routes to the detail page. The big mint "+ New brand" button
 * opens the create wizard.
 */
export default function BrandModule() {
  const { ready, state, actions } = useBrandState()
  const [showNew, setShowNew] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  function handleCreate(input: NewBrandInput) {
    actions.createBrand(input)
    setShowNew(false)
  }

  if (!mounted || !ready) {
    return (
      <main className={`${styles.page} grain-overlay`}>
        <div className={styles.shell} />
      </main>
    )
  }

  const active = state.brands.filter(b => !b.archived)

  return (
    <main className={`${styles.page} grain-overlay`}>
      <div className={styles.shell}>
        <BrandHeader
          totalBrands={active.length}
          onNew={() => setShowNew(true)}
        />

        <TabNav active="brands" />

        <BrandList
          brands={active}
          onLog={actions.logShipped}
          onNew={() => setShowNew(true)}
        />
      </div>

      {showNew && (
        <IntakeFlow
          onClose={() => setShowNew(false)}
          onCreate={handleCreate}
        />
      )}
    </main>
  )
}

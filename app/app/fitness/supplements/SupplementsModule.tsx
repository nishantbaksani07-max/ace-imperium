'use client'

import { useEffect, useMemo, useState } from 'react'
import styles from './supplements.module.css'
import SupplementsHeader from './SupplementsHeader'
import HeroCard from './HeroCard'
import StackList from './StackList'
import AddForm from './AddForm'
import RecommendationsCard from './RecommendationsCard'
import { useSupplementsState } from './state'
import { useWaterSnapshot, useWhoopSnapshot } from './signals'
import { setOrderPrefill } from '@/lib/orderPrefill'
import type { SupplementsServerProps } from './page'
import type { DbSupplement } from './types'

interface Props {
  serverProps: SupplementsServerProps
}

/**
 * Root of the Supplements module. Holds:
 *   - the local stack state (useSupplementsState)
 *   - a read-only snapshot of the water module's substances/caffeine
 *     state, so the recommender can react to your stimulant load
 *
 * Server-side profile data (age / sex / goal / gym level) is passed in
 * via props from page.tsx; the recommender combines those with the
 * client-side snapshots above to produce the personalised picks.
 */
export default function SupplementsModule({ serverProps }: Props) {
  const sup = useSupplementsState()
  const water = useWaterSnapshot()
  const whoop = useWhoopSnapshot()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Set of source DB ids the user already has in their stack — used by
  // the recommender to skip suggesting duplicates.
  const alreadyTakingIds = useMemo(() => {
    const set = new Set<string>()
    for (const item of sup.state.items) {
      if (item.sourceId) set.add(item.sourceId)
    }
    return set
  }, [sup.state.items])

  // A recommendation is a "want to buy", not a "now taking". Route the user
  // through Finance → Orders with the line pre-filled so they place the order
  // intentionally; the stack picks it up once the bottle arrives (future:
  // mark-as-received hook).
  function addFromRecommendation(s: DbSupplement) {
    setOrderPrefill({
      name: s.name,
      priceUsdMonthly: s.priceUsdMonthly,
      source: 'supplement-rec',
    })
    window.location.href = '/app/finance'
  }

  if (!mounted || !sup.ready) {
    return (
      <main className={`${styles.page} grain-overlay`}>
        <div className={styles.shell} />
      </main>
    )
  }

  return (
    <main className={`${styles.page} grain-overlay`}>
      <div className={styles.shell}>
        <SupplementsHeader />

        <HeroCard
          takenCount={sup.takenCount}
          totalCount={sup.totalCount}
          missedCount={sup.missed.length}
          lowCount={sup.state.low.length}
        />

        <StackList
          items={sup.state.items}
          todayTaken={sup.todayTaken}
          low={sup.state.low}
          onToggleTaken={sup.actions.toggleTaken}
          onToggleLow={sup.actions.toggleLow}
          onRemove={sup.actions.removeItem}
        />

        <AddForm onAdd={sup.actions.addItem} />

        <RecommendationsCard
          age={serverProps.age}
          sex={serverProps.sex}
          goal={serverProps.goal}
          gymLevel={serverProps.gymLevel}
          caffeineMgPerDay={water.caffeineMgPerDay}
          hasStims={water.hasStims}
          hasNicotine={water.hasNicotine}
          hasAlcohol={water.hasAlcohol}
          whoop={whoop}
          alreadyTakingIds={alreadyTakingIds}
          onAdd={addFromRecommendation}
        />
      </div>
    </main>
  )
}

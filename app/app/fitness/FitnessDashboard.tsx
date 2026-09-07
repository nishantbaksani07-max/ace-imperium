'use client'

import Link from 'next/link'
import dashboardStyles from '../dashboard.module.css'
import styles from './fitness.module.css'
import PosterGrid, { type PosterConfig } from '@/components/PosterGrid'

/**
 * Fitness sub-dashboard.
 *
 * Reached by clicking the Fitness poster on the category dashboard at /app.
 * Same bento aesthetic, same cursor parallax — but the posters represent
 * fitness-specific modules.
 *
 * The one active poster is the Workout Logger (·01, hero slot, navigates to
 * /app/fitness/log). The other five are concept posters for fitness modules
 * we'll ship over time: water, weight, supplements, WHOOP, goals.
 */
export default function FitnessDashboard() {
  const posters: PosterConfig[] = [
    { art: 'aurora',  grid: 'hero',    label: 'Workout Logger', href: '/app/fitness/log' },
    { art: 'dots',    grid: 'tall',    label: 'Progress', href: '/app/fitness/progress' },
    { art: 'duotone', grid: 'square',  label: 'Supplements', href: '/app/fuel' },
    { art: 'grid',    grid: 'square',  label: 'WHOOP', href: '/app/fitness/whoop' },
    { art: 'lines',   grid: 'square',  label: 'Fitbit', href: '/app/fitness/fitbit' },
    { art: 'aurora',  grid: 'square',  label: 'Oura', href: '/app/fitness/oura' },
    { art: 'lines',   grid: 'wideBot', label: 'Goals' },
  ]

  return (
    <main className={`${dashboardStyles.page} grain-overlay`}>
      <div className={dashboardStyles.shell}>
        <div className={styles.header}>
          <Link href="/app" className={styles.back}>
            <span className={styles.backArrow}>←</span> Vitality
          </Link>
          <h1 className={styles.title}>Fitness</h1>
          <p className={styles.subtitle}>Training · recovery · physical baseline</p>
        </div>
        <PosterGrid posters={posters} />
      </div>
    </main>
  )
}

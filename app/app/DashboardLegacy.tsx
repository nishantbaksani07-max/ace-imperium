'use client'

import { useState, useTransition } from 'react'
import styles from './dashboard.module.css'
import DashboardHeader from './DashboardHeader'
import PosterGrid, { type PosterConfig } from '@/components/PosterGrid'
import SettingsSheet from '../app/fitness/log/SettingsSheet'
import { setUnits as setUnitsAction } from '../app/fitness/log/actions'
import { SettingsGear } from '@/components/SettingsGear'
import type { Units } from '@/lib/units'
import type { OnboardingTask } from '@/lib/onboardingTasks'

interface DashboardLegacyProps {
  firstName: string | null
  tasks: OnboardingTask[]
  units: Units
  userId: string
}

/**
 * Legacy dashboard, preserved for rollback during the Phase 1 consolidation.
 *
 * Renders the original 7-tile poster grid (Fitness, Brand, Peak, Finance,
 * Goals, Mentor, Peak Tracker). To roll back the new 6-tile consolidated
 * Dashboard, edit app/app/page.tsx to import DashboardLegacy from this
 * file instead of ./Dashboard. Slated for deletion in Phase 4 of the
 * dashboard consolidation work once Phases 2 and 3 ship without issue.
 *
 * See docs/superpowers/specs/2026-05-29-dashboard-consolidation-design.md
 * for the full phasing.
 */
export default function DashboardLegacy({
  firstName,
  units: initialUnits,
  tasks,
  userId,
}: DashboardLegacyProps) {
  const [units, setUnits] = useState<Units>(initialUnits)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [, startTransition] = useTransition()

  function toggleUnits(next: Units) {
    if (next === units) return
    setUnits(next)
    startTransition(async () => {
      const res = await setUnitsAction(next)
      if (!res.ok) setUnits(units)
    })
  }

  const posters: PosterConfig[] = [
    { art: 'aurora',  grid: 'hero',    label: 'Fitness', href: '/app/fitness' },
    { art: 'grid',    grid: 'wideTop', label: 'Brand', href: '/app/brand' },
    { art: 'dots',    grid: 'tall',    label: 'Peak', href: '/app/peak' },
    { art: 'duotone', grid: 'square',  label: 'Finance', href: '/app/finance' },
    { art: 'frosted', grid: 'square',  label: 'Goals', href: '/app/goals' },
    { art: 'lines',   grid: 'wideBot', label: 'Mentor', href: '/app/mentor' },
    { art: 'mountain', grid: 'wideBot', label: 'Peak Tracker', href: '/app/peak-tracker' },
  ]

  return (
    <main className={`${styles.page} grain-overlay`}>
      <button
        type="button"
        className={styles.settingsBtn}
        onClick={() => setSettingsOpen(true)}
        aria-label="Settings"
        title="Settings"
      >
        <SettingsGear />
      </button>

      <div className={styles.shell}>
        <DashboardHeader firstName={firstName} />
        <PosterGrid posters={posters} />
      </div>

      {settingsOpen && (
        <SettingsSheet
          units={units}
          onUnitsChange={toggleUnits}
          tasks={tasks}
          userId={userId}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </main>
  )
}

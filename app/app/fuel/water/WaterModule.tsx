'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import styles from './water.module.css'
import WaterHeader from './WaterHeader'
import HeroCard from './HeroCard'
import HistoryCard from './HistoryCard'
import SettingsModal from './SettingsModal'
import { useWaterState } from './state'
import { updateAccountProfile } from './actions'
import type { AccountProfile, Sex, WeightUnit } from './types'

interface Props {
  /** Snapshot from user_profile (page.tsx). Treated as initial value;
   *  modal edits update local state optimistically and persist via the
   *  updateAccountProfile server action. */
  profile: AccountProfile
  /** Optional seed values from the user's Hydration quiz answers. Used
   *  to pre-fill the water state on first mount when localStorage is
   *  empty — once the user has interacted, their saved state wins. */
  hydrationSeed?: {
    caffeineMgPerDay: number
    activityHrsPerWeek: number
    targetOverrideOz: number
  } | null
}

export interface ProfilePatch {
  weightKg?: number
  sex?: Sex
  weightUnit?: WeightUnit
}

/**
 * Root of the Water module. Holds:
 *   - water state (localStorage-backed: bottle/glass/caffeine/subs/logs)
 *   - account profile (optimistic mirror of user_profile)
 *
 * Profile edits in the Settings modal flow through `handleProfilePatch`,
 * which updates the local copy immediately and fires the server action
 * in a transition.
 */
export default function WaterModule({ profile: initialProfile, hydrationSeed }: Props) {
  const router = useRouter()
  const [profile, setProfile] = useState<AccountProfile>(initialProfile)
  const [, startTransition] = useTransition()

  // Re-sync if the server prop changes (e.g. user edits on a different
  // tab + this page re-renders). Cheap to compare; AccountProfile is flat.
  useEffect(() => {
    setProfile(initialProfile)
  }, [initialProfile])

  const water = useWaterState(profile, hydrationSeed ?? undefined)
  const [showSettings, setShowSettings] = useState(false)
  // Hydration guard: localStorage is unavailable during SSR. Render an
  // empty shell on first paint, then swap in the hydrated tree once
  // useWaterState reports ready. Same pattern as the finance module.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const handleProfilePatch = useCallback((patch: ProfilePatch) => {
    setProfile(prev => ({ ...prev, ...patch }))
    startTransition(async () => {
      const res = await updateAccountProfile({
        weightKg: patch.weightKg,
        sex: patch.sex === 'm' ? 'M' : patch.sex === 'f' ? 'F' : undefined,
        units:
          patch.weightUnit === 'lb' ? 'imperial'
          : patch.weightUnit === 'kg' ? 'metric'
          : undefined,
      })
      if (!res.ok) {
        // Revert optimistic update on failure and surface to user.
        setProfile(initialProfile)
        alert(`Couldn't save profile: ${res.error ?? 'unknown error'}`)
        return
      }
      // Keep other server-rendered consumers of user_profile fresh.
      router.refresh()
    })
  }, [initialProfile, router])

  if (!mounted || !water.ready) {
    return (
      <main className={`${styles.page} grain-overlay`}>
        <div className={styles.shell} />
      </main>
    )
  }

  return (
    <main className={`${styles.page} grain-overlay`}>
      <div className={styles.shell}>
        <WaterHeader onOpenSettings={() => setShowSettings(true)} />

        <HeroCard
          state={water.state}
          profile={profile}
          todayCount={water.todayCount}
          targetUnits={water.targetUnits}
          target={water.target}
          actions={water.actions}
        />

        <HistoryCard
          state={water.state}
          targetUnits={water.targetUnits}
        />
      </div>

      {showSettings && (
        <SettingsModal
          state={water.state}
          profile={profile}
          actions={water.actions}
          onProfilePatch={handleProfilePatch}
          onClose={() => setShowSettings(false)}
        />
      )}
    </main>
  )
}

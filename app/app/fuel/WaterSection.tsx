'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import VitalityIcon from '@/components/VitalityIcon'
import { getLocalDateKey } from '@/lib/dates'
import SettingsModal from './water/SettingsModal'
import { useWaterState, unitLabel as waterUnitLabel, fmtMl } from './water/state'
import { updateAccountProfile } from './water/actions'
import type { ProfilePatch } from './water/WaterModule'
import type { AccountProfile, WaterState } from './water/types'
import styles from './fuelSections.module.css'

interface Props {
  /** Snapshot from user_profile (drives the personal hydration target). */
  profile: AccountProfile
  /** Optional seed from the Hydration quiz; tailors caffeine/activity on first mount. */
  seed?: {
    caffeineMgPerDay: number
    activityHrsPerWeek: number
    targetOverrideOz: number
  } | null
  /** Server-loaded water mirror (loadWaterState): makes water read-through
   *  Supabase so a new phone / cleared cache still sees prefs + logged days. */
  initialWater?: Partial<WaterState> | null
}

/**
 * Water tracker, folded into the Fuel page as a stacked section. Reuses the
 * exact `useWaterState` hook + localStorage key (`vitality_water_v1`), so all
 * logged days survive and Peak's water read keeps working untouched. Settings
 * (units, sizes, caffeine, activity, substances, profile) reuse the existing
 * SettingsModal; the daily UI is rebuilt to match the macro tracker's look.
 */
export default function WaterSection({ profile: initialProfile, seed, initialWater }: Props) {
  const router = useRouter()
  const [profile, setProfile] = useState<AccountProfile>(initialProfile)
  const [, startTransition] = useTransition()
  const [mounted, setMounted] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [flash, setFlash] = useState(false)

  useEffect(() => setMounted(true), [])
  useEffect(() => setProfile(initialProfile), [initialProfile])

  const water = useWaterState(profile, seed ?? undefined, initialWater)

  // The Drinks library logs water in ml; fold it into the hydration ring so
  // water reads as one number across the app (mirrors the log-weight event).
  useEffect(() => {
    const onLog = (e: Event) => {
      const ml = (e as CustomEvent<{ ml: number }>).detail?.ml
      if (typeof ml === 'number' && ml > 0) water.actions.logMl(ml)
    }
    window.addEventListener('vitality:log-water', onLog)
    return () => window.removeEventListener('vitality:log-water', onLog)
  }, [water.actions])

  // The Drinks library's "Log water" shortcut bounces here — scroll this
  // section into view and flash it so the eye lands on the right place.
  useEffect(() => {
    const onGoto = () => {
      document.getElementById('fuel-water')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setFlash(true)
      window.setTimeout(() => setFlash(false), 1500)
    }
    window.addEventListener('vitality:goto-water', onGoto)
    return () => window.removeEventListener('vitality:goto-water', onGoto)
  }, [])

  const handleProfilePatch = useCallback(
    (patch: ProfilePatch) => {
      setProfile((prev) => ({ ...prev, ...patch }))
      startTransition(async () => {
        const res = await updateAccountProfile({
          weightKg: patch.weightKg,
          sex: patch.sex === 'm' ? 'M' : patch.sex === 'f' ? 'F' : undefined,
          units:
            patch.weightUnit === 'lb' ? 'imperial' : patch.weightUnit === 'kg' ? 'metric' : undefined,
        })
        if (!res.ok) {
          setProfile(initialProfile)
          alert(`Couldn't save profile: ${res.error ?? 'unknown error'}`)
          return
        }
        router.refresh()
      })
    },
    [initialProfile, router],
  )

  const Eyebrow = (
    <div className={styles.eyebrow}>
      <span className={styles.eyebrowNum}>·04</span>
      <span className={styles.eyebrowLbl}>Water</span>
      <span className={styles.eyebrowRule} />
    </div>
  )

  if (!mounted || !water.ready) {
    return (
      <section id="fuel-water" className={styles.section}>
        {Eyebrow}
        <div className={styles.card} style={{ minHeight: 200 }} />
      </section>
    )
  }

  const { todayCount, targetUnits, target, actions, state } = water
  const pct = targetUnits > 0 ? Math.min(todayCount / targetUnits, 1) : 0
  const hit = todayCount >= targetUnits
  const uPlural = waterUnitLabel(state, true)
  const uSingular = waterUnitLabel(state, false)
  const toGo = Math.max(0, targetUnits - todayCount)

  // compact last-7-days strip from the same logs Peak reads
  const days: { key: string; count: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = getLocalDateKey(d)
    days.push({ key, count: state.logs[key] || 0 })
  }
  const maxCount = Math.max(targetUnits, ...days.map((d) => d.count), 1)

  return (
    <section id="fuel-water" className={styles.section}>
      {Eyebrow}
      <div className={`${styles.card} ${flash ? styles.flash : ''}`}>
        <div className={styles.tileTop}>
          <span className={styles.tileIc}>
            <VitalityIcon name="drop" size={20} />
          </span>
          <span className={styles.tileLbl}>Water</span>
          <button className={styles.gear} onClick={() => setShowSettings(true)} aria-label="Water settings">
            <VitalityIcon name="gear" size={16} />
          </button>
        </div>

        <div className={styles.count}>
          <span className={styles.countNum}>{todayCount}</span>
          <span className={styles.countUnit}>
            / {targetUnits} {uPlural}
          </span>
        </div>

        <div className={styles.meter}>
          <div className={styles.fill} style={{ width: `${pct * 100}%` }} />
        </div>

        <div className={styles.actions}>
          <button className={styles.drink} onClick={actions.drank}>
            <VitalityIcon name="drop" size={16} /> Drank a {uSingular}
          </button>
          <button className={styles.undo} onClick={actions.undo} disabled={todayCount <= 0} aria-label="Undo last">
            −
          </button>
        </div>

        <div className={styles.foot}>
          <span>
            <b>{fmtMl(target.total)}</b> target
          </span>
          <span>{hit ? 'Target hit. Nice.' : `${toGo} ${toGo === 1 ? uSingular : uPlural} to go`}</span>
        </div>

        <div className={styles.spark} aria-hidden>
          {days.map((d) => (
            <div
              key={d.key}
              className={`${styles.sparkBar} ${d.count >= targetUnits ? styles.sparkHit : ''}`}
              style={{ height: `${Math.max(8, (d.count / maxCount) * 100)}%` }}
              title={`${d.key}: ${d.count}`}
            />
          ))}
        </div>
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
    </section>
  )
}

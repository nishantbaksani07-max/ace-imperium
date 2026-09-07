'use client'

import { useState } from 'react'
import styles from './water.module.css'
import { fmtMl, subExtraMl, unitLabel } from './state'
import type { AccountProfile, Substance, TargetBreakdown, WaterState } from './types'

interface Props {
  state: WaterState
  profile: AccountProfile
  target: TargetBreakdown
  targetUnits: number
}

interface Row {
  label: string
  value: string
}

function buildRows(
  state: WaterState,
  profile: AccountProfile,
  target: TargetBreakdown,
  targetUnits: number,
): { rows: Row[]; total: Row } {
  const rows: Row[] = []
  const wDisp = profile.weightUnit === 'lb'
    ? Math.round(profile.weightKg * 2.20462)
    : Math.round(profile.weightKg)
  rows.push({ label: `Base (${wDisp} ${profile.weightUnit} × 35 ml)`, value: fmtMl(target.base) })
  if (target.exercise > 0) {
    rows.push({ label: `+ Exercise (${state.activityHrsPerWeek} h/wk)`, value: `+ ${fmtMl(target.exercise)}` })
  }
  if (target.caffeine > 0) {
    rows.push({ label: `+ Caffeine (${state.caffeineMgPerDay} mg/day)`, value: `+ ${fmtMl(target.caffeine)}` })
  }
  state.substances.forEach((s: Substance) => {
    const dose = s.dose ?? s.defaultDose
    rows.push({ label: `+ ${s.name} (${dose} ${s.unit})`, value: `+ ${fmtMl(subExtraMl(s))}` })
  })
  if (target.adjust > 0) {
    rows.push({ label: '+ Sex / age adjustment', value: `+ ${fmtMl(target.adjust)}` })
  }
  const total: Row = {
    label: 'Daily target',
    value: `${fmtMl(target.total)} ≈ ${targetUnits} ${unitLabel(state, true)}`,
  }
  return { rows, total }
}

/**
 * Collapsible breakdown of the daily target — the hidden math behind the
 * "/ N" number. Mirrors the standalone's "Why this target?" section.
 */
export default function WhyBreakdown({ state, profile, target, targetUnits }: Props) {
  const [open, setOpen] = useState(false)
  const { rows, total } = buildRows(state, profile, target, targetUnits)

  return (
    <div className={styles.whyWrap}>
      <button
        type="button"
        className={styles.whyToggle}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span>Why this target?</span>
        <span className={`${styles.whyArrow} ${open ? styles.whyArrowOpen : ''}`}>▾</span>
      </button>

      {open && (
        <div className={styles.whyBody}>
          {rows.map((r, i) => (
            <div key={i} className={styles.whyRow}>
              <span className={styles.whyLabel}>{r.label}</span>
              <span className={styles.whyVal}>{r.value}</span>
            </div>
          ))}
          <div className={`${styles.whyRow} ${styles.whyRowTotal}`}>
            <span className={styles.whyLabel}>{total.label}</span>
            <span className={styles.whyVal}>{total.value}</span>
          </div>
        </div>
      )}
    </div>
  )
}

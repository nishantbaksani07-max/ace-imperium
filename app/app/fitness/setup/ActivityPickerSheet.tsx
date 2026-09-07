'use client'

import { useEffect, useState } from 'react'
import styles from './setup.module.css'
import type { ActiveRest, ActiveRestActivity } from './presets'

interface PresetOption {
  activity: ActiveRestActivity
  label: string
  /** Shown as the time input's placeholder. The user's typed value
   *  overrides it; if they don't type anything, we commit with this. */
  suggestedDuration: number
  Icon: React.FC
}

const PRESETS: PresetOption[] = [
  { activity: 'cardio_zone2',     label: 'Zone 2 cardio', suggestedDuration: 30, Icon: WaveIcon },
  { activity: 'cardio_intervals', label: 'Intervals',     suggestedDuration: 25, Icon: PulseIcon },
  { activity: 'sport',            label: 'Sport',         suggestedDuration: 60, Icon: BallIcon },
  { activity: 'yoga',             label: 'Yoga',          suggestedDuration: 45, Icon: LeafIcon },
  { activity: 'mobility',         label: 'Mobility',      suggestedDuration: 20, Icon: ArcIcon },
  { activity: 'walk',             label: 'Walk',          suggestedDuration: 30, Icon: StepsIcon },
]

interface Props {
  dayName: string
  current: ActiveRest | undefined
  onPick: (next: ActiveRest | null) => void
  onClose: () => void
}

export default function ActivityPickerSheet({ dayName, current, onPick, onClose }: Props) {
  // Per-row draft durations so users can type into multiple rows and
  // pick the one they actually want without losing what they typed.
  // Pre-populates if the user is editing an existing activity.
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    if (current && current.activity !== 'custom') {
      return { [current.activity]: String(current.durationMin) }
    }
    return {}
  })

  const [customLabel, setCustomLabel] = useState<string>(current?.customLabel ?? '')
  const [customDuration, setCustomDuration] = useState<string>(
    current?.activity === 'custom' ? String(current.durationMin) : '',
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function commitPreset(opt: PresetOption) {
    const typed = drafts[opt.activity]?.trim() ?? ''
    const parsed = parseInt(typed, 10)
    const safeDuration = Number.isFinite(parsed) && parsed > 0
      ? Math.min(parsed, 240)
      : opt.suggestedDuration
    onPick({ activity: opt.activity, durationMin: safeDuration })
    onClose()
  }

  function commitCustom() {
    const trimmed = customLabel.trim()
    if (!trimmed) return
    const parsed = parseInt(customDuration, 10)
    const safeDuration = Number.isFinite(parsed) && parsed > 0
      ? Math.min(parsed, 240)
      : 30
    onPick({ activity: 'custom', durationMin: safeDuration, customLabel: trimmed })
    onClose()
  }

  const customReady = customLabel.trim().length > 0 && customDuration.trim().length > 0

  return (
    <div
      className={styles.activitySheetOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-sheet-title"
      onClick={onClose}
    >
      <div className={styles.activitySheet} onClick={e => e.stopPropagation()}>
        <header className={styles.activitySheetHead}>
          <span className={styles.activitySheetEyebrow}>
            <span className={styles.activitySheetEyebrowRule} aria-hidden />
            {dayName.toUpperCase()}
          </span>
          <h2 id="activity-sheet-title" className={styles.activitySheetTitle}>
            <em>What goes on this day?</em>
          </h2>
          <button
            type="button"
            className={styles.activitySheetClose}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <ul className={styles.activitySheetList}>
          {PRESETS.map(opt => {
            const isCurrent = current?.activity === opt.activity
            const draft = drafts[opt.activity] ?? ''
            return (
              <li key={opt.activity}>
                <div
                  className={`${styles.activityOption} ${isCurrent ? styles.activityOptionCurrent : ''}`}
                  onClick={() => commitPreset(opt)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      commitPreset(opt)
                    }
                  }}
                >
                  <span className={styles.activityOptionIcon} aria-hidden>
                    <opt.Icon />
                  </span>
                  <span className={styles.activityOptionLabel}>{opt.label}</span>
                  <span
                    className={styles.activityOptionDurationField}
                    onClick={e => e.stopPropagation()}
                  >
                    <input
                      type="number"
                      inputMode="numeric"
                      className={styles.activityOptionDurationInput}
                      value={draft}
                      onChange={e => setDrafts(d => ({ ...d, [opt.activity]: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          commitPreset(opt)
                        }
                      }}
                      placeholder={String(opt.suggestedDuration)}
                      min={1}
                      max={240}
                      aria-label={`Duration for ${opt.label} in minutes`}
                    />
                    <span className={styles.activityOptionDurationUnit}>min</span>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>

        <div className={styles.activityCustomDivider} aria-hidden />

        <div className={styles.activityCustomRow}>
          <input
            type="text"
            className={`${styles.activityFooterInput} ${styles.activityCustomName}`}
            value={customLabel}
            onChange={e => setCustomLabel(e.target.value)}
            placeholder="Add your own…"
            maxLength={32}
            onKeyDown={e => { if (e.key === 'Enter' && customReady) commitCustom() }}
          />
          <span className={styles.activityCustomDurationGroup}>
            <input
              type="number"
              inputMode="numeric"
              className={`${styles.activityFooterInput} ${styles.activityCustomDuration}`}
              value={customDuration}
              onChange={e => setCustomDuration(e.target.value)}
              min={1}
              max={240}
              placeholder="30"
              onKeyDown={e => { if (e.key === 'Enter' && customReady) commitCustom() }}
            />
            <span className={styles.activityFooterUnit}>min</span>
          </span>
          <button
            type="button"
            className={styles.activityCustomSave}
            onClick={commitCustom}
            disabled={!customReady}
            aria-label="Save custom activity"
          >
            <span aria-hidden>→</span>
          </button>
        </div>

        {current && (
          <button
            type="button"
            className={styles.activityRemoveLink}
            onClick={() => { onPick(null); onClose() }}
          >
            <em>remove activity</em>
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Minimalist activity icons ──────────────────────────────────────
// Line-art SVGs in currentColor, 18x18. Geometry maps to each activity's
// "feel": steady wave for zone 2, alternating pulse for intervals, a
// ball for sport, a single leaf for yoga, an arc for mobility, two
// stepping dots for walk.

function iconProps() {
  return {
    viewBox: '0 0 18 18',
    width: 16,
    height: 16,
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
}

function WaveIcon() {
  // Steady aerobic = gentle sine wave
  return (
    <svg {...iconProps()}>
      <path d="M2 9 Q 5 5, 8 9 T 14 9 T 16 9" />
    </svg>
  )
}

function PulseIcon() {
  // Intervals = stepped high-low rectangles
  return (
    <svg {...iconProps()}>
      <path d="M2 12 L 4 12 L 4 6 L 7 6 L 7 12 L 10 12 L 10 6 L 13 6 L 13 12 L 16 12" />
    </svg>
  )
}

function BallIcon() {
  // Sport = ball with a seam
  return (
    <svg {...iconProps()}>
      <circle cx="9" cy="9" r="6.5" />
      <path d="M2.5 9 H 15.5" />
    </svg>
  )
}

function LeafIcon() {
  // Yoga = a single calm leaf
  return (
    <svg {...iconProps()}>
      <path d="M3 15 Q 3 4, 14 4 Q 14 15, 3 15 Z" />
      <path d="M3 15 L 14 4" />
    </svg>
  )
}

function ArcIcon() {
  // Mobility = a flexing arc with two anchor dots
  return (
    <svg {...iconProps()}>
      <path d="M3 13 Q 9 1, 15 13" />
      <circle cx="3" cy="13" r="1.2" fill="currentColor" />
      <circle cx="15" cy="13" r="1.2" fill="currentColor" />
    </svg>
  )
}

function StepsIcon() {
  // Walk = two stepping prints / dots offset
  return (
    <svg {...iconProps()}>
      <ellipse cx="5.5" cy="12.5" rx="2.2" ry="1.4" />
      <ellipse cx="12" cy="6.5" rx="2.2" ry="1.4" />
    </svg>
  )
}

export function activityDisplay(ar: ActiveRest): { label: string; suffix: string } {
  switch (ar.activity) {
    case 'cardio_zone2':     return { label: 'Zone 2 cardio',  suffix: `${ar.durationMin} min` }
    case 'cardio_intervals': return { label: 'Intervals',      suffix: `${ar.durationMin} min` }
    case 'sport':            return { label: 'Sport',          suffix: `${ar.durationMin} min` }
    case 'yoga':             return { label: 'Yoga',           suffix: `${ar.durationMin} min` }
    case 'mobility':         return { label: 'Mobility',       suffix: `${ar.durationMin} min` }
    case 'walk':             return { label: 'Walk',           suffix: `${ar.durationMin} min` }
    case 'custom':           return { label: ar.customLabel || 'Activity', suffix: `${ar.durationMin} min` }
  }
}

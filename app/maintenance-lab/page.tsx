'use client'

// Public lab (like /gem-library): mounts the REAL MaintenanceSection with mock
// data so the actual shipped tile can be seen in every state, in the real Fuel
// theme. Not linked anywhere; for design review only.

import { useState } from 'react'

import MaintenanceSection from '../app/fuel/macros/MaintenanceSection'
import WeightLogger from '../app/fuel/macros/WeightLogger'
import type { WeightEntry } from '../app/fuel/macros/serialize'
import { goalBandFor, type Checkin } from '@/lib/nutrition/adaptive'

function pad(n: number) {
  return String(n).padStart(2, '0')
}
function keyDaysAgo(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
// 28 daily weigh-ins ending today, drifting `kgPerDay` off `startKg`, with noise.
function weighSeries(startKg: number, kgPerDay: number): { date: string; weightKg: number }[] {
  const out = []
  for (let i = 27; i >= 0; i--) {
    const idx = 27 - i
    out.push({ date: keyDaysAgo(i), weightKg: startKg + kgPerDay * idx + 0.9 * Math.sin(idx * 1.7) })
  }
  return out
}
function kcalSeries(v: number): { dayKey: string; kcal: number }[] {
  const out = []
  for (let i = 27; i >= 0; i--) out.push({ dayKey: keyDaysAgo(i), kcal: v })
  return out
}

const band = goalBandFor('CUT')

type State = 'track' | 'fast' | 'slow' | 'calib' | 'grace' | 'gate' | 'off'

const STATES: { key: State; label: string }[] = [
  { key: 'track', label: 'On track' },
  { key: 'fast', label: 'Climbing quick' },
  { key: 'slow', label: 'Stalled' },
  { key: 'calib', label: 'Calibrating' },
  { key: 'grace', label: 'Grace taken' },
  { key: 'gate', label: 'Numbers-off gate' },
  { key: 'off', label: 'Turned off' },
]

function mock(state: State): {
  checkin: Checkin | null
  decision: 'pending' | 'accepted' | 'dismissed' | 'grace'
  adaptiveEnabled: boolean
  feelFirst: boolean
  weighIns: { date: string; weightKg: number }[]
  dailyKcal: { dayKey: string; kcal: number }[]
} {
  const base = (s: Checkin['status'], rate: number, delta: number | null, extra: Partial<Checkin> = {}): Checkin => ({
    status: s,
    trendRateKgPerWeek: rate,
    maintenanceKcal: 2720,
    avgKcal: 2200,
    suggestedKcal: delta != null ? 2720 + delta : null,
    deltaKcal: delta,
    logScaleGap: null,
    reason: '',
    ...extra,
  })
  switch (state) {
    case 'track':
      return { checkin: base('on_track', -0.32, 0), decision: 'pending', adaptiveEnabled: true, feelFirst: false, weighIns: weighSeries(82, -0.045), dailyKcal: kcalSeries(2200) }
    case 'fast':
      return { checkin: base('too_fast', -0.62, 130, { reason: 'Down a bit past your lane. The scale and your log agree, so this is a confident little nudge.' }), decision: 'pending', adaptiveEnabled: true, feelFirst: false, weighIns: weighSeries(82, -0.09), dailyKcal: kcalSeries(2000) }
    case 'slow':
      return { checkin: base('too_slow', -0.03, -150, { reason: "Nearly flat this week, just shy of your goal lane. Your log reads a little light next to the scale, which is completely normal, so I'm trusting the scale here." }), decision: 'pending', adaptiveEnabled: true, feelFirst: false, weighIns: weighSeries(82, -0.004), dailyKcal: kcalSeries(2300) }
    case 'calib':
      return { checkin: base('calibrating', -0.2, null, { maintenanceKcal: null, avgKcal: null, daysUntilFirstRead: 6 }), decision: 'pending', adaptiveEnabled: true, feelFirst: false, weighIns: weighSeries(82, -0.03).slice(-7), dailyKcal: kcalSeries(2200).slice(-7) }
    case 'grace':
      return { checkin: base('on_track', -0.3, 0), decision: 'grace', adaptiveEnabled: true, feelFirst: false, weighIns: weighSeries(82, -0.04), dailyKcal: kcalSeries(2200) }
    case 'gate':
      return { checkin: base('on_track', -0.3, 0), decision: 'pending', adaptiveEnabled: false, feelFirst: true, weighIns: weighSeries(82, -0.04), dailyKcal: kcalSeries(2200) }
    case 'off':
      return { checkin: base('on_track', -0.3, 0), decision: 'pending', adaptiveEnabled: false, feelFirst: false, weighIns: weighSeries(82, -0.04), dailyKcal: kcalSeries(2200) }
  }
}

// mock weigh-ins -> the WeightEntry[] (newest first) the live page passes in
function toWeightEntries(weighIns: { date: string; weightKg: number }[]): WeightEntry[] {
  return weighIns
    .slice()
    .reverse()
    .map((w) => ({ dayKey: w.date, kg: w.weightKg, loggedAt: `${w.date}T08:00:00` }))
}

export default function MaintenanceLab() {
  const [state, setState] = useState<State>('fast')
  const m = mock(state)

  return (
    <div style={{ minHeight: '100vh', background: '#000', padding: '40px 20px 120px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,.34)', marginBottom: 18 }}>
          Maintenance tile · live component · all states
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
          {STATES.map((s) => (
            <button
              key={s.key}
              onClick={() => setState(s.key)}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase',
                padding: '8px 13px', borderRadius: 999, cursor: 'pointer',
                border: '1px solid ' + (state === s.key ? '#6EE7B7' : 'rgba(255,255,255,.16)'),
                background: state === s.key ? '#6EE7B7' : 'transparent',
                color: state === s.key ? '#05140d' : 'rgba(255,255,255,.7)',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <WeightLogger key={`wl-${state}`} initialWeights={toWeightEntries(m.weighIns)} units="imperial" />
          <MaintenanceSection
            key={state}
            hideEyebrow
            initialCheckin={m.checkin}
            band={band}
            adaptiveEnabled={m.adaptiveEnabled}
            weekStart={keyDaysAgo(0)}
            decision={m.decision}
            units="imperial"
            feelFirst={m.feelFirst}
            weighIns={m.weighIns}
            dailyKcal={m.dailyKcal}
            cycleEnabled
            trainingKcal={3000}
            restKcal={2300}
            startingMaintenanceKcal={2720}
          />
        </div>
      </div>
    </div>
  )
}

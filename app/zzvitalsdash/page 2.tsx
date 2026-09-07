'use client'
// TEMP local verification of the advice engine rendered in the real dashboard. Not committed.
import VitalsDashboard, { type WearableRow } from '@/app/app/vitals/VitalsDashboard'
import type { VitalsPreferences } from '@/lib/preferences'

const D = ['2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07', '2026-06-08']
const row = (date: string, recovery: number, o: Partial<WearableRow> = {}): WearableRow => ({
  date, recovery, hrv: 62, rhr: 54, sleep_perf: 88, sleep_hours: 7.4, strain: 11, raw: {}, ...o,
})
const quiz = (o: Partial<VitalsPreferences>): VitalsPreferences => ({
  v: 1, sleepConsistency: 'steady', caffeineCutoff: 'morning', biggestLimiter: 'sleep',
  healthFlags: [], completed_at: '2026-06-08T00:00:00Z', ...o,
})

// scenario A: moderate, sleep focus, poor sleep, late caffeine, below week avg
const weekA = [row(D[0], 70), row(D[1], 66), row(D[2], 60), row(D[3], 64), row(D[4], 58), row(D[5], 55), row(D[6], 48, { sleep_perf: 73, sleep_hours: 6.1 })]
// scenario B: three low days, cycle flagged
const weekB = [row(D[0], 60), row(D[1], 55), row(D[2], 40), row(D[3], 31), row(D[4], 28), row(D[5], 25), row(D[6], 22)]

export default function Page() {
  return (
    <div>
      <VitalsDashboard latest={weekB[6]} week={[...weekB].reverse()} quiz={quiz({ biggestLimiter: 'stress', healthFlags: ['cycle'] })} />
      <VitalsDashboard latest={weekA[6]} week={[...weekA].reverse()} quiz={quiz({ biggestLimiter: 'sleep', caffeineCutoff: 'late' })} />
    </div>
  )
}

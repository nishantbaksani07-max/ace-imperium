export const DAY_START = 6
export const DAY_END = 23

export const BASE_CURVE = [
  18, 12, 10, 8, 10, 16,
  28, 42, 58, 74, 88, 80,
  68, 56, 60, 76, 90, 84,
  64, 48, 38, 28, 22, 18,
]

export function shapeCurve(base: number[], peakedness: number): number[] {
  const mean = base.reduce((a, b) => a + b, 0) / base.length
  const k = (peakedness - 0.5) * 2
  return base.map(v => {
    const delta = v - mean
    const out = mean + delta * (1 + k * 0.7)
    return Math.max(2, Math.min(100, out))
  })
}

export function sampleCurve(curve: number[], hour: number): number {
  const i = Math.max(0, Math.min(curve.length - 1, hour))
  const lo = Math.floor(i)
  const hi = Math.min(curve.length - 1, lo + 1)
  const t = i - lo
  return curve[lo] * (1 - t) + curve[hi] * t
}

export function curvePath(values: number[], x0: number, x1: number, yTop: number, yBot: number, area = false): string {
  const n = values.length
  const xs = values.map((_, i) => x0 + (i / (n - 1)) * (x1 - x0))
  const ys = values.map(v => yBot - (v / 100) * (yBot - yTop))
  let d = `M ${xs[0].toFixed(2)} ${ys[0].toFixed(2)}`
  for (let i = 0; i < n - 1; i++) {
    const x0p = xs[Math.max(0, i - 1)]
    const y0p = ys[Math.max(0, i - 1)]
    const x1p = xs[i]
    const y1p = ys[i]
    const x2p = xs[i + 1]
    const y2p = ys[i + 1]
    const x3p = xs[Math.min(n - 1, i + 2)]
    const y3p = ys[Math.min(n - 1, i + 2)]
    const c1x = x1p + (x2p - x0p) / 6
    const c1y = y1p + (y2p - y0p) / 6
    const c2x = x2p - (x3p - x1p) / 6
    const c2y = y2p - (y3p - y1p) / 6
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${x2p.toFixed(2)} ${y2p.toFixed(2)}`
  }
  if (area) d += ` L ${xs[n - 1].toFixed(2)} ${yBot} L ${xs[0].toFixed(2)} ${yBot} Z`
  return d
}

export function findPeakHour(curve: number[]): number {
  let best = DAY_START
  let bestV = -1
  for (let h = DAY_START; h <= DAY_END; h += 0.25) {
    const v = sampleCurve(curve, h)
    if (v > bestV) { bestV = v; best = h }
  }
  return best
}

export function fmtHour(h: number): string {
  const hr = Math.floor(h)
  const min = Math.round((h - hr) * 60)
  const ap = hr >= 12 ? 'PM' : 'AM'
  const h12 = ((hr + 11) % 12) + 1
  return min === 0 ? `${h12} ${ap}` : `${h12}:${String(min).padStart(2, '0')} ${ap}`
}

export function fmtHourCompact(h: number): string {
  const hr = Math.floor(h)
  const min = Math.round((h - hr) * 60)
  const h12 = ((hr + 11) % 12) + 1
  return min === 0 ? `${h12}` : `${h12}:${String(min).padStart(2, '0')}`
}

export function formatDur(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h % 1 === 0) return `${h}h`
  const hours = Math.floor(h)
  const mins = Math.round((h - hours) * 60)
  return mins ? `${hours}h${mins}` : `${hours}h`
}

export function hexToRgb(hex: string): string {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16)
  const g = parseInt(m.slice(2, 4), 16)
  const b = parseInt(m.slice(4, 6), 16)
  return `${r},${g},${b}`
}

export type RecoveryLevel = 'high' | 'mid' | 'low'
export type RecoveryTone = 'green' | 'neutral' | 'amber'

export const RECOVERY: Record<RecoveryLevel, { tone: RecoveryTone; recovery: number; sleepHours: number }> = {
  high: { tone: 'green',   recovery: 92, sleepHours: 7.8 },
  mid:  { tone: 'neutral', recovery: 64, sleepHours: 6.8 },
  low:  { tone: 'amber',   recovery: 41, sleepHours: 5.67 },
}

export function accentFor(tone: RecoveryTone): string {
  return tone === 'amber' ? '#E89548' : tone === 'neutral' ? '#A7B7C2' : '#5BEAA8'
}

export function scoreLabel(score: number): string {
  if (score >= 80) return 'peak'
  if (score >= 65) return 'sharp'
  if (score >= 50) return 'solid'
  if (score >= 35) return 'soft'
  if (score >= 20) return 'low'
  return 'drained'
}

export function deriveSleepTargets({ wakeTime, sleepNeedHours, sleepDebtHours }: {
  wakeTime: number; sleepNeedHours: number; sleepDebtHours: number
}): { idealBedtime: number; repayBedtime: number; windDown: number } {
  const idealBedtime = ((wakeTime - sleepNeedHours) + 24) % 24
  const repayBedtime = ((wakeTime - sleepNeedHours - sleepDebtHours) + 24) % 24
  const windDown = (idealBedtime - 1 + 24) % 24
  return { idealBedtime, repayBedtime, windDown }
}

export function isInRedZone(startHour: number, endHour: number, windDown: number, wakeTime: number): boolean {
  const inZone = (h: number) => {
    if (windDown < wakeTime) return h >= windDown && h < wakeTime
    return h >= windDown || h < wakeTime
  }
  const steps = Math.max(2, Math.ceil((endHour - startHour) / 0.25))
  for (let i = 0; i <= steps; i++) {
    const h = startHour + (i / steps) * (endHour - startHour)
    if (inZone(h % 24)) return true
  }
  return false
}

export function formatHrs(h: number): string {
  const hours = Math.floor(h)
  const min = Math.round((h - hours) * 60)
  if (h < 1) return `${Math.round(h * 60)}m`
  return min ? `${hours}h ${String(min).padStart(2, '0')}m` : `${hours}h`
}

export type EventTypeKey = 'school' | 'gym' | 'work' | 'practice' | 'default'

export const EVENT_TYPES: Record<EventTypeKey, { glyph: string; tone: string }> = {
  school:   { glyph: '✦', tone: '#c98563' },
  gym:      { glyph: '◇', tone: '#5BEAA8' },
  work:     { glyph: '◼', tone: '#8a9aa7' },
  practice: { glyph: '◐', tone: '#b388ff' },
  default:  { glyph: '·', tone: '#8a9aa7' },
}

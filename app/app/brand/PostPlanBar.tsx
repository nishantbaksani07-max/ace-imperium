'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './brand.module.css'
import type { Brand, BrandAccount, CadencePeriod, Schedule } from './types'
import type { BrandActions } from './state'
import { ARCHETYPE_ACCENTS } from './archetypes'
import {
  deadlineUrgency,
  formatCountdown,
  nextDeadline,
  periodFraction,
  urgencyColor,
  urgencyDeepColor,
  useNow,
} from './deadlines'

/**
 * Post-plan header that sits on top of the social graph. Shows the brand's next
 * posting deadline as a ring that fills as the date nears, an inline-editable
 * cadence (auto-set to weekly for YouTube), and a data-driven recommendation of
 * what the next video should be (from the saved Claude-Chrome reads).
 *
 * The cadence reuses the brand's existing weekly Schedule (or the first one), so
 * it stays in lock-step with the "When to post" panel — editing here edits there.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const REC_KEY = 'next_video'

function minutesToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
function timeToMinutes(v: string): number {
  const [h, m] = v.split(':').map((n) => parseInt(n, 10))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 1080
  return Math.max(0, Math.min(1439, h * 60 + m))
}

/** Big countdown ring — empty just after a deadline, full as the next one nears. */
function CountdownRing({ schedule, accentRgb }: { schedule: Schedule; accentRgb: string }) {
  const now = useNow(1000)
  const deadline = nextDeadline(schedule, now)
  const remaining = deadline ? deadline.getTime() - now.getTime() : null
  if (remaining === null) return null

  const overdue = remaining <= 0
  const urgency = deadlineUrgency(remaining, schedule.period)
  const fraction = overdue ? 1 : periodFraction(remaining, schedule.period)
  const colorRgb = urgencyColor(accentRgb, urgency)
  const fillRgb = urgencyDeepColor(accentRgb, urgency)

  const R = 26
  const C = 2 * Math.PI * R
  const dash = C * Math.max(0, Math.min(1, fraction))

  return (
    <div className={styles.postRing} title="Time until your next posting deadline">
      <svg width="68" height="68" viewBox="0 0 68 68" aria-hidden>
        <circle cx="34" cy="34" r={R} fill="none" stroke={`rgba(${colorRgb}, 0.18)`} strokeWidth="4" />
        <circle
          cx="34" cy="34" r={R}
          fill="none"
          stroke={`rgb(${fillRgb})`}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${C}`}
          transform="rotate(-90 34 34)"
          style={{ transition: 'stroke-dasharray 700ms var(--ease-premium), stroke 700ms linear' }}
        />
      </svg>
      <div className={styles.postRingText} style={{ color: `rgb(${colorRgb})` }}>
        <span className={styles.postRingNum}>{overdue ? 'now' : formatCountdown(remaining)}</span>
        <span className={styles.postRingLabel}>{overdue ? 'post due' : 'to post'}</span>
      </div>
    </div>
  )
}

export default function PostPlanBar({
  brand, actions, focusAccount,
}: {
  brand: Brand
  actions: BrandActions
  focusAccount: BrandAccount
}) {
  const accentRgb = ARCHETYPE_ACCENTS[brand.archetype].rgb
  const isYouTube = focusAccount.platform === 'youtube' || focusAccount.platform === 'youtube_long'

  // Auto-set a weekly "1 video / week" schedule for YouTube the first time, with
  // a default Sunday 18:00 deadline so the ring has something to count toward.
  const seeded = useRef<string | null>(null)
  useEffect(() => {
    if (!isYouTube || seeded.current === brand.id) return
    seeded.current = brand.id
    const hasWeekly = brand.schedules.some((s) => s.period === 'weekly')
    if (!hasWeekly) {
      actions.addSchedule(brand.id, {
        period: 'weekly', unit: 'videos', target: 1, label: 'Weekly video',
        platform: focusAccount.platform, deadline: { minutes: 1080, weekday: 0 },
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand.id, isYouTube])

  const schedule = brand.schedules.find((s) => s.period === 'weekly') ?? brand.schedules[0]

  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const rec = brand.packReads?.[REC_KEY]?.text?.trim() || ''

  if (!schedule) return null

  const u = (patch: Partial<Omit<Schedule, 'id'>>) => actions.updateSchedule(brand.id, schedule.id, patch)
  const hasDeadline = !!schedule.deadline

  async function recommend() {
    if (loading) return
    setLoading(true)
    setErr(null)
    try {
      const notes: Record<string, string> = {}
      for (const k of ['whatsworking', 'niche', 'audience_feed', 'times_feed', 'posting_times', 'topflop']) {
        const t = brand.packReads?.[k]?.text
        if (t && t.trim()) notes[k] = t
      }
      const res = await fetch('/api/brand/next-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: {
            name: brand.name, archetype: brand.archetype, blurb: brand.blurb,
            platform: focusAccount.platform, handle: focusAccount.handle,
            cadence: `${schedule.target} ${schedule.unit} / ${schedule.period === 'weekly' ? 'week' : 'day'}`,
            notes,
          },
        }),
      })
      if (res.status === 402) { setErr('Recommendation is a Pro feature.'); return }
      const data = await res.json().catch(() => ({})) as { recommendation?: string; error?: string }
      if (!res.ok || !data.recommendation) throw new Error(data.error || `request failed (${res.status})`)
      actions.setPackRead(brand.id, REC_KEY, data.recommendation)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not get a recommendation.')
    } finally {
      setLoading(false)
    }
  }

  const cadenceLabel = `${schedule.target} ${schedule.unit} / ${schedule.period === 'weekly' ? 'wk' : 'day'}`
  const whenLabel = schedule.deadline
    ? `${schedule.period === 'weekly' ? `${WEEKDAYS[schedule.deadline.weekday ?? 0]} ` : ''}${minutesToTime(schedule.deadline.minutes)}`
    : 'no deadline set'

  return (
    <div className={styles.postPlan}>
      <div className={styles.postPlanMain}>
        <div className={styles.postPlanInfo}>
          <span className={styles.postPlanEyebrow}>Next post</span>
          <div className={styles.postPlanCadence}>{cadenceLabel}</div>
          <button type="button" className={styles.postPlanWhen} onClick={() => setEditing((v) => !v)}>
            {whenLabel} <span className={styles.postPlanEdit}>· edit</span>
          </button>
        </div>
        <CountdownRing schedule={schedule} accentRgb={accentRgb} />
      </div>

      {editing && (
        <div className={styles.postPlanEditor}>
          <label className={styles.postPlanField}>
            <span>Every</span>
            <select
              value={schedule.period}
              onChange={(e) => {
                const period = e.target.value as CadencePeriod
                const patch: Partial<Omit<Schedule, 'id'>> = { period }
                if (period === 'weekly' && schedule.deadline && schedule.deadline.weekday === undefined) {
                  patch.deadline = { ...schedule.deadline, weekday: 0 }
                }
                u(patch)
              }}
            >
              <option value="weekly">week</option>
              <option value="daily">day</option>
            </select>
          </label>
          <label className={styles.postPlanField}>
            <span>Posts</span>
            <input type="number" min={1} max={99} value={schedule.target} onChange={(e) => u({ target: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
          </label>
          <label className={styles.postPlanField}>
            <input
              type="checkbox"
              checked={hasDeadline}
              onChange={(e) => u({ deadline: e.target.checked ? { minutes: 1080, ...(schedule.period === 'weekly' ? { weekday: 0 } : {}) } : undefined })}
            />
            <span>Deadline</span>
          </label>
          {hasDeadline && schedule.deadline && (
            <>
              {schedule.period === 'weekly' && (
                <select value={schedule.deadline.weekday ?? 0} onChange={(e) => u({ deadline: { ...schedule.deadline!, weekday: parseInt(e.target.value, 10) } })} aria-label="Day">
                  {WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}</option>)}
                </select>
              )}
              <input type="time" value={minutesToTime(schedule.deadline.minutes)} onChange={(e) => u({ deadline: { ...schedule.deadline!, minutes: timeToMinutes(e.target.value) } })} aria-label="Time" />
            </>
          )}
        </div>
      )}

      <div className={styles.postPlanRec}>
        <div className={styles.postPlanRecHead}>
          <span className={styles.postPlanEyebrow}>✦ Recommended next video</span>
          <button type="button" className={styles.postPlanRecBtn} onClick={recommend} disabled={loading}>
            {loading ? 'Thinking…' : rec ? 'Refresh' : 'Recommend from my data'}
          </button>
        </div>
        {err && <p className={styles.postPlanErr}>{err}</p>}
        {rec
          ? <pre className={styles.postPlanRecText}>{rec}</pre>
          : <p className={styles.postPlanRecHint}>Pull your data with the buttons above, then get a concrete next-video idea — title, hook, format, and the best time to post.</p>}
      </div>
    </div>
  )
}

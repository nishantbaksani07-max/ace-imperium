'use client'

/**
 * "Also today" (BUILD69) — commitments that live in other modules but belong on
 * your day: brand posting deadlines (from the Brand schedules) and your workout.
 * Read-only here; each row links back to its source. This answers "if I have a
 * post or a workout scheduled, show it on Peak too" without duplicating the data
 * — Brand stays the source of truth for posts, the logger for training.
 */

import Link from 'next/link'
import styles from './peak.module.css'
import type { PostingDeadline } from './usePostingDeadlines'

const PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  youtube_long: 'YouTube',
  x: 'X',
  twitter: 'X',
}

function fmtMinute(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function fmtHour(h: number): string {
  const r = Math.round(h)
  if (r === 0 || r === 24) return '12 AM'
  if (r === 12) return '12 PM'
  return r < 12 ? `${r} AM` : `${r - 12} PM`
}

/** Live "in 2h 10m" / "in 40m" / "now" / "passed" against the wall clock. */
function countdown(min: number): { text: string; tone: 'calm' | 'soon' | 'past' } {
  const now = new Date()
  const diff = min - (now.getHours() * 60 + now.getMinutes())
  if (diff <= -1) return { text: 'passed', tone: 'past' }
  if (diff < 1) return { text: 'now', tone: 'soon' }
  if (diff < 60) return { text: `in ${diff}m`, tone: diff <= 30 ? 'soon' : 'calm' }
  const h = Math.floor(diff / 60)
  const m = diff % 60
  return { text: `in ${h}h${m ? ` ${m}m` : ''}`, tone: 'calm' }
}

interface Props {
  deadlines: PostingDeadline[]
  trainedToday: boolean
  workoutSets: number
  bestHour: number
}

export default function DayCommitments({ deadlines, trainedToday, workoutSets, bestHour }: Props) {
  return (
    <div className={styles.pkCommits}>
      <div className={styles.pkCommitsHead}>Also today</div>

      {/* Workout — from the logger / training split */}
      <Link href="/app/fitness/log" className={styles.pkCommitRow}>
        <span className={styles.pkCommitDot} data-kind="train" />
        <span className={styles.pkCommitMain}>
          <span className={styles.pkCommitLbl}>
            {trainedToday ? 'Trained' : 'Workout'}
            <span className={styles.pkCommitSrc}>Train</span>
          </span>
          <span className={styles.pkCommitSub}>
            {trainedToday
              ? `${workoutSets} working set${workoutSets === 1 ? '' : 's'} logged`
              : `Best window today around ${fmtHour(bestHour)}`}
          </span>
        </span>
        <span className={styles.pkCommitMeta}>{trainedToday ? '✓ done' : 'open →'}</span>
      </Link>

      {/* Brand posting deadlines */}
      {deadlines.map(d => {
        const c = countdown(d.minutes)
        return (
          <Link key={d.id} href="/app/brand" className={styles.pkCommitRow}>
            <span className={styles.pkCommitDot} data-kind="post" />
            <span className={styles.pkCommitMain}>
              <span className={styles.pkCommitLbl}>
                {d.label}
                <span className={styles.pkCommitSrc}>
                  {d.platform && PLATFORM_LABEL[d.platform] ? PLATFORM_LABEL[d.platform] : d.brand}
                </span>
              </span>
              <span className={styles.pkCommitSub}>Post by {fmtMinute(d.minutes)}</span>
            </span>
            <span className={styles.pkCommitMeta} data-tone={c.tone}>{c.text}</span>
          </Link>
        )
      })}

      {deadlines.length === 0 && (
        <div className={styles.pkCommitEmpty}>
          No posting deadlines today. Set one in <Link href="/app/brand" className={styles.pkCommitInline}>Brand</Link> to see it here.
        </div>
      )}
    </div>
  )
}

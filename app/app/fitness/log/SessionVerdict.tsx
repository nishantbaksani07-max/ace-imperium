'use client'

/**
 * SessionVerdict — the progress read on the finish screen. Renders the output
 * of computeSessionVerdict (lib/workouts/sessionVerdict.ts): a tiered headline,
 * a delta, a per-lift pip meter, the warm one-line story, and a tap-to-open
 * breakdown. Pure presentation; all judgement lives in the (tested) engine.
 */

import { useState } from 'react'
import styles from './sessionVerdict.module.css'
import { kgToDisplay, unitLabel, type Units } from '@/lib/units'
import {
  verdictHeadline,
  verdictStory,
  type SessionVerdict,
  type LiftVerdict,
} from '@/lib/workouts/sessionVerdict'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-06-19" → "Jun 19". String-parsed so it never UTC-drifts. */
function shortDate(iso: string): string {
  const parts = iso.split('-').map(Number)
  const month = parts[1] ?? 1
  const day = parts[2] ?? 1
  return `${MONTHS[month - 1]} ${day}`
}

const TIER_STATE: Record<SessionVerdict['tier'], 'up' | 'held' | 'down'> = {
  stronger: 'up',
  held: 'held',
  lighter: 'down',
  fresh: 'held',
}

const ARROW: Record<'up' | 'held' | 'down', string> = {
  up: 'M5 12l7-7 7 7M12 5v14',
  held: 'M5 12h14',
  down: 'M19 12l-7 7-7-7M12 5v14',
}

const PIP_CLASS: Record<LiftVerdict, string> = {
  best: styles.pipUp,
  up: styles.pipUp,
  held: styles.pipHeld,
  down: styles.pipDown,
  new: styles.pipNew,
}

const CHIP: Record<LiftVerdict, { cls: string; label: string }> = {
  best: { cls: styles.chipBest, label: '★ new best' },
  up: { cls: styles.chipUp, label: 'stronger' },
  held: { cls: styles.chipHeld, label: 'held' },
  down: { cls: styles.chipDown, label: 'lighter' },
  new: { cls: styles.chipNew, label: 'new lift' },
}

function setLabel(weightKg: number, reps: number, units: Units): string {
  return `${kgToDisplay(weightKg, units)}${unitLabel(units)} × ${reps}`
}

export default function SessionVerdictCard({
  verdict,
  dayName,
  lastDate,
  units,
}: {
  verdict: SessionVerdict
  dayName: string
  /** YYYY-MM-DD of the session we compared against, or null when fresh. */
  lastDate: string | null
  units: Units
}) {
  const [open, setOpen] = useState(false)
  const state = TIER_STATE[verdict.tier]

  const delta = verdict.volumeDeltaPct
  const deltaLabel =
    delta === null ? null : delta > 0 ? `+${delta}%` : delta < 0 ? `${delta}%` : 'even'

  // Count line — only the non-zero buckets, most-important first.
  const parts: string[] = []
  if (verdict.strongerCount) parts.push(`${verdict.strongerCount} stronger`)
  if (verdict.heldCount) parts.push(`${verdict.heldCount} held`)
  if (verdict.lighterCount) parts.push(`${verdict.lighterCount} lighter`)
  if (verdict.newCount) parts.push(`${verdict.newCount} new`)

  const headLabel =
    lastDate && verdict.tier !== 'fresh'
      ? `today vs last ${dayName} · ${shortDate(lastDate)}`
      : `your first ${dayName}`

  return (
    <section className={`${styles.card} ${open ? styles.cardOpen : ''}`} data-state={state}>
      <div className={styles.top}>
        <span className={styles.meta}>{headLabel}</span>
        <span className={styles.saved}>saved</span>
      </div>

      <div className={styles.main}>
        <span className={styles.arrow}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={ARROW[state]} />
          </svg>
        </span>
        <span className={styles.word}>{verdictHeadline(verdict.tier)}</span>
        {deltaLabel && <span className={styles.delta}>{deltaLabel}</span>}
      </div>

      <div className={styles.meter}>
        <span className={styles.pips}>
          {verdict.lifts.map((l, i) => (
            <span key={i} className={`${styles.pip} ${PIP_CLASS[l.verdict]}`} />
          ))}
        </span>
        {parts.length > 0 && (
          <span className={styles.count}>
            <b>{parts[0]}</b>
            {parts.length > 1 ? ` · ${parts.slice(1).join(' · ')}` : ''}
          </span>
        )}
      </div>

      <p className={styles.story}>{verdictStory(verdict, dayName)}</p>

      {verdict.lifts.length > 0 && (
        <>
          <button
            type="button"
            className={styles.more}
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
          >
            {open ? 'hide the breakdown' : 'see the breakdown'}
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <div className={styles.rows}>
            <div className={styles.rowsIn}>
              {verdict.lifts.map((l, i) => (
                <div key={i} className={styles.row}>
                  <div>
                    <div className={styles.nm}>{l.name}</div>
                    <div className={styles.nums}>
                      <span className={styles.now}>{setLabel(l.topWeight, l.topReps, units)}</span>
                      {l.lastTopWeight !== null
                        ? ` · was ${setLabel(l.lastTopWeight, l.lastTopReps ?? 0, units)}`
                        : ' · first time'}
                    </div>
                  </div>
                  <span className={`${styles.chip} ${CHIP[l.verdict].cls}`}>{CHIP[l.verdict].label}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

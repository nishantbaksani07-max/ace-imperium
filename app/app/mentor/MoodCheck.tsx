'use client'

import { useState, type ReactNode } from 'react'
import styles from './mentor.module.css'
import { MOOD_LEVELS, localDateKey, type MoodPoint } from './moodData'
import { saveMood } from './actions'

// Line-art faces, low to high. No emoji.
const FACES: Record<number, ReactNode> = {
  1: <><circle cx={12} cy={12} r={9} /><path d="M8 16c1-2 7-2 8 0" /><path d="M8.5 10h.01M15.5 10h.01" /></>,
  2: <><circle cx={12} cy={12} r={9} /><path d="M8.5 15c1-1 6-1 7 0" /><path d="M8.5 10h.01M15.5 10h.01" /></>,
  3: <><circle cx={12} cy={12} r={9} /><path d="M8.5 14.5h7" /><path d="M8.5 10h.01M15.5 10h.01" /></>,
  4: <><circle cx={12} cy={12} r={9} /><path d="M8.5 14c1 1.6 6 1.6 7 0" /><path d="M8.5 10h.01M15.5 10h.01" /></>,
  5: <><circle cx={12} cy={12} r={9} /><path d="M8 13.5c1.2 2.4 6.8 2.4 8 0" /><path d="M8.5 10h.01M15.5 10h.01" /></>,
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function dayLabel(dayKey: string, isToday: boolean): string {
  if (isToday) return 'Today'
  const d = new Date(`${dayKey}T12:00:00`)
  return DOW[d.getDay()] ?? ''
}

export default function MoodCheck({ history }: { history: MoodPoint[] }) {
  const todayScore = history.length ? history[history.length - 1].score : null
  const [selected, setSelected] = useState<number | null>(todayScore)
  const [strip, setStrip] = useState<MoodPoint[]>(history)

  function pick(score: number) {
    setSelected(score)
    setStrip(prev => prev.map((p, i) => (i === prev.length - 1 ? { ...p, score } : p)))
    // fire and forget; UI is optimistic, this is a low-stakes daily tap. The
    // client day + tz offset keep "today" the USER'S day, not the UTC server's.
    saveMood(score, { dayKey: localDateKey(), tzOffsetMin: new Date().getTimezoneOffset() })
  }

  return (
    <section className={styles.contextSec} aria-label="mood check-in">
      <div className={styles.secHead}>
        <span className={styles.secEyebrow}>mood</span>
        <span className={styles.secTitle}>A quick read</span>
        <span className={styles.secRule} aria-hidden />
      </div>

      <div className={styles.moodCard}>
        <p className={styles.moodQ}>How are you, really?</p>
        <p className={styles.moodSub}>One tap. No typing. So Vee can see how you feel over time.</p>

        <div className={styles.moodPick}>
          {MOOD_LEVELS.map(lvl => (
            <button
              key={lvl.score}
              type="button"
              className={`${styles.moodOpt} ${styles[`m${lvl.score}`]} ${selected === lvl.score ? styles.on : ''}`}
              onClick={() => pick(lvl.score)}
              aria-pressed={selected === lvl.score}
            >
              <svg viewBox="0 0 24 24">{FACES[lvl.score]}</svg>
              <span>{lvl.label}</span>
            </button>
          ))}
        </div>

        <div className={styles.strip} aria-hidden>
          {strip.map((p, i) => {
            const isToday = i === strip.length - 1
            return (
              <div
                key={p.dayKey}
                className={`${styles.bar} ${isToday ? styles.barToday : ''} ${p.score ? styles[`m${p.score}`] : ''}`}
                style={{ height: p.score ? `${26 + p.score * 14}%` : '14%' }}
              />
            )
          })}
        </div>
        <div className={styles.stripLbls}>
          {strip.map((p, i) => (
            <span key={p.dayKey}>{dayLabel(p.dayKey, i === strip.length - 1)}</span>
          ))}
        </div>
      </div>
    </section>
  )
}

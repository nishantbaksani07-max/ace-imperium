'use client'

import { Fragment, useState, useEffect } from 'react'
import styles from './dashboard.module.css'
import { DEFAULT_CHROME, type Greeting, type DateConfig } from '@/lib/tiles/dashboardChrome'

interface DashboardHeaderProps {
  firstName?: string | null
  greeting?: Greeting
  date?: DateConfig
  /** App-open reveal: while false the greeting words sit still; flipping it
   *  true runs the staggered word-in (Dashboard flips it as the intro splash
   *  starts to fade). Defaults to true so other callers animate on mount. */
  revealed?: boolean
}

/** The auto greeting pool: one line is picked at random on every app-open
 *  (sessionStorage remembers the last pick so it never repeats twice in a
 *  row) and the user's real first name is appended by the existing name
 *  logic below. "Morning" only joins the pool before noon. */
const GREETINGS: { text: string; punct: string }[] = [
  { text: 'Howdy', punct: '' },
  { text: "How's it going", punct: '?' },
  { text: 'Welcome back', punct: '' },
  { text: 'Good to see you', punct: '' },
  { text: 'Morning', punct: '' },
  { text: "Let's get after it", punct: '' },
]

function pickGreeting(): { text: string; punct: string } {
  const pool = new Date().getHours() < 12 ? GREETINGS : GREETINGS.filter((g) => g.text !== 'Morning')
  let i = Math.floor(Math.random() * pool.length)
  try {
    const last = window.sessionStorage.getItem('vitality:greet-last')
    if (pool.length > 1 && pool[i].text === last) i = (i + 1) % pool.length
    window.sessionStorage.setItem('vitality:greet-last', pool[i].text)
  } catch {
    /* storage unavailable: any pick works */
  }
  return pool[i]
}

/**
 * The editorial greeting + date. Prop-driven so a user can personalise it
 * (lib/tiles/dashboardChrome): keep the randomized auto line or write their own,
 * show / accent their name, scale it, and pick the date format (or hide it). The
 * FONT stays Instrument Serif italic (the unified Vitality voice) — only wording,
 * name, accent, and scale are exposed. The line is picked client-side in an
 * effect (server renders it empty, exactly as before) so SSR never mismatches.
 */
export default function DashboardHeader({ firstName, greeting, date, revealed = true }: DashboardHeaderProps) {
  const g = greeting ?? DEFAULT_CHROME.greeting
  const d = date ?? DEFAULT_CHROME.date
  const [auto, setAuto] = useState<{ text: string; punct: string }>({ text: '', punct: '' })
  const [fullDate, setFullDate] = useState('')
  const [todayDate, setTodayDate] = useState('')

  useEffect(() => {
    setAuto(pickGreeting())
    const now = new Date()
    setFullDate(now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))
    setTodayDate(now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))
  }, [])

  // Custom wording falls back to the randomized auto line if blank (never render empty).
  const custom = g.mode === 'custom' && g.text.trim() ? g.text.trim() : null
  const word = custom ?? auto.text
  const punct = custom ? '' : auto.punct
  const includesName = !!(firstName && word.toLowerCase().includes(firstName.toLowerCase()))
  const renderName = g.showName && firstName && !includesName
  const dateText = d.format === 'today' ? todayDate : fullDate

  // Each word is its own span so the reveal can stream them in with a small
  // stagger (public/vitality-intro-a.html word-in). Graceful without a name:
  // the punctuation rides on the last phrase word instead.
  const words = word ? word.split(' ') : []
  const dly = (i: number) => ({ ['--d' as string]: `${(0.05 + i * 0.09).toFixed(2)}s` })

  return (
    <div className={styles.header} style={{ ['--greet-scale' as string]: g.scale }}>
      <h1 className={`${styles.greeting}${revealed ? ` ${styles.greetReveal}` : ''}`}>
        {words.map((w, i) => (
          <Fragment key={`${w}-${i}`}>
            {i > 0 ? ' ' : null}
            <span className={styles.gw} style={dly(i)}>
              {w}
              {!renderName && i === words.length - 1 ? punct : ''}
            </span>
          </Fragment>
        ))}
        {renderName ? (
          <span className={styles.gw} style={dly(words.length)}>
            ,&nbsp;<span className={g.accentName ? styles.greetingName : undefined}>{firstName}</span>
            {punct}
          </span>
        ) : null}
      </h1>
      {d.show && <p className={styles.date}>{dateText}</p>}
    </div>
  )
}

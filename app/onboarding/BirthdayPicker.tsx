'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './birthdayPicker.module.css'

/**
 * BirthdayPicker — three minimal typed slots (month / day / year). Type the
 * numbers; it auto-advances (smart: a single-digit month like 3 jumps straight
 * on), backspace on an empty slot hops back. Faint MM / DD / YYYY placeholders
 * tell you the format, and a single centered line below builds the date in plain
 * language as you go (3 → "March" → "March 23" → "March 23, 2006") — symmetric,
 * no lone per-slot label, and it confirms what you typed. No dropdowns.
 *
 * Emits `YYYY-MM-DD` via onChange, '' until all three are valid (so validation
 * still blocks). Day is validated leap-aware against the chosen month/year.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const pad = (n: number) => String(n).padStart(2, '0')

interface Props {
  value: string
  onChange: (value: string) => void
}

function parseValue(value: string): { y: string; m: string; d: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return { y: '', m: '', d: '' }
  return { y: match[1], m: String(+match[2]), d: String(+match[3]) }
}

export function BirthdayPicker({ value, onChange }: Props) {
  const seed = parseValue(value)
  const [m, setM] = useState(seed.m)   // raw typed strings
  const [d, setD] = useState(seed.d)
  const [y, setY] = useState(seed.y)

  const mRef = useRef<HTMLInputElement>(null)
  const dRef = useRef<HTMLInputElement>(null)
  const yRef = useRef<HTMLInputElement>(null)

  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  const mi = parseInt(m, 10)
  const di = parseInt(d, 10)
  const yi = parseInt(y, 10)
  const maxDays = mi >= 1 && mi <= 12 ? new Date(yi || 2000, mi, 0).getDate() : 31
  const monthName = mi >= 1 && mi <= 12 ? MONTHS[mi - 1] : null
  const dayOk = di >= 1 && di <= maxDays
  const yearOk = y.length === 4 && yi >= 1900 && yi <= 2026

  // Plain-language confirm, built left to right and stopping at the first gap
  // so it never reads as a broken fragment ("March" → "March 23" → "March 23,
  // 2006"). Centered under the slots, so the control stays symmetric.
  let confirm = ''
  if (monthName) {
    confirm = monthName
    if (dayOk) {
      confirm += ` ${di}`
      if (yearOk) confirm += `, ${yi}`
    }
  }

  // Assemble + emit. '' until every part is valid.
  useEffect(() => {
    const valid = mi >= 1 && mi <= 12 && dayOk && yearOk
    onChangeRef.current(valid ? `${yi}-${pad(mi)}-${pad(di)}` : '')
  }, [m, d, y, mi, di, yi, dayOk, yearOk])

  const digits = (s: string, max: number) => s.replace(/\D/g, '').slice(0, max)

  return (
    <div className={styles.picker}>
      <div className={styles.slots}>
        <input
          ref={mRef}
          className={`${styles.slotInput} ${styles.mm}`}
          inputMode="numeric"
          value={m}
          placeholder="MM"
          aria-label="birth month"
          onChange={e => {
            const v = digits(e.target.value, 2)
            setM(v)
            // single-digit month 2-9 is complete → jump on; 0/1 wait for a 2nd.
            if (v.length === 2 || (v.length === 1 && +v > 1)) dRef.current?.focus()
          }}
        />
        <span className={styles.sep} aria-hidden>/</span>
        <input
          ref={dRef}
          className={`${styles.slotInput} ${styles.dd}`}
          inputMode="numeric"
          value={d}
          placeholder="DD"
          aria-label="birth day"
          onChange={e => {
            const v = digits(e.target.value, 2)
            setD(v)
            if (v.length === 2 || (v.length === 1 && +v > 3)) yRef.current?.focus()
          }}
          onKeyDown={e => { if (e.key === 'Backspace' && !d) mRef.current?.focus() }}
        />
        <span className={styles.sep} aria-hidden>/</span>
        <input
          ref={yRef}
          className={`${styles.slotInput} ${styles.yy}`}
          inputMode="numeric"
          value={y}
          placeholder="YYYY"
          aria-label="birth year"
          onChange={e => setY(digits(e.target.value, 4))}
          onKeyDown={e => { if (e.key === 'Backspace' && !y) dRef.current?.focus() }}
        />
      </div>
      <div className={`${styles.confirm} ${confirm ? styles.confirmOn : ''}`} aria-live="polite">
        {confirm || ' '}
      </div>
    </div>
  )
}

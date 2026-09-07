'use client'

import { useState } from 'react'
import styles from './peak.module.css'

/**
 * Natural-language quick-add for the day schedule. Mirrors the design's
 * terminal console: a `›` prompt, the input, and an `⏎ ADD` button. Parsing
 * happens in the parent (reusing peak-tracker's `parseInput`); this just
 * collects the raw line and hands it up on Enter / ADD.
 */
export default function QuickAddConsole({ onAdd }: { onAdd: (raw: string) => void }) {
  const [val, setVal] = useState('')

  const submit = () => {
    const v = val.trim()
    if (!v) return
    onAdd(v)
    setVal('')
  }

  return (
    <div className={styles.cAdd}>
      <div className={styles.cAddRow}>
        <span className={`${styles.cChev} ${styles.mono}`} aria-hidden>›</span>
        <input
          className={`${styles.cInput} ${styles.mono}`}
          value={val}
          spellCheck={false}
          placeholder="e.g. deep work 9-11 hard, gym 1930, read 30m, big gap email"
          aria-label="Add to today"
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        />
        <button type="button" className={styles.cAddBtn} onClick={submit}>
          <span className={styles.ret} aria-hidden>⏎</span>ADD
        </button>
      </div>
      <div className={`${styles.cAddFmt} ${styles.mono}`}>
        <span className={styles.fmtPat}>task · time · difficulty · “big gap …” fills free time</span>
      </div>
    </div>
  )
}

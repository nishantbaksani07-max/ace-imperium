'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './water.module.css'
import { SUBSTANCE_DB } from './substances'
import { fmtMl } from './state'
import type { Substance } from './types'

interface Props {
  onAdd: (sub: Substance) => 'added' | 'duplicate'
}

/**
 * Type-to-search picker for the SUBSTANCE_DB. Filters by name OR category,
 * shows up to 8 matches with dose + estimated water bump. Tapping a result
 * fires onAdd; the parent decides what to do with duplicates (state.ts
 * already returns 'duplicate' so we surface a brief inline message).
 */
export default function SubstanceSearch({ onAdd }: Props) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [warn, setWarn] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('click', handleDocClick)
    return () => document.removeEventListener('click', handleDocClick)
  }, [])

  const matches = q.trim()
    ? SUBSTANCE_DB.filter(s =>
        s.name.toLowerCase().includes(q.trim().toLowerCase()) ||
        s.cat.toLowerCase().includes(q.trim().toLowerCase()))
        .slice(0, 8)
    : []

  function handlePick(sub: Substance) {
    const res = onAdd(sub)
    if (res === 'duplicate') {
      setWarn('Already added. Edit the dose below.')
      setTimeout(() => setWarn(null), 2200)
    } else {
      setWarn(null)
    }
    setQ('')
    setOpen(false)
  }

  return (
    <div className={styles.searchWrap} ref={wrapRef}>
      <input
        type="text"
        className="input"
        placeholder="Type a name (Adderall, Concerta, Lithium…)"
        value={q}
        autoComplete="off"
        onChange={e => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />

      {open && q.trim() && (
        <div className={styles.searchResults}>
          {matches.length === 0 ? (
            <div className={styles.searchResult}>
              <span className={styles.searchResultName}>No matches</span>
              <span className={styles.searchResultMeta}>Try a different name or category</span>
            </div>
          ) : (
            matches.map(s => {
              const defaultExtra = (s.defaultDose || 0) * (s.mlPerUnit || 0)
              return (
                <button
                  type="button"
                  key={s.id}
                  className={styles.searchResult}
                  onClick={() => handlePick(s)}
                >
                  <span className={styles.searchResultName}>
                    {s.name} <span className={styles.searchResultAdd}>+</span>
                  </span>
                  <span className={styles.searchResultMeta}>
                    {s.cat} · {s.defaultDose} {s.unit} default → adds ~{fmtMl(defaultExtra)}/day{s.note ? ` · ${s.note}` : ''}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}

      {warn && <p className={styles.searchWarn}>{warn}</p>}
    </div>
  )
}

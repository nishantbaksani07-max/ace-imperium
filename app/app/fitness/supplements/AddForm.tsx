'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './supplements.module.css'
import { SUPPLEMENT_DB, WINDOWS } from './supplements'
import InfoPopover from './InfoPopover'
import type { DbSupplement, WindowKey } from './types'

interface Props {
  onAdd: (payload: {
    name: string
    icon: string
    dose: string
    window: WindowKey
    note: string
    sourceId: string | null
  }) => void
}

/**
 * The supplement add form.
 *
 * Three inputs (name / dose / window) + one button. The name field
 * doubles as the search field — typing reveals an autocomplete dropdown
 * pulled from SUPPLEMENT_DB. Each result has an inline (i) that opens
 * an InfoPopover with the "what it does / when / how" breakdown.
 * Clicking the result body pre-fills all four fields; pressing Add
 * commits the row.
 *
 * Empty queries hide the dropdown so the form looks calm by default.
 */
export default function AddForm({ onAdd }: Props) {
  const [name, setName] = useState('')
  const [dose, setDose] = useState('')
  const [windowKey, setWindowKey] = useState<WindowKey>('anytime')
  // Note + icon ride along when the user picks a DB result; manual entries
  // start with no note and the default 💊 icon.
  const [note, setNote] = useState('')
  const [icon, setIcon] = useState('💊')
  const [sourceId, setSourceId] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [focusIdx, setFocusIdx] = useState(-1)
  // Pinned info popover — opened when the user clicks (i) on a result.
  // Stays open across blur so they can read it without the dropdown
  // collapsing on them; closes when they pick a row or click the X.
  const [infoFor, setInfoFor] = useState<DbSupplement | null>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const matches = search(name)

  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (!wrapRef.current) return
      if (wrapRef.current.contains(e.target as Node)) return
      setOpen(false)
      setInfoFor(null)
    }
    document.addEventListener('mousedown', handleDown)
    return () => document.removeEventListener('mousedown', handleDown)
  }, [])

  function pickResult(s: DbSupplement) {
    setName(s.name)
    setDose(s.dose)
    setWindowKey(s.window)
    setNote(s.note)
    setIcon(s.icon)
    setSourceId(s.id)
    setOpen(false)
    setInfoFor(null)
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd({
      name: trimmed,
      icon: icon || '💊',
      dose: dose.trim(),
      window: windowKey,
      note: note.trim(),
      sourceId,
    })
    setName('')
    setDose('')
    setWindowKey('anytime')
    setNote('')
    setIcon('💊')
    setSourceId(null)
    setOpen(false)
    setInfoFor(null)
    nameInputRef.current?.focus()
  }

  function handleNameKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && matches.length) {
      e.preventDefault()
      setOpen(true)
      setFocusIdx(i => Math.min(i + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp' && matches.length) {
      e.preventDefault()
      setFocusIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && focusIdx >= 0 && matches[focusIdx]) {
        e.preventDefault()
        pickResult(matches[focusIdx])
      } else {
        // Submit by Enter from the name field if dropdown isn't picking
        handleSubmit()
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setInfoFor(null)
    }
  }

  return (
    <section className={styles.addCard}>
      <span className={styles.heroEyebrow}>
        <span className={styles.heroEyebrowMark}>·02</span>
        <span className={styles.heroEyebrowRule} />
        Add to stack
      </span>

      <form className={styles.addForm} onSubmit={handleSubmit}>
        <div className={styles.addNameWrap} ref={wrapRef}>
          <label className={styles.addLabel} htmlFor="supplement-search-input">
            Search
          </label>
          <input
            id="supplement-search-input"
            ref={nameInputRef}
            type="text"
            className={`${styles.addInput} ${styles.addSearchInput}`}
            placeholder="Type a name: Creatine, Vitamin D, magnesium…"
            value={name}
            spellCheck={false}
            autoComplete="off"
            onChange={e => {
              setName(e.target.value)
              setOpen(true)
              setFocusIdx(-1)
              // User edited the field manually → drop the DB binding so
              // the row gets saved as a custom entry, not bearing a stale
              // sourceId from a previously-picked result.
              setSourceId(null)
              setNote('')
              setIcon('💊')
              // Stale info popover would be confusing — close it so the
              // search dropdown can come back into view.
              setInfoFor(null)
            }}
            onFocus={() => { if (name.trim()) setOpen(true) }}
            onKeyDown={handleNameKey}
            aria-expanded={open && matches.length > 0}
            aria-controls="supplement-search-listbox"
          />

          {open && matches.length > 0 && !infoFor && (
            <ul
              id="supplement-search-listbox"
              role="listbox"
              className={styles.searchResults}
            >
              {matches.map((s, i) => (
                <li key={s.id} className={styles.searchResultLi}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === focusIdx}
                    className={`${styles.searchResult} ${i === focusIdx ? styles.searchResultFocus : ''}`}
                    onClick={() => pickResult(s)}
                    onMouseEnter={() => setFocusIdx(i)}
                  >
                    <span className={styles.searchResultIcon} aria-hidden>{s.icon}</span>
                    <span className={styles.searchResultBody}>
                      <span className={styles.searchResultName}>{s.name}</span>
                      <span className={styles.searchResultMeta}>
                        {s.dose} · {windowLabel(s.window)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.infoBtn}
                    onClick={e => {
                      e.stopPropagation()
                      setInfoFor(prev => prev?.id === s.id ? null : s)
                    }}
                    aria-label={`What does ${s.name} do?`}
                    title="What it does, when, how"
                  >
                    i
                  </button>
                </li>
              ))}
            </ul>
          )}

          {infoFor && (
            <InfoPopover
              supplement={infoFor}
              onClose={() => setInfoFor(null)}
              onAdd={() => {
                pickResult(infoFor)
                handleSubmit()
              }}
            />
          )}
        </div>

        <div className={styles.addRowTwo}>
          <div className={styles.addField}>
            <label className={styles.addLabel} htmlFor="supplement-dose-input">
              Dose
            </label>
            <input
              id="supplement-dose-input"
              type="text"
              className={styles.addInput}
              placeholder="5 g"
              value={dose}
              onChange={e => setDose(e.target.value)}
            />
          </div>

          <div className={styles.addField}>
            <label className={styles.addLabel} htmlFor="supplement-window-input">
              When
            </label>
            <select
              id="supplement-window-input"
              className={`${styles.addInput} ${styles.addSelect}`}
              value={windowKey}
              onChange={e => setWindowKey(e.target.value as WindowKey)}
            >
              {WINDOWS.map(w => (
                <option key={w.key} value={w.key}>{w.title}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className={styles.addBtn}
            disabled={!name.trim()}
          >
            <span className={styles.addBtnPlus} aria-hidden>+</span>
            Add to stack
          </button>
        </div>
      </form>

      {name.trim() && (
        <p className={styles.addHint}>
          {dose ? `${dose} · ` : ''}
          {WINDOWS.find(w => w.key === windowKey)?.icon} {WINDOWS.find(w => w.key === windowKey)?.title.toLowerCase()}
          {sourceId ? ' · from library' : ' · custom entry'}
        </p>
      )}
    </section>
  )
}

function windowLabel(key: WindowKey): string {
  const w = WINDOWS.find(x => x.key === key)
  return w ? `${w.icon} ${w.title.toLowerCase()}` : key
}

function search(rawQuery: string): DbSupplement[] {
  const q = rawQuery.toLowerCase().trim()
  if (!q) return []
  const starts: DbSupplement[] = []
  const contains: DbSupplement[] = []
  for (const s of SUPPLEMENT_DB) {
    const haystack = [s.name.toLowerCase(), ...s.aliases.map(a => a.toLowerCase())]
    if (haystack.some(h => h.startsWith(q))) starts.push(s)
    else if (haystack.some(h => h.includes(q))) contains.push(s)
  }
  return [...starts, ...contains].slice(0, 6)
}

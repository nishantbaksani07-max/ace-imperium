'use client'

import { useRef, useState, type ReactNode } from 'react'
import styles from './mentor.module.css'
import { CONTEXT_AREAS, groupFactsByArea, type ContextArea } from './contextStubs'
import { saveContextFact, deleteContextFact } from './actions'
import type { ContextFact } from './types'

// Thin-line glyph per area (drawn-on via stroke-dasharray). No emoji.
const GLYPHS: Record<ContextArea, ReactNode> = {
  life: <><path pathLength={1} d="M4 12h16" /><circle pathLength={1} cx={12} cy={12} r={3} /></>,
  people: <><circle pathLength={1} cx={9} cy={9.5} r={3} /><circle pathLength={1} cx={16.5} cy={11} r={2.4} /><path pathLength={1} d="M3.5 19c1-3.4 9-3.4 10 0" /></>,
  self: <><circle pathLength={1} cx={12} cy={8.5} r={3.2} /><path pathLength={1} d="M5.5 19.5c1-4.2 12-4.2 13 0" /></>,
}

type SavedMap = Record<ContextArea, ContextFact[]>
type NumMap = Record<ContextArea, number>
type IdxMap = Record<ContextArea, number[]>

export default function ContextNotes({ initialFacts }: { initialFacts: ContextFact[] }) {
  const grouped = groupFactsByArea(initialFacts)
  const [saved, setSaved] = useState<SavedMap>({ life: grouped.life, people: grouped.people, self: grouped.self })
  const [openArea, setOpenArea] = useState<ContextArea | null>(null)
  const [revealed, setRevealed] = useState<NumMap>({ life: 2, people: 2, self: 2 })
  const [used, setUsed] = useState<IdxMap>({ life: [], people: [], self: [] })
  const [editing, setEditing] = useState<{ area: ContextArea; idx: number } | null>(null)
  const [draft, setDraft] = useState('')
  const [closed, setClosed] = useState(false)
  const [showFree, setShowFree] = useState(false)
  const [freeDraft, setFreeDraft] = useState('')
  const freeSeq = useRef(0)

  function toggle(area: ContextArea) {
    setEditing(null)
    setOpenArea(prev => (prev === area ? null : area))
  }

  function startEdit(area: ContextArea, idx: number) {
    setEditing({ area, idx })
    setDraft('')
  }

  async function commit(area: ContextArea, idx: number) {
    const v = draft.trim()
    setEditing(null)
    setDraft('')
    if (!v) return
    const stub = CONTEXT_AREAS.find(a => a.key === area)!.stubs[idx]
    const body = `${stub.pre}${v}${stub.post}`
    const tempId = `temp-${area}-${idx}`
    setUsed(prev => ({ ...prev, [area]: [...prev[area], idx] }))
    setSaved(prev => ({ ...prev, [area]: [...prev[area], { id: tempId, area, body }] }))
    const res = await saveContextFact(area, body)
    setSaved(prev => ({
      ...prev,
      [area]: res.ok
        ? prev[area].map(f => (f.id === tempId ? res.fact : f))
        : prev[area].filter(f => f.id !== tempId),
    }))
  }

  async function remove(area: ContextArea, id: string) {
    const prevList = saved[area]
    setSaved(s => ({ ...s, [area]: s[area].filter(f => f.id !== id) }))
    const res = await deleteContextFact(id)
    if (!res.ok) setSaved(s => ({ ...s, [area]: prevList }))
  }

  async function commitFree() {
    const v = freeDraft.trim()
    setFreeDraft('')
    if (!v) return
    const tempId = `temp-free-${freeSeq.current++}`
    setSaved(prev => ({ ...prev, life: [...prev.life, { id: tempId, area: 'life', body: v }] }))
    const res = await saveContextFact('life', v)
    setSaved(prev => ({
      ...prev,
      life: res.ok
        ? prev.life.map(f => (f.id === tempId ? res.fact : f))
        : prev.life.filter(f => f.id !== tempId),
    }))
  }

  if (closed) {
    return (
      <section className={styles.contextSec} aria-label="what Vee should know">
        <div className={styles.secHead}>
          <span className={styles.secEyebrow}>context</span>
          <span className={styles.secTitle}>What Vee should know</span>
          <span className={styles.secRule} aria-hidden />
        </div>
        <p className={styles.ctxClosed}>That is plenty for now. Vee can take it from here.</p>
      </section>
    )
  }

  return (
    <section className={styles.contextSec} aria-label="what Vee should know">
      {/* shared glyph gradient */}
      <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <linearGradient id="vstroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
      </svg>

      <div className={styles.secHead}>
        <span className={styles.secEyebrow}>context</span>
        <span className={styles.secTitle}>What Vee should know</span>
        <span className={styles.secRule} aria-hidden />
      </div>

      <p className={styles.ctxLead}>No rush. Finish one if it feels true.</p>
      <p className={styles.ctxReassure}>takes about ten seconds</p>

      <div className={styles.veeNotes}>
        {CONTEXT_AREAS.map(area => {
          const isOpen = openArea === area.key
          const factsHere = saved[area.key]
          const stubsShown = area.stubs
            .map((stub, i) => ({ stub, i }))
            .filter(({ i }) => i < revealed[area.key] && !used[area.key].includes(i))
          const moreLeft = revealed[area.key] < area.stubs.length
          const noteClass = [styles.veeNote, isOpen ? styles.open : '', factsHere.length ? styles.done : ''].filter(Boolean).join(' ')
          return (
            <div key={area.key} className={noteClass}>
              <button className={styles.noteHead} type="button" aria-expanded={isOpen} onClick={() => toggle(area.key)}>
                <span className={styles.noteTile}>
                  <svg className={styles.noteGlyph} viewBox="0 0 24 24">{GLYPHS[area.key]}</svg>
                </span>
                <span className={styles.noteText}>
                  <span className={styles.noteLabel}>{area.label}</span>
                  <span className={styles.noteHelp}>{factsHere.length ? 'one less thing to carry' : area.helper}</span>
                </span>
                <span className={styles.noteDiamond} aria-hidden />
                <svg className={styles.noteChev} viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
              </button>

              <div className={styles.noteBody}>
                <div className={styles.noteInner}>
                  <ul className={styles.noteStubs}>
                    {factsHere.map(f => (
                      <li key={f.id} className={styles.ctxRow}>
                        {f.body}
                        <button className={styles.ctxDelete} type="button" aria-label="remove" onClick={() => remove(area.key, f.id)}>×</button>
                      </li>
                    ))}
                    {stubsShown.map(({ stub, i }) => {
                      const isEditing = editing?.area === area.key && editing.idx === i
                      const rowClass = [styles.ctxRow, styles.ghost, stub.calm ? styles.calm : ''].filter(Boolean).join(' ')
                      return (
                        <li
                          key={`stub-${i}`}
                          className={rowClass}
                          onClick={() => { if (!isEditing) startEdit(area.key, i) }}
                        >
                          {isEditing ? (
                            <span className={styles.stubRow}>
                              <span className={styles.stubText}>
                                {stub.pre}
                                <input
                                  className={styles.blankInput}
                                  placeholder={stub.placeholder}
                                  value={draft}
                                  autoFocus
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => setDraft(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') { e.preventDefault(); commit(area.key, i) }
                                    if (e.key === 'Escape') { setEditing(null); setDraft('') }
                                  }}
                                />
                                {stub.post}
                              </span>
                              <button className={styles.saveStub} type="button" onClick={e => { e.stopPropagation(); commit(area.key, i) }}>Save</button>
                            </span>
                          ) : (
                            <span className={styles.stubText}>{stub.pre}<span className={styles.blank} />{stub.post}</span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  {moreLeft
                    ? (
                      <button className={styles.moreLink} type="button" onClick={() => setRevealed(r => ({ ...r, [area.key]: Math.min(area.stubs.length, r[area.key] + 2) }))}>
                        <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg> show a couple more
                      </button>
                    )
                    : <span className={styles.moreDone}>that is everything in here</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <button className={styles.plentyLink} type="button" onClick={() => setClosed(true)}>that is plenty</button>
      {showFree ? (
        <div className={styles.addRow}>
          <input
            className={styles.addInput}
            placeholder="anything else on your mind"
            value={freeDraft}
            onChange={e => setFreeDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitFree() } }}
          />
        </div>
      ) : (
        <button className={styles.freeLink} type="button" onClick={() => setShowFree(true)}>or tell Vee something in your own words</button>
      )}
    </section>
  )
}

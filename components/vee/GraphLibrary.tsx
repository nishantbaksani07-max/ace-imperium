'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CoreGraph, CoreGroup } from '@/lib/insights/coreRoom'
import s from './graphLibrary.module.css'

/**
 * THE GRAPH LIBRARY - the goal card's picker, grown up (Alex, 2026-07-12).
 * A Library-grade centered card holding EVERY graphable core series for this
 * user, real points included: every vital from their band, every lift they
 * ever logged, every fuel line, the scale. Tap one and the goal drinks from
 * that exact line ('core:<id>' binding). Vee's module picks ride on top as
 * quick pills, "let Vee decide" hands the wheel back, and needs-new-data
 * entries render dim and honest (sugar/fiber/sodium/food score until Fuel
 * records them). Data arrives lazily from /api/core-graphs the first time
 * any goal opens this - the Vee tab pays nothing until then.
 */

export interface QuickPick {
  key: string
  word: string
}

const GROUPS: { key: CoreGroup; label: string; word: string }[] = [
  { key: 'vitals', label: 'Vitals', word: 'from your band · last 30 days' },
  { key: 'train', label: 'Train', word: 'every lift you have logged' },
  { key: 'fuel', label: 'Fuel', word: 'day by day' },
  { key: 'body', label: 'Body', word: 'the scale' },
]

function Spark({ g }: { g: CoreGraph }) {
  if (g.points.length < 2) {
    return (
      <div className={s.sparkEmpty}>
        <span>{g.soon ? 'needs new data' : g.points.length === 1 ? '1 logged · one more draws it' : 'not logged yet'}</span>
      </div>
    )
  }
  const w = 200
  const h = 40
  const pad = 5
  const vals = g.points.map((p) => p.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  const step = (w - pad * 2) / (g.points.length - 1)
  const pts = g.points
    .map((p, i) => `${(pad + i * step).toFixed(1)},${(pad + (h - pad * 2) * (1 - (p.value - min) / range)).toFixed(1)}`)
    .join(' ')
  const last = pts.split(' ').pop()!.split(',')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" fill="none" aria-hidden>
      <polyline
        points={pts}
        stroke="var(--mint, #6ee7b7)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity="0.9"
      />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill="var(--mint, #6ee7b7)" />
    </svg>
  )
}

export default function GraphLibrary({
  goalTitle,
  currentBinding,
  quickPicks,
  graphs,
  failed,
  onPick,
  onClose,
}: {
  goalTitle: string
  /** The goal's current bindingOverride (module, 'stream:x', 'core:x', or null). */
  currentBinding: string | null
  /** Vee's module picks for this goal's category (label word + binding key). */
  quickPicks: QuickPick[]
  /** The core catalog (null = still loading). The PARENT owns the one fetch,
   *  shared with the goal cards' own line drawing - one read, no disagreement. */
  graphs: CoreGraph[] | null
  failed: boolean
  /** Called with the new binding value ('core:<id>', a module key, or null). */
  onPick: (binding: string | null) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const searchRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    searchRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const shown = useMemo(() => {
    if (!graphs) return []
    const needle = q.trim().toLowerCase()
    if (!needle) return graphs
    return graphs.filter((g) => `${g.label} ${g.sub} ${g.group}`.toLowerCase().includes(needle))
  }, [graphs, q])

  return (
    <div className={s.overlay} role="dialog" aria-modal="true" aria-label={`Choose the graph for ${goalTitle}`}>
      <div className={s.scrim} onClick={onClose} />
      <div className={s.card}>
        <button type="button" className={s.x} onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden>
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>

        <div className={s.head}>
          <div className={s.title}>
            The <em>graph library</em>
          </div>
          <div className={s.sub}>
            Pick what draws <b>{goalTitle}</b>. Your real numbers, nothing invented.
          </div>

          {/* Vee's picks: the module lanes (analysed trends, tips, levers). */}
          <div className={s.quick} role="group" aria-label="Vee's picks">
            {quickPicks.map((p) => (
              <button
                type="button"
                key={p.key}
                className={`${s.pill} ${currentBinding === p.key ? s.pillOn : ''}`}
                aria-pressed={currentBinding === p.key}
                onClick={() => onPick(p.key)}
              >
                {p.word}
              </button>
            ))}
            <button
              type="button"
              className={`${s.pill} ${s.pillVee} ${currentBinding === null ? s.pillOn : ''}`}
              aria-pressed={currentBinding === null}
              onClick={() => onPick(null)}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M5 5l7 14 7-14" />
              </svg>
              let Vee decide
            </button>
          </div>

          <input
            ref={searchRef}
            className={s.search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="bench, sleep, protein, weight..."
            aria-label="Search your graphs"
          />
        </div>

        <div className={s.body}>
          {failed ? (
            <p className={s.note}>Could not reach your graphs just now. Close and try again in a moment.</p>
          ) : !graphs ? (
            <p className={s.note}>Reading your lines.</p>
          ) : (
            GROUPS.map((grp) => {
              const items = shown.filter((g) => g.group === grp.key)
              if (items.length === 0) return null
              return (
                <section key={grp.key} className={s.shelf}>
                  <div className={s.shelfHead}>
                    <span className={s.shelfName}>{grp.label}</span>
                    <span className={s.shelfWord}>{grp.word}</span>
                    <span className={s.shelfN}>{items.length}</span>
                  </div>
                  <div className={s.grid}>
                    {items.map((g) => {
                      const live = g.points.length >= 2 && !g.soon
                      const key = `core:${g.id}`
                      const on = currentBinding === key
                      return (
                        <button
                          type="button"
                          key={g.id}
                          className={`${s.g} ${live ? '' : s.gDim} ${on ? s.gOn : ''}`}
                          disabled={!live}
                          aria-pressed={on}
                          onClick={() => onPick(key)}
                        >
                          <span className={s.gTop}>
                            <span className={s.gName}>{g.label}</span>
                            <span className={s.gUnit}>{g.unit}</span>
                          </span>
                          <Spark g={g} />
                          <span className={s.gFoot}>
                            <span>{g.sub}</span>
                            <span>
                              {g.points.length >= 1 ? `last ${g.points[g.points.length - 1].value.toLocaleString('en-US')}` : ''}
                            </span>
                          </span>
                          {live && <span className={s.use}>{on ? 'STEERING THIS GOAL' : 'USE THIS GRAPH'}</span>}
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })
          )}
          {graphs && shown.length === 0 && <p className={s.note}>Nothing matches. Try a lift, a vital, or a macro.</p>}
        </div>
      </div>
    </div>
  )
}

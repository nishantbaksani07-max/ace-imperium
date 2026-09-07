'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { CoreGraph, CoreGroup } from '@/lib/insights/coreRoom'
import s from './coreRoom.module.css'

/**
 * THE CORE ROOM - the graph library, rendered. A search bar, four calm
 * shelves (Train / Fuel / Body / Vitals), one card per series: serif last
 * value, mono spec, and the real line drawn as a pure SVG polyline (no chart
 * lib, no network, nothing that can wobble). Cards with no data render dim
 * with the honest ask - the catalog is always complete, never padded.
 */

const GROUPS: { key: CoreGroup; label: string; word: string }[] = [
  { key: 'train', label: 'Train', word: 'every lift you have ever logged' },
  { key: 'fuel', label: 'Fuel', word: 'what you eat and drink, day by day' },
  { key: 'body', label: 'Body', word: 'the scale, raw and smoothed' },
  { key: 'vitals', label: 'Vitals', word: 'what your body reports back' },
]

function Line({ g }: { g: CoreGraph }) {
  const w = 260
  const h = 64
  const pad = 6
  if (g.points.length < 2) {
    return (
      <div className={s.lineEmpty}>
        <span>log it and this line draws itself</span>
      </div>
    )
  }
  const vals = g.points.map((p) => p.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  const step = (w - pad * 2) / (g.points.length - 1)
  const pts = g.points
    .map((p, i) => {
      const x = pad + i * step
      const y = pad + (h - pad * 2) * (1 - (p.value - min) / range)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const last = pts.split(' ').pop()!.split(',')
  return (
    <svg className={s.lineSvg} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" fill="none" aria-hidden>
      <polyline
        points={pts}
        stroke="var(--mint)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity="0.9"
      />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill="var(--mint)" />
    </svg>
  )
}

function DirMark({ dir }: { dir: CoreGraph['dir'] }) {
  if (dir === 'neutral') {
    return (
      <svg viewBox="0 0 12 12" aria-label="the goal decides" role="img">
        <path d="M6 1.5 L10.5 6 L6 10.5 L1.5 6 Z" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinejoin="round" />
      </svg>
    )
  }
  const d = dir === 'up' ? 'M6 10 L6 2 M3 5 L6 2 L9 5' : 'M6 2 L6 10 M3 7 L6 10 L9 7'
  return (
    <svg viewBox="0 0 12 12" aria-label={dir === 'up' ? 'up is good' : 'down is good'} role="img">
      <path d={d} stroke="var(--mint)" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function CoreRoom({ graphs }: { graphs: CoreGraph[] }) {
  const [q, setQ] = useState('')

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return graphs
    return graphs.filter((g) => `${g.label} ${g.sub} ${g.group}`.toLowerCase().includes(needle))
  }, [graphs, q])

  const withData = graphs.filter((g) => g.points.length >= 2).length

  return (
    <div className={s.world}>
      <header className={s.head}>
        <Link href="/app" className={s.back}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          DASHBOARD
        </Link>
        <div className={s.eyebrow}>VITALITY · THE CORE ROOM</div>
        <h1 className={s.title}>
          Every line your life has <em>drawn</em>.
        </h1>
        <p className={s.lede}>
          {withData} live graph{withData === 1 ? '' : 's'} from your real logs. Search anything.
        </p>
        <input
          className={s.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="bench, protein, sleep, weight..."
          aria-label="Search your graphs"
        />
      </header>

      <main className={s.main}>
        {GROUPS.map((grp) => {
          const items = shown.filter((g) => g.group === grp.key)
          if (items.length === 0) return null
          return (
            <section key={grp.key} className={s.shelf}>
              <div className={s.shelfHead}>
                <span className={s.shelfLabel}>{grp.label}</span>
                <span className={s.shelfWord}>{grp.word}</span>
                <span className={s.shelfCount}>{items.length}</span>
              </div>
              <div className={s.grid}>
                {items.map((g) => {
                  const live = g.points.length >= 2
                  const last = live ? g.points[g.points.length - 1] : null
                  return (
                    <article key={g.id} className={`${s.card} ${live ? '' : s.cardDim}`}>
                      <div className={s.cardTop}>
                        <span className={s.cardLabel}>{g.label}</span>
                        <DirMark dir={g.dir} />
                      </div>
                      <div className={s.cardValue}>
                        {last ? (
                          <>
                            <strong>{last.value.toLocaleString('en-US')}</strong>
                            <span>{g.unit}</span>
                          </>
                        ) : (
                          <strong className={s.noData}>no data yet</strong>
                        )}
                      </div>
                      <Line g={g} />
                      <div className={s.cardFoot}>
                        <span>{g.sub}</span>
                        <span>{g.points.length > 0 ? `${g.points.length} logged` : ''}</span>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}

        {shown.length === 0 && (
          <p className={s.none}>Nothing matches. Try a lift name, a macro, or a vital.</p>
        )}
      </main>
    </div>
  )
}

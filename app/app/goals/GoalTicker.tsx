'use client'

import { useState } from 'react'
import styles from './veeNoticed.module.css'
import GoalGuide from './GoalGuide'
import GraphFullscreen from './GraphFullscreen'
import type { TickerRow, TrendState } from '@/lib/insights/ticker'
import { guideProjectionLead, type GuideItem, type GuideModule } from '@/lib/insights/goalGuide'

const UP = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 5l8 13H4z" /></svg>
const DN = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 19L4 6h16z" /></svg>
const CHEV = <svg className={styles.gChev} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
const SPARKLE = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M11.6 2.4l1.7 5.4 5.4 1.7-5.4 1.7-1.7 5.4-1.7-5.4-5.4-1.7 5.4-1.7z" /></svg>
const EXPAND = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" /></svg>

type Tone = 'up' | 'dn' | 'flat'

function stateMeta(state: TrendState): { tone: Tone; word: string } {
  switch (state) {
    case 'on-track': return { tone: 'up', word: 'on track' }
    case 'drifting': return { tone: 'dn', word: 'drifting' }
    case 'holding': return { tone: 'flat', word: 'holding' }
    default: return { tone: 'flat', word: 'no data yet' }
  }
}

/** Normalise a small series into a 54x20 polyline. Returns null with < 2 points. */
function sparkPoints(spark: number[]): string | null {
  if (spark.length < 2) return null
  const w = 54, h = 20, pad = 2
  const min = Math.min(...spark), max = Math.max(...spark)
  const range = max - min || 1
  const step = (w - pad * 2) / (spark.length - 1)
  return spark.map((v, i) => {
    const x = pad + i * step
    const y = pad + (h - pad * 2) * (1 - (v - min) / range)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

function honestRead(row: TickerRow, guides?: Record<string, GuideItem[]>): string {
  if (row.state === 'on-track') {
    // Reuse the goal's own grounded projection lead when its brain fired, so the
    // read matches the dropdown instead of a generic line. Gated like every brain.
    if (row.spark.length >= 2 && row.detail) {
      const mod: GuideModule | null = row.metric === 'weight' ? 'weight'
        : (row.metric === 'lift' || row.metric === 'training') ? 'train' : null
      const lead = mod ? guideProjectionLead(guides?.[row.id], mod) : null
      if (lead) return lead.charAt(0).toLowerCase() + lead.slice(1)
    }
    return `you are moving the right way here, ${row.detail}. keep the rhythm going.`
  }
  if (row.state === 'holding') return `holding steady at ${row.detail}. a small push tips it forward.`
  if (row.state === 'drifting') return `this one is drifting, ${row.detail}. one step this week catches it before it lands.`
  return row.hint ?? 'log a little here and a real trend will appear.'
}

function Spark({ row, tone }: { row: TickerRow; tone: Tone }) {
  const pts = sparkPoints(row.spark)
  if (!pts) return <span className={styles.spk} aria-hidden style={{ width: 54 }} />
  const color = tone === 'up' ? 'var(--mint)' : tone === 'dn' ? 'var(--amber)' : 'var(--n-muted-strong)'
  const last = pts.split(' ').slice(-1)[0].split(',')
  return (
    <svg className={styles.spk} width="54" height="20" viewBox="0 0 54 20" fill="none" aria-hidden>
      <polyline points={pts} stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.1" fill={color} />
    </svg>
  )
}

export default function GoalTicker({ rows, guides, onTalk }: { rows: TickerRow[]; guides?: Record<string, GuideItem[]>; onTalk: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [fullId, setFullId] = useState<string | null>(null)
  if (rows.length === 0) return null
  const fullRow = fullId ? rows.find(r => r.id === fullId && r.spark.length >= 2) ?? null : null

  return (
    <div className={styles.board}>
      <div className={styles.boardHead}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" />
        </svg>
        your goals, live <b>· tap one</b>
      </div>

      {rows.map(row => {
        const { tone, word } = stateMeta(row.state)
        const toneClass = tone === 'up' ? styles.up : tone === 'dn' ? styles.dn : styles.flat
        const isOpen = openId === row.id
        return (
          <div className={styles.gwrap} key={row.id}>
            <button
              type="button"
              className={`${styles.grow} ${isOpen ? styles.growOpen : ''}`}
              aria-expanded={isOpen}
              onClick={() => setOpenId(isOpen ? null : row.id)}
            >
              <span className={styles.gName}>
                <span className={styles.t}>{row.title}</span>
                <span className={`${styles.sub} ${toneClass}`}>{word}</span>
              </span>
              <Spark row={row} tone={tone} />
              <span className={styles.chg}>
                {row.detail ? (
                  <span className={`${styles.v} ${toneClass}`}>
                    {tone === 'up' ? UP : tone === 'dn' ? DN : null}
                    {row.detail}
                  </span>
                ) : (
                  <span className={styles.gHint}>log it</span>
                )}
              </span>
              {CHEV}
            </button>

            <div className={`${styles.gDrop} ${isOpen ? styles.gDropOpen : ''}`}>
              <div className={styles.gDin}>
                <div className={styles.gdCard}>
                  <p className={styles.gdRead}>{honestRead(row, guides)}</p>
                  <GoalGuide items={guides?.[row.id] ?? []} />
                  <div className={styles.gdActs}>
                    {row.spark.length >= 2 && (
                      <button type="button" className={styles.gxB} onClick={() => setFullId(row.id)}>
                        {EXPAND}
                        see the full graph
                      </button>
                    )}
                    <button type="button" className={styles.clB} onClick={onTalk}>
                      {SPARKLE}
                      talk deeper in Claude
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {fullRow && (() => {
        const { tone, word } = stateMeta(fullRow.state)
        return <GraphFullscreen row={fullRow} tone={tone} word={word} onClose={() => setFullId(null)} />
      })()}
    </div>
  )
}

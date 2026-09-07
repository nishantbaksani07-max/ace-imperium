'use client'

/**
 * One-tap stimulant quick-log — your stack as minimal cards, now configurable.
 * Each tap logs that source at the current time with its default dose via the
 * shared `logSubstance` action, so the real curve (solid line) lifts above the
 * dotted "without your stims" baseline immediately, and the Health Watch +
 * score update from the same logs.
 *
 * The row is YOUR hot bar: "+ Add" searches the full substance library
 * (caffeine, ADHD meds, nicotine, supplements) and pins what you pick; each card
 * can be removed with its ×. Pins persist in peak state (`quickKeys`). SETUP
 * still opens the standalone stack builder for the richer onset/peak/comedown view.
 */

import { useMemo, useState } from 'react'
import styles from './peak.module.css'
import { SUBSTANCES } from './substances'
import type { SubstanceLog } from './types'
import SubstanceDetail from './SubstanceDetail'

/** Default chips when the user hasn't customised their bar yet. */
const DEFAULT_KEYS = ['coffee', 'espresso', 'energy_drink', 'matcha']
/** General safe daily caffeine ceiling — the per-card progress bar fills toward it. */
const CAFF_CEILING = 400
/** Categories offered in the "+ Add" search. */
const ADDABLE = new Set(['caffeine', 'adhd', 'nicotine', 'depressant', 'supplement'])

interface Props {
  onLog: (key: string, dose?: number) => void
  /** Pin a substance to the hot bar. */
  onPin: (key: string) => void
  /** Remove a substance from the hot bar. */
  onUnpin: (key: string) => void
  /** The user's pinned keys (falls back to the default caffeine set). */
  quickKeys?: string[]
  /** Today's substance logs — drives each card's count + mg-today + progress. */
  logs: SubstanceLog[]
  /** Opens the standalone stack builder. */
  standaloneUrl: string
  /** Show the solid-vs-dotted curve legend (only once a stim is logged). */
  showLegend: boolean
  /** Readiness score right now with the psychoactive logs stripped out. */
  naturalNow: number
  /** Readiness score right now including today's stims. */
  withStimsNow: number
  /** withStimsNow − naturalNow: the lift your stack is giving you this minute. */
  lift: number
}

export default function StimQuickLog({ onLog, onPin, onUnpin, quickKeys, logs, standaloneUrl, showLegend, naturalNow, withStimsNow, lift }: Props) {
  const keys = quickKeys ?? DEFAULT_KEYS
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  // Which substance's PK detail modal is open (onset/peak/comedown breakdown).
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const detailDef = detailKey ? SUBSTANCES[detailKey] : null

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pinned = new Set(keys)
    return Object.values(SUBSTANCES)
      .filter((s) => ADDABLE.has(s.category) && !pinned.has(s.key))
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, keys])

  function add(key: string) {
    onPin(key)
    setQuery('')
    setAdding(false)
  }

  return (
    <div className={styles.pkQl}>
      <div className={styles.pkQlHead}>
        <span className={styles.pkQlEyebrow}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10.5H13L13 2Z" />
          </svg>
          ONE TAP · YOUR STACK
        </span>
        <span className={styles.pkQlHeadActions}>
          <button type="button" className={styles.pkQlAdd} onClick={() => setAdding((a) => !a)}>
            {adding ? 'CLOSE' : '+ ADD'}
          </button>
          <a className={styles.pkQlSetup} href={standaloneUrl} target="_blank" rel="noreferrer">SETUP ↗</a>
        </span>
      </div>

      {adding && (
        <div>
          <input
            autoFocus
            className={styles.pkQlSearchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search — Concerta, Vyvanse, nicotine, caffeine…"
          />
          {results.length > 0 && (
            <div className={styles.pkQlSuggest}>
              {results.map((s) => (
                <button key={s.key} type="button" className={styles.pkQlSuggestRow} onClick={() => add(s.key)}>
                  <span className={styles.pkQlSuggestIcon} aria-hidden>{s.icon}</span>
                  <span className={styles.pkQlSuggestName}>{s.name}</span>
                  <span className={styles.pkQlSuggestDose}>{s.defaultDose} {s.unit}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={styles.pkQlGrid}>
        {keys.map((key) => {
          const s = SUBSTANCES[key]
          if (!s) return null
          const these = logs.filter((l) => l.key === key)
          const count = these.length
          const mgToday = these.reduce((sum, l) => sum + (l.dose || 0), 0)
          const showBar = s.category === 'caffeine'
          const pct = Math.min(100, Math.round((mgToday / CAFF_CEILING) * 100))
          return (
            <div key={key} className={styles.pkQlCard}>
              <button type="button" className={styles.pkQlRemove} onClick={() => onUnpin(key)} aria-label={`Remove ${s.name} from your stack`}>×</button>
              <button
                type="button"
                className={styles.pkQlCardTop}
                onClick={() => setDetailKey(key)}
                aria-label={`${s.name} — onset, peak & comedown detail`}
              >
                <span className={styles.pkQlIcon} aria-hidden>{s.icon}</span>
                <span className={styles.pkQlCardMeta}>
                  <span className={styles.pkQlCardName}>{s.name}</span>
                  <span className={styles.pkQlCardMg}>{s.defaultDose} {s.unit}</span>
                </span>
                <span className={styles.pkQlCardInfo} aria-hidden>↗</span>
              </button>
              <button
                type="button"
                className={`${styles.pkQlLog} ${count > 0 ? styles.pkQlLogged : ''}`}
                onClick={() => onLog(key)}
              >
                {count > 0 ? `✓ ${count}× today` : '+ Log now'}
              </button>
              {showBar && (
                <div className={styles.pkQlBar}>
                  <div className={styles.pkQlBarFill} style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
          )
        })}
        {keys.length === 0 && (
          <button type="button" className={styles.pkQlEmptyAdd} onClick={() => setAdding(true)}>
            + Add your stack
          </button>
        )}
      </div>

      {showLegend && (
        <div className={styles.pkQlReadout}>
          {lift > 0 ? (
            <div className={styles.pkQlDelta}>
              <span className={styles.pkQlDeltaText}>
                natural <b>{Math.round(naturalNow)}</b> <span aria-hidden>→</span> <b className={styles.pkQlDeltaNow}>{Math.round(withStimsNow)}</b>
              </span>
              <span className={styles.pkQlDeltaPill}>stims +{Math.round(lift)}</span>
            </div>
          ) : (
            <div className={styles.pkQlDeltaFlat}>your stims aren&apos;t lifting you right now</div>
          )}
          <div className={styles.pkQlLegend}>
            <span className={styles.pkQlKey}><i className={styles.pkQlSolid} /> with your stims</span>
            <span className={styles.pkQlKey}><i className={styles.pkQlDotted} /> without</span>
          </div>
        </div>
      )}

      {detailDef && (
        <SubstanceDetail
          def={detailDef}
          logs={logs.filter((l) => l.key === detailDef.key)}
          pinned={keys.includes(detailDef.key)}
          onLog={onLog}
          onPin={onPin}
          onUnpin={onUnpin}
          onClose={() => setDetailKey(null)}
        />
      )}
    </div>
  )
}

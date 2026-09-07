'use client'

import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { SubScore, Tier } from '@/lib/vitals/score'
import { TIER_PIPS, TIER_WORD, TIER_COLOR } from './tierMeta'
import { RATING_REF } from './ratingRef'
import styles from './explainerCard.module.css'

/**
 * ExplainerCard - the one cozy Vitals explainer overlay. Rarity-card INSPIRED
 * framing (bordered card, mono eyebrow, serif lede) with its own calmer look.
 * Two bodies on one shell:
 *   - { kind: 'score' }: what the Vitality score IS - the big number plus a
 *     vertical column of its real ingredients, named straight from the score
 *     engine (lib/vitals/score.ts subDefs): recovery .30, sleep performance .20,
 *     HRV vs baseline .15, RHR vs baseline .15, sleep hours .10, strain .10.
 *   - { kind: 'metric', name }: what one tile's number means - the same card
 *     system the per-tile "?" marks route into (measure, good direction, the
 *     five-rung ladder with a "you" marker, one warm note).
 * Springy entrance, reduced-motion flattened in CSS, Esc / backdrop close.
 */

export type ExplainerTarget =
  | { kind: 'score' }
  | { kind: 'metric'; name: string; tier: Tier }

/** The honest ingredient list, mirroring subDefs in lib/vitals/score.ts. Live
 *  subs are preferred whenever a score exists; this static mirror only renders
 *  before first data. Exported so __tests__/explainerMirror.test.ts pins its
 *  labels + weights + order to the engine (an engine tweak fails the test
 *  instead of quietly showing stale percentages to brand-new users). */
export const DEFAULT_INGREDIENTS: { label: string; weight: number; detail?: string }[] = [
  { label: 'Recovery', weight: 0.3 },
  { label: 'Sleep performance', weight: 0.2 },
  { label: 'HRV vs baseline', weight: 0.15, detail: 'against your own average' },
  { label: 'RHR vs baseline', weight: 0.15, detail: 'against your own average' },
  { label: 'Sleep hours', weight: 0.1 },
  { label: 'Strain balance', weight: 0.1, detail: 'load vs what recovery afforded' },
]

const TIER_ORDER: Tier[] = ['needs-care', 'low', 'steady', 'strong', 'peak']

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
)

function ScoreBody({ score, subs }: { score: number | null; subs?: SubScore[] }) {
  // Prefer the live engine subs (same labels + weights, plus which readings are
  // actually present today); fall back to the static mirror before first data.
  const rows = subs && subs.length
    ? subs.map(s => ({
        label: s.label,
        weight: s.weight,
        detail: DEFAULT_INGREDIENTS.find(d => d.label === s.label)?.detail,
        muted: s.score == null,
      }))
    : DEFAULT_INGREDIENTS.map(d => ({ ...d, muted: false }))
  const missing = rows.some(r => r.muted)

  return (
    <>
      <div className={styles.eyebrow}>THE VITALITY SCORE</div>
      <p className={styles.lede}>One number for how <em>ready</em> your body is today.</p>
      <p className={styles.sub}>
        It refreshes each morning from last night&rsquo;s data. Every ingredient below feeds it,
        weighted by how much it says about readiness.
      </p>

      <div className={styles.bigRow}>
        <span className={styles.bigNum}>{score != null ? score : '0-100'}</span>
        {score != null && <span className={styles.bigScale}>OUT OF 100</span>}
      </div>

      <div className={styles.colWrap}>
        <div className={styles.col} aria-hidden>
          {rows.map((r, i) => (
            <span
              key={r.label}
              className={`${styles.seg} ${r.muted ? styles.segMuted : ''}`}
              style={{ ['--w']: r.weight * 100, ['--i']: i } as CSSProperties}
            />
          ))}
        </div>
        <div className={styles.legend}>
          {rows.map((r, i) => (
            <div
              key={r.label}
              className={`${styles.leg} ${r.muted ? styles.legMuted : ''}`}
              style={{ ['--w']: r.weight * 100, ['--i']: i } as CSSProperties}
            >
              <span className={styles.legName}>
                {r.label}
                {r.detail && <i>{r.detail}</i>}
              </span>
              <span className={styles.legPct}>{Math.round(r.weight * 100)}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.foot}>
        {missing
          ? 'A dimmed ingredient has no reading today. It just steps aside: the score rebalances over what is present, and a gap never counts against you.'
          : 'A missing reading never counts against you: the score rebalances over what is present.'}
      </div>
    </>
  )
}

function MetricBody({ name, tier }: { name: string; tier: Tier }) {
  const ref = RATING_REF[name]
  if (!ref) return null
  return (
    <>
      <div className={styles.eyebrow}>WHAT THIS NUMBER MEANS</div>
      <p className={styles.lede}>{name}</p>
      <p className={styles.sub}>{ref.measure[0].toUpperCase() + ref.measure.slice(1)}.</p>

      <span className={styles.dir}>
        <span className={styles.dirAr}>{ref.dir.ar}</span>
        {ref.dir.text}
      </span>

      <div className={styles.ladder}>
        {[...TIER_ORDER].reverse().map((t, k) => {
          const cur = t === tier
          const style = { ['--tc']: TIER_COLOR[t], animationDelay: `${0.1 + k * 0.05}s` } as CSSProperties
          return (
            <div key={t} className={`${styles.rung}${cur ? ' ' + styles.cur : ''}`} style={style}>
              <span className={styles.pips} aria-hidden>
                {[1, 2, 3, 4, 5].map(i => (
                  <span key={i} className={`${styles.pip}${i <= TIER_PIPS[t] ? ' ' + styles.pipOn : ''}`} />
                ))}
              </span>
              <span className={styles.word}>{TIER_WORD[t]}</span>
              <span className={styles.mean}>{ref.ladder[t]}</span>
              {cur ? <span className={styles.you}>YOU</span> : <span />}
            </div>
          )
        })}
      </div>

      <div className={styles.foot}>{ref.note}</div>
    </>
  )
}

export default function ExplainerCard({
  target,
  score = null,
  subs,
  onClose,
}: {
  target: ExplainerTarget
  /** Today's overall score (score mode); null before first data. */
  score?: number | null
  /** The live engine sub-scores, when a score exists (score mode). */
  subs?: SubScore[]
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    lastFocusedRef.current = document.activeElement as HTMLElement | null
    const t = setTimeout(() => closeRef.current?.focus(), 60)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      lastFocusedRef.current?.focus?.()
    }
  }, [onClose])

  let body: ReactNode
  let label: string
  if (target.kind === 'score') {
    body = <ScoreBody score={score} subs={subs} />
    label = 'What the Vitality score is'
  } else {
    body = <MetricBody name={target.name} tier={target.tier} />
    label = `What ${target.name} means`
  }
  if (target.kind === 'metric' && !RATING_REF[target.name]) return null

  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.card} role="dialog" aria-modal="true" aria-label={label}>
        <button ref={closeRef} type="button" className={styles.close} onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
        {body}
      </div>
    </div>
  )
}

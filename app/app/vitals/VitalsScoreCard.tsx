'use client'

import { useEffect, useRef, useState } from 'react'
import type { VitalsScore, ScorePoint, Tier } from '@/lib/vitals/score'
import TierMeter from '@/components/vitals/TierMeter'
import styles from './vitalsScoreCard.module.css'

const VERDICT: Record<Tier, string> = {
  peak: 'Peak day.',
  strong: 'Strong day, with room to recover.',
  steady: 'A steady day. Enough in the tank.',
  low: 'A lighter day. Lean into the easy wins.',
  'needs-care': 'A recovery day. Be kind to yourself.',
}

const trimLabel = (s: string) => s.replace(' vs baseline', '').toLowerCase()

/** Warm, plain, no-shame one-liner from the strongest and softest inputs. */
function whyLine(score: VitalsScore): string {
  const present = score.subs.filter(s => s.score != null)
  if (present.length < 2) return 'Logging a few more days sharpens this read.'
  const top = present.reduce((a, b) => ((b.score as number) > (a.score as number) ? b : a))
  const low = present.reduce((a, b) => ((b.score as number) < (a.score as number) ? b : a))
  if (top.key === low.key) return 'Everything is moving together today.'
  return `Your ${trimLabel(top.label)} is carrying you. ${trimLabel(low.label)[0].toUpperCase()}${trimLabel(low.label).slice(1)} has the most room to grow.`
}

function useCountUp(target: number, run: boolean, dur = 1500) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!run) { setVal(target); return }
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setVal(target); return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur)
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, run, dur])
  return val
}

/** Filled-area line graph of the score over the recent window (oldest → newest). */
function MiniGraph({ series }: { series: ScorePoint[] }) {
  if (series.length < 2) return null
  const GW = 320, GH = 100, GP = 10
  const vals = series.map(s => s.score)
  const mn = Math.min(...vals), mx = Math.max(...vals)
  const lo = Math.floor(mn / 5) * 5, hi = Math.max(lo + 5, Math.ceil(mx / 5) * 5)
  const xF = (i: number) => GP + (GW - 2 * GP) * (i / (series.length - 1))
  const yF = (v: number) => GP + (GH - 2 * GP) * (1 - (v - lo) / (hi - lo || 1))
  const d = series.map((s, i) => `${i ? 'L' : 'M'}${xF(i).toFixed(1)} ${yF(s.score).toFixed(1)}`).join(' ')
  const last = series[series.length - 1]
  return (
    <div className={styles.graph}>
      <svg viewBox="0 0 320 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="vscg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${d} L${xF(series.length - 1).toFixed(1)} ${GH} L${xF(0).toFixed(1)} ${GH} Z`} fill="url(#vscg)" />
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className={styles.gLbl}><i className={styles.sw} />Vitals score<em>{series.length} days</em></span>
      <span className={styles.gDot} style={{ left: `${(xF(series.length - 1) / GW) * 100}%`, top: `${(yF(last.score) / GH) * 100}%` }} />
    </div>
  )
}

export default function VitalsScoreCard({
  score,
  series,
  loggedDays,
  onTalk,
  visible,
}: {
  score: VitalsScore
  series: ScorePoint[]
  loggedDays: number
  onTalk: () => void
  visible: boolean
}) {
  const [open, setOpen] = useState(true)
  const big = useCountUp(score.score, visible)
  const building = loggedDays < 5
  const filled = Math.min(loggedDays, 5)
  // recent window oldest → newest for the in-card glance graph
  const graph = [...series].slice(0, 30).reverse()

  const seeHistory = () =>
    document.getElementById('score-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <div className={styles.left}>
          <div className={styles.big}>{big}<span className={styles.of}>/100</span></div>
          <div className={styles.verdict}>{VERDICT[score.tier]}</div>
        </div>
        <button type="button" className={styles.spark} onClick={seeHistory}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5" /><path d="M4 15l5-5 4 3 6-7" /></svg>
          see history
        </button>
      </div>

      <MiniGraph series={graph} />

      <p className={styles.line}>{whyLine(score)}</p>

      {building && (
        <div className={styles.build}>
          <span className={styles.buildPips} aria-hidden>
            {[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= filled ? styles.on : ''} />)}
          </span>
          <span>Building your trend · <b>{filled} of 5</b> days logged</span>
        </div>
      )}

      <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span>How it&rsquo;s scored</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none' }}><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <>
          <div className={styles.breakdown}>
            {score.subs.map(s => (
              <div key={s.key} className={styles.brow}>
                <div className={styles.bname}>
                  <span className={styles.bnameTop}>
                    {s.label.replace(' vs baseline', '')}
                    {s.personal && <span className={styles.personal}>personal</span>}
                  </span>
                  <div className={styles.bbarTrack}><div className={styles.bbarFill} style={{ width: visible && s.score != null ? `${s.score}%` : 0 }} /></div>
                  {s.score != null ? <TierMeter score={s.score} className={styles.browTier} /> : <span className={styles.bNoData}>no reading today</span>}
                </div>
                <span className={styles.bscore}>{s.score ?? '—'}</span>
                <span className={styles.bweight}>×{s.weight.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <p className={styles.foot}>Missing a reading? The score re-balances across what it has, so a gap never drags you down. HRV and resting HR are measured against your own baseline, not a generic target.</p>
        </>
      )}

      <button type="button" className={`${styles.spark} ${styles.talk}`} onClick={onTalk}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5.5h14a2.2 2.2 0 0 1 2.2 2.2v6.4a2.2 2.2 0 0 1-2.2 2.2h-7.2L7 19.5v-3.2H5A2.2 2.2 0 0 1 2.8 14.1V7.7A2.2 2.2 0 0 1 5 5.5Z" /></svg>
        talk to Vee
      </button>
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import type { QuizCustomCtx } from '@/components/Quiz'
import styles from './widgets.module.css'

/**
 * Bespoke per-question widgets for the Vitals quiz, ported 1:1 from the
 * signed-off concepts in public/vitals-quiz-concepts-preview.html:
 *   1. sleep-rhythm line   — moons settle onto a 7-night timeline per pattern
 *   2. day-arc             — sunrise→night gradient arc, coffee marker at cutoff
 *   3. focus ring          — a mint needle swings to the pick, the node blooms
 *   4. pin-chips           — chips snap a pin in, "none" clears, "other" reveals text
 *
 * Answer VALUES are the contract with the advice engine — keep them EXACT.
 * Each widget owns the question body; the engine drives advance/footer/title.
 */

// ── shared icon set (matches the preview) ────────────────────────────────────
const P: Record<string, React.ReactNode> = {
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  calendar: <path d="M7 3v3M17 3v3M3.5 9h17M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />,
  shuffle: <path d="M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7M21 16v5h-5M14 14l7 7" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></>,
  coffee: <path d="M4 9h12v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9zM16 10h2a2 2 0 0 1 0 4h-2M7 4v2M11 4v2" />,
  dusk: <path d="M3 17h18M7 17a5 5 0 0 1 10 0M12 3v4M5 9l1.5 1.5M19 9l-1.5 1.5" />,
  spark: <path d="M12 3v4M12 17v4M5 12H1M23 12h-4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />,
  muscle: <path d="M7 11V7a3 3 0 0 1 6 0c0 2 1 3 3 3h2a2 2 0 0 1 2 2c0 4-3 7-8 7-4 0-7-2-7-6 0-2 1-3 2-2z" />,
  brain: <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 0V4zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 0" />,
  flag: <path d="M5 21V4M5 4h11l-1.5 3L16 10H5" />,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.4" /></>,
  heart: <path d="M12 20s-7-4.5-9.5-9C1 8 2.5 4.5 6 4.5c2 0 3 1.3 4 2.5 1-1.2 2-2.5 4-2.5 3.5 0 5 3.5 3.5 6.5C19 15.5 12 20 12 20z" />,
  gauge: <path d="M4 15a8 8 0 0 1 16 0M12 15l3.5-3" />,
  pill: <><rect x="3" y="8" width="18" height="8" rx="4" /><path d="M12 8v8" /></>,
  cycle: <path d="M5 12a7 7 0 0 1 12-4.5M19 12a7 7 0 0 1-12 4.5M17 4v3.5h-3.5M7 20v-3.5h3.5" />,
  plus: <path d="M12 6v12M6 12h12" />,
  dash: <path d="M6 12h12" />,
}
function Glyph({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24">{P[name]}</svg>
}

// ── 1. sleep rhythm ──────────────────────────────────────────────────────────
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const sleepPatterns: Record<string, (i: number) => number> = {
  steady: () => 50,
  workday_consistent: (i) => (i >= 5 ? 70 : 46),
  irregular: (i) => [40, 68, 35, 75, 50, 30, 62][i],
}
const sleepOpts: [string, string, string, string][] = [
  ['moon', 'steady', 'about the same time', 'steady'],
  ['calendar', 'workday steady', 'later on weekends', 'workday_consistent'],
  ['shuffle', 'all over', 'or shift work', 'irregular'],
]

export function SleepRhythmWidget({ value, pick }: QuizCustomCtx) {
  const on = value != null && value in sleepPatterns
  const fn = on ? sleepPatterns[value] : null
  return (
    <div className={styles.root}>
      <div className={`${styles.rhythm} ${on ? styles.rhythmOn : ''}`}>
        <div className={styles.rline} />
        <div className={styles.nights}>
          {DAYS.map((d, i) => (
            <div className={styles.night} key={i}>
              <div className={styles.moon} style={{ top: (fn ? fn(i) : 50) + '%' }} />
              <div className={styles.dayname}>{d}</div>
            </div>
          ))}
        </div>
      </div>
      <div className={`${styles.opts} ${styles.grid2}`} style={{ marginTop: 16 }}>
        {sleepOpts.map(([ic, label, sub, v]) => (
          <button
            key={v}
            type="button"
            className={`${styles.opt} ${value === v ? styles.optSel : ''}`}
            onClick={() => pick(v)}
            aria-pressed={value === v}
          >
            <Glyph name={ic} />
            <span><span className={styles.ol}>{label}</span> <span className={styles.os}>{sub}</span></span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── 2. day arc ───────────────────────────────────────────────────────────────
const ARC = 'M10,130 Q160,-30 310,130'
const caffData: [string, string, string, number | null][] = [
  ['sun', 'morning', 'morning', 0.16],
  ['coffee', 'early afternoon', 'early_afternoon', 0.42],
  ['dusk', 'late', 'late', 0.68],
  ['moon', 'none', 'none', null],
]

export function DayArcWidget({ value, pick }: QuizCustomCtx) {
  const liveRef = useRef<SVGPathElement | null>(null)
  const [len, setLen] = useState(0)
  useEffect(() => { if (liveRef.current) setLen(liveRef.current.getTotalLength()) }, [])

  const sel = caffData.find(c => c[2] === value)
  const t = sel ? sel[3] : null
  const hasCut = t != null && len > 0
  const pt = hasCut ? liveRef.current!.getPointAtLength(len * t) : null

  return (
    <div className={styles.root}>
      <div className={styles.arcWrap}>
        <svg viewBox="0 0 320 150">
          <defs>
            <linearGradient id="vitalsDayGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="45%" stopColor="#6ee7b7" />
              <stop offset="75%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
          </defs>
          <path d={ARC} fill="none" stroke="rgba(255,255,255,.10)" strokeWidth="3" strokeLinecap="round" />
          <path ref={liveRef} d={ARC} fill="none" stroke="url(#vitalsDayGrad)" strokeWidth="3" strokeLinecap="round" />
          {/* night overlay dims everything past the cutoff */}
          <path
            d={ARC} fill="none" stroke="#0a0c11" strokeWidth="5" strokeLinecap="round"
            style={{ transition: 'opacity .4s' }}
            opacity={hasCut ? 1 : 0}
            strokeDasharray={hasCut ? `${len * (1 - t)} ${len}` : len || 1000}
            strokeDashoffset={hasCut ? -len * t : len || 1000}
          />
          {pt && (
            <g transform={`translate(${pt.x},${pt.y})`}>
              <circle r="13" fill="#0c0e0d" stroke="#6ee7b7" strokeWidth="1.5" />
              <svg width="15" height="15" x="-7.5" y="-7.5" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{P[sel![0]]}</svg>
            </g>
          )}
        </svg>
      </div>
      <div className={styles.arcLabel}><span>6am</span><span>noon</span><span>6pm</span><span>night</span></div>
      <div className={`${styles.opts} ${styles.grid2}`} style={{ marginTop: 16 }}>
        {caffData.map(([ic, label, v]) => (
          <button
            key={v}
            type="button"
            className={`${styles.opt} ${value === v ? styles.optSel : ''}`}
            onClick={() => pick(v)}
            aria-pressed={value === v}
          >
            <Glyph name={ic} />
            <span><span className={styles.ol}>{label}</span></span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── 3. focus ring ────────────────────────────────────────────────────────────
const limitData: [string, string, string][] = [
  ['sleep', 'sleep', 'not enough'],
  ['energy', 'energy', 'always tired'],
  ['soreness', 'soreness', 'beat up'],
  ['stress', 'stress', 'wired'],
  ['plateau', 'stuck', 'no progress'],
  ['optimize', 'optimize', 'all good'],
]
// single-stroke glyph just outside each node (sleep, energy, soreness, stress, plateau, optimize)
const limitGlyph = [
  'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  'M13 2 5 14h6l-1 8 9-12h-6z',
  'M12 22a6 6 0 0 0 6-6c0-4-3-6-6-12-3 6-6 8-6 12a6 6 0 0 0 6 6z',
  'M3 12c2-5 4 5 6 0s4-5 6 0 4 5 6 0',
  'M3 12h18',
  'M12 20V6M6 12l6-6 6 6',
]
const NR = 38
const nodeAng = (i: number) => ((-90 + 60 * i) * Math.PI) / 180

export function FocusRingWidget({ value, pick }: QuizCustomCtx) {
  const idx = limitData.findIndex(o => o[0] === value)
  const on = idx >= 0
  const nodes = limitData.map((_, i) => ({ i, x: 50 + NR * Math.cos(nodeAng(i)), y: 50 + NR * Math.sin(nodeAng(i)) }))
  return (
    <div className={styles.root}>
      <div className={styles.gemWrap}>
        <svg className={styles.gem} viewBox="0 0 100 100">
          <circle className={styles.ringBg} cx="50" cy="50" r="38" />
          {nodes.map(({ i, x, y }) => (
            <line key={`s${i}`} className={`${styles.spoke} ${idx === i ? styles.spokeSel : ''}`} x1="50" y1="50" x2={x.toFixed(2)} y2={y.toFixed(2)} />
          ))}
          <g className={`${styles.needle} ${on ? styles.needleOn : ''}`} style={{ transform: `rotate(${on ? 60 * idx : 0}deg)` }}>
            <line x1="50" y1="50" x2="50" y2="15" stroke="#6ee7b7" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="50" cy="15" r="2.4" fill="#6ee7b7" />
          </g>
          {nodes.map(({ i, x, y }) => (
            <circle
              key={`n${i}`}
              className={`${styles.node} ${idx === i ? styles.nodeSel : ''}`}
              cx={x.toFixed(2)} cy={y.toFixed(2)} r={idx === i ? 5 : 3.4}
              onClick={() => pick(limitData[i][0])}
            />
          ))}
          {nodes.map(({ i }) => {
            const a = nodeAng(i), s = 0.3
            const ix = 50 + 48 * Math.cos(a), iy = 50 + 48 * Math.sin(a)
            return (
              <g key={`i${i}`} className={`${styles.nicon} ${idx === i ? styles.niconSel : ''}`} transform={`translate(${(ix - 12 * s).toFixed(2)},${(iy - 12 * s).toFixed(2)}) scale(${s})`}>
                <path d={limitGlyph[i]} />
              </g>
            )
          })}
          <circle className={styles.gemCenter} cx="50" cy="50" r="2.2" />
        </svg>
        <div className={styles.gemReadout}>
          {on ? (
            <><span className={styles.gl}>{limitData[idx][1]}</span><span className={styles.gs}>{limitData[idx][2]}</span></>
          ) : (
            <span className={`${styles.gl} ${styles.glMuted}`}>tap one</span>
          )}
        </div>
      </div>
      <div className={`${styles.opts} ${styles.grid2}`} style={{ marginTop: 12 }}>
        {limitData.map(([v, label]) => (
          <button
            key={v}
            type="button"
            className={`${styles.opt} ${value === v ? styles.optSel : ''}`}
            onClick={() => pick(v)}
            aria-pressed={value === v}
          >
            <span className={styles.ol}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── 4. pin chips ─────────────────────────────────────────────────────────────
const pinData: [string, string, string][] = [
  ['heart', 'injury', 'injury'],
  ['gauge', 'hr or sleep condition', 'condition'],
  ['pill', 'meds or supplements', 'medication'],
  ['cycle', 'menstrual cycle', 'cycle'],
  ['plus', 'something else', 'other'],
  ['dash', 'none of these', 'none'],
]

export function PinChipsWidget({ values, toggle, otherText, setOther }: QuizCustomCtx) {
  const otherOpen = values.includes('other')
  return (
    <div className={styles.root}>
      <div className={styles.pins}>
        {pinData.map(([ic, label, v]) => (
          <button
            key={v}
            type="button"
            className={`${styles.pin} ${values.includes(v) ? styles.pinSel : ''}`}
            onClick={() => toggle(v)}
            aria-pressed={values.includes(v)}
          >
            <svg className={styles.ic} viewBox="0 0 24 24">{P[ic]}</svg>
            <span className={styles.pl}>{label}</span>
            <span className={styles.pinDot}>
              <svg viewBox="0 0 16 16"><path d="M3 8.5 7 12l6-7.5" /></svg>
            </span>
          </button>
        ))}
      </div>
      <div className={`${styles.moreField} ${otherOpen ? styles.moreFieldOpen : ''}`}>
        <textarea
          value={otherText}
          onChange={e => setOther(e.target.value)}
          placeholder="tell me in a few words..."
        />
      </div>
    </div>
  )
}

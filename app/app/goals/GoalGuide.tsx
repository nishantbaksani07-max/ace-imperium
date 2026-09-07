'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import styles from './veeNoticed.module.css'
import type { GuideItem, GuideModule } from '@/lib/insights/goalGuide'

/**
 * GoalGuide — Layer B of the goal surface. Each recommendation is a real corner of
 * the app with a short, powerful coach insight. The KEY PHRASE inside the insight
 * is highlighted and clickable: tapping it opens a professional, dated demo (copied
 * from the Vitals goal-picker viz language) that shows exactly what the phrase
 * means. The deep, personalised read is one tap further, in the golden URL.
 */

const ICON: Record<GuideModule, ReactNode> = {
  train: <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />,
  macros: <path d="M12 3.2c1.8 2.6 3 4.3 3 6.8a3 3 0 0 1-6 0c0-1 .3-1.9.9-2.8" />,
  weight: <path d="M4 20h16M6.6 20l1.7-9h7.4l1.7 9M12 8a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 12 8" />,
  water: <path d="M12 3.5s5.5 6 5.5 10.5a5.5 5.5 0 0 1-11 0C6.5 9.5 12 3.5 12 3.5z" />,
  recovery: <path d="M3 12h4l2 5 4-13 2 8h6" />,
  supplements: <><rect x="4" y="9" width="16" height="6" rx="3" /><path d="M12 9v6" /></>,
  brand: <path d="M4 19V5M4 19h16M8 16l3-4 3 2 4-6" />,
  finance: <path d="M4 19V5M4 19h16M8 15l3-3 3 2 4-5" />,
  notes: <path d="M5 19l1.2-4.2L16.5 4.5a2.1 2.1 0 0 1 3 3L9.2 17.8 5 19zM14.5 6.5l3 3" />,
}

const PLAY = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
const ARROW = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
const VMARK = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 7l7 11 7-11" /></svg>
const CLOSE = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>

type DemoCfg =
  | { kind: 'bars'; goalTag: string; labels: string[]; vals: number[]; nums?: string[]; hitFrom?: number; hitAll?: boolean; lowIdx?: number; goalFrac: number; trend?: boolean; cap: string }
  | { kind: 'line'; fromTag: string; goalTag: string; down?: boolean; cap: string }
  | { kind: 'ring'; tag: string; cap: string }

const DEMO: Record<GuideModule, DemoCfg> = {
  train: { kind: 'bars', goalTag: 'your goal', labels: ['May 1', 'May 4', 'May 8', 'May 11', 'May 15'], vals: [0.45, 0.5, 0.64, 0.8, 0.93], nums: ['60', '60', '62.5', '65', '67.5'], hitFrom: 3, goalFrac: 1.14, trend: true, cap: 'Beat last time by a little, and the bar climbs week by week.' },
  macros: { kind: 'bars', goalTag: 'target', labels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], vals: [0.86, 0.9, 0.3, 0.88, 0.92, 0.86, 0.9], hitAll: true, lowIdx: 2, goalFrac: 0.92, cap: 'Most days you hit it. The one low day is what holds you back.' },
  weight: { kind: 'line', fromTag: 'today', goalTag: 'target', down: true, cap: 'The daily scale jumps around. The trend tells the truth.' },
  recovery: { kind: 'line', fromTag: 'today', goalTag: 'baseline', cap: 'One bad night is noise. The average is the signal.' },
  brand: { kind: 'line', fromTag: 'now', goalTag: 'your number', cap: 'Two snapshots draw a slope. The slope predicts your number.' },
  finance: { kind: 'line', fromTag: 'now', goalTag: 'target', cap: 'A balance hides the dips. The trend shows where it leaks.' },
  water: { kind: 'ring', tag: 'today', cap: 'Small daily taps keep a floor you never feel slipping.' },
  supplements: { kind: 'ring', tag: 'on track', cap: 'Consistency is the whole game. The streak moves the marker.' },
  notes: { kind: 'ring', tag: 'today', cap: 'One honest line a day gives this goal a pulse I can read.' },
}

function Glyph({ m }: { m: GuideModule }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICON[m]}
    </svg>
  )
}

// One shared grid so every demo lines up to the same baseline and edges.
const AX = 122, BAR_TOP = 44, L = 26, R = 274, DATE_Y = 142

/** A smooth curve through points (Catmull-Rom to cubic bezier) — the pro look. */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return ''
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? pts[i + 1]
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0]},${p2[1]}`
  }
  return d
}

function BarsViz({ c }: { c: Extract<DemoCfg, { kind: 'bars' }> }) {
  const n = c.vals.length
  const slot = (R - L) / n
  const barW = Math.min(slot * 0.42, 22)
  const goalY = AX - c.goalFrac * (AX - BAR_TOP)
  const topY = (v: number) => AX - v * (AX - BAR_TOP)
  const cx = (i: number) => L + slot * (i + 0.5)
  return (
    <svg className={styles.dvSvg} viewBox="0 0 300 150" aria-hidden>
      <text className={styles.dvTag} x={R} y={goalY - 8} textAnchor="end">{c.goalTag}</text>
      <line className={styles.dvGline} x1={L} y1={goalY} x2={R} y2={goalY} strokeDasharray="2 6" />
      <line className={styles.dvAxis} x1={L} y1={AX} x2={R} y2={AX} />
      {c.vals.map((v, i) => {
        const ty = topY(v)
        const isLow = c.lowIdx === i
        const isHit = !isLow && (c.hitAll || (c.hitFrom != null && i >= c.hitFrom))
        const cls = isLow ? styles.dvLow : isHit ? styles.dvHit : styles.dvBar
        return (
          <g key={i}>
            <rect className={cls} x={cx(i) - barW / 2} y={ty} width={barW} height={AX - ty} rx="3" style={{ animationDelay: `${0.16 + i * 0.16}s` }} />
            {c.nums && <text className={`${styles.dvNum} ${isHit ? styles.dvNumHit : ''}`} x={cx(i)} y={ty - 9} textAnchor="middle" style={{ animationDelay: `${0.5 + i * 0.16}s` }}>{c.nums[i]}</text>}
            <text className={styles.dvDate} x={cx(i)} y={DATE_Y} textAnchor="middle">{c.labels[i]}</text>
          </g>
        )
      })}
      {c.trend && <path className={styles.dvTrend} d={smoothPath(c.vals.map((v, i) => [cx(i), topY(v)]))} fill="none" style={{ animationDelay: `${0.16 + n * 0.16}s` }} />}
    </svg>
  )
}

function LineViz({ c }: { c: Extract<DemoCfg, { kind: 'line' }> }) {
  const xs = [L, 88, 150, 212, R]
  const ys = c.down ? [54, 70, 64, 88, 104] : [104, 90, 96, 70, 40]
  const pts = xs.map((x, i) => [x, ys[i]] as [number, number])
  const goalY = c.down ? 108 : 34
  const line = smoothPath(pts)
  const area = `${line} L${R},${AX} L${L},${AX} Z`
  return (
    <svg className={styles.dvSvg} viewBox="0 0 300 150" aria-hidden>
      <defs>
        <linearGradient id={`dvArea-${c.fromTag}-${c.goalTag}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--mint)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--mint)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line className={styles.dvGline} x1={L} y1={goalY} x2={R} y2={goalY} strokeDasharray="2 6" />
      <line className={styles.dvAxis} x1={L} y1={AX} x2={R} y2={AX} />
      <path className={styles.dvArea} d={area} fill={`url(#dvArea-${c.fromTag}-${c.goalTag})`} stroke="none" />
      <path className={styles.dvLine} d={line} fill="none" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle className={styles.dvDot} cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="4.2" />
      <text className={styles.dvDate} x={L} y={DATE_Y} textAnchor="start">{c.fromTag}</text>
      <text className={styles.dvDate} x={R} y={DATE_Y} textAnchor="end">{c.goalTag}</text>
    </svg>
  )
}

function RingViz({ c }: { c: Extract<DemoCfg, { kind: 'ring' }> }) {
  return (
    <svg className={styles.dvSvg} viewBox="0 0 300 150" aria-hidden>
      <circle className={styles.dvRingBg} cx="150" cy="70" r="44" strokeWidth="11" fill="none" />
      <circle className={styles.dvRing} cx="150" cy="70" r="44" strokeWidth="11" fill="none" strokeLinecap="round" strokeDasharray="276" strokeDashoffset="77" transform="rotate(-90 150 70)" />
      <path className={styles.dvCheck} d="M137 71l9 9 18-20" fill="none" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <text className={styles.dvDate} x="150" y={DATE_Y} textAnchor="middle">{c.tag}</text>
    </svg>
  )
}

function DemoViz({ m }: { m: GuideModule }) {
  const c = DEMO[m]
  if (c.kind === 'bars') return <BarsViz c={c} />
  if (c.kind === 'line') return <LineViz c={c} />
  return <RingViz c={c} />
}

/** The insight line, with its key phrase turned into the highlighted demo trigger. */
function WhyLine({ item, onOpen }: { item: GuideItem; onOpen: () => void }) {
  const i = item.why.indexOf(item.key)
  if (i < 0) return <p className={styles.giWhy}>{item.why}</p>
  return (
    <p className={styles.giWhy}>
      {item.why.slice(0, i)}
      <button type="button" className={styles.giKey} onClick={onOpen} aria-label={`See what "${item.key}" means`}>
        {item.key}<span className={styles.giKeyPlay}>{PLAY}</span>
      </button>
      {item.why.slice(i + item.key.length)}
    </p>
  )
}

export default function GoalGuide({ items }: { items: GuideItem[] }) {
  const [sheet, setSheet] = useState<GuideItem | null>(null)

  useEffect(() => {
    if (!sheet) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sheet])

  if (!items || items.length === 0) return null

  return (
    <div className={styles.guide}>
      <div className={styles.guideHd}>{VMARK} to move this, in Vitality</div>
      <div className={styles.giList}>
        {items.map((it) => (
          <div key={it.module} className={`${styles.gi} ${it.using ? styles.giUse : styles.giNew}`}>
            <span className={styles.giThumb}><Glyph m={it.module} /></span>
            <div className={styles.giText}>
              <Link href={it.href} className={styles.giLabel}>
                {it.label}
                {!it.using && <span className={styles.giNewTag}>try it</span>}
              </Link>
              <WhyLine item={it} onOpen={() => setSheet(it)} />
            </div>
          </div>
        ))}
      </div>

      <div
        className={`${styles.gScrim} ${sheet ? styles.gScrimOpen : ''}`}
        onClick={(e) => { if (e.target === e.currentTarget) setSheet(null) }}
      >
        <div className={styles.gSheet} role="dialog" aria-modal="true">
          <div className={styles.gHandle} />
          <button type="button" className={styles.gSheetClose} aria-label="close" onClick={() => setSheet(null)}>{CLOSE}</button>
          {sheet && (
            <div key={sheet.module}>
              <div className={styles.gSheetHead}>
                <span className={styles.gSheetGlyph}><Glyph m={sheet.module} /></span>
                <span className={styles.gSheetTitle}>{sheet.label}</span>
              </div>
              <div className={styles.gVizPanel}><DemoViz m={sheet.module} /></div>
              <p className={styles.gVizCap}>{DEMO[sheet.module].cap}</p>
              <Link href={sheet.href} className={styles.gOpenCta}>
                {sheet.using ? 'open it' : 'try it now'} {ARROW}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

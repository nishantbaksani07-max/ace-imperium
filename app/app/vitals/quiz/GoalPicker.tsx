'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardHeaderGem from '@/app/app/DashboardHeaderGem'
import { pickVitalsGoal } from '@/app/app/vitals/goalActions'
import type { VitalsGoalMetric } from '@/lib/vitals/healthContext'
import type { VitalsHealthFlag } from '@/lib/preferences'
import styles from './goalPicker.module.css'

/**
 * Vitals goal picker — gem hero, one cohesive color tree of goal cards, and a
 * visual "how it works" sheet per goal (show, don't tell). Ported 1:1 from the
 * approved preview (public/vitals-goal-picker-preview.html). Each goal carries
 * its own --accent (a leaf off the mint tree). The chosen metric drives the
 * goal directly (no quiz). Route stays /app/vitals/quiz so redirects hold.
 */

const CheckIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 6.5" /></svg>
)
const CloseIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
)

/* ── card glyphs (keyed by metric) ─────────────────────────────── */
const GLYPHS: Record<VitalsGoalMetric, React.ReactNode> = {
  sleep: (
    <svg className={styles.gSleep} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 14.5A7.5 7.5 0 1 1 11 4.2a6 6 0 0 0 9 10.3Z" />
      <path className={styles.spark} d="M17 4.3v2M16 5.3h2" opacity="0.35" />
      <path className={styles.spark} d="M19.6 8.4v1.4M18.9 9.1h1.4" opacity="0.35" />
    </svg>
  ),
  recovery: (
    <svg className={styles.gRecovery} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path className={styles.trend} d="M3 16.5l5-5 4 3 6.5-7.5" strokeDasharray="34" strokeDashoffset="0" />
      <path d="M15 6.5h4.5V11" />
    </svg>
  ),
  hrv: (
    <svg className={styles.gHrv} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path className={styles.wave} d="M2 12c2-5 4.4-5 6.4 0s4.4 5 6.4 0 4.4-5 6.2 0" />
    </svg>
  ),
  strain: (
    <svg className={styles.gStrain} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <rect x="3.5" y="14" width="4" height="7" rx="1.4" />
      <rect x="10" y="9.5" width="4" height="11.5" rx="1.4" />
      <rect x="16.5" y="5" width="4" height="16" rx="1.4" />
    </svg>
  ),
}

/* ── per-goal visual (the sheet). viewBox ~300x140, strokes read --accent ── */
const VIZ: Record<VitalsGoalMetric, React.ReactNode> = {
  sleep: (
    <svg className={styles.viz} viewBox="0 0 300 140">
      <text className={styles.vizTag} x="18" y="24" textAnchor="start">your goal</text>
      <line className={styles.gline} x1="18" y1="30" x2="282" y2="30" strokeWidth="1.4" strokeDasharray="3 5" />
      <line className={styles.axis} x1="14" y1="120" x2="286" y2="120" />
      <rect className={styles.bar} x="26" y="100" width="20" height="20" rx="6" style={{ animationDelay: '.05s' }} />
      <rect className={styles.bar} x="64" y="90" width="20" height="30" rx="6" style={{ animationDelay: '.11s' }} />
      <rect className={styles.bar} x="102" y="80" width="20" height="40" rx="6" style={{ animationDelay: '.17s' }} />
      <rect className={styles.bar} x="140" y="70" width="20" height="50" rx="6" style={{ animationDelay: '.23s' }} />
      <rect className={styles.bar} x="178" y="60" width="20" height="60" rx="6" style={{ animationDelay: '.29s' }} />
      <rect className={`${styles.bar} ${styles.hit}`} x="216" y="50" width="20" height="70" rx="6" style={{ animationDelay: '.35s' }} />
      <rect className={`${styles.bar} ${styles.hit}`} x="254" y="44" width="20" height="76" rx="6" style={{ animationDelay: '.41s' }} />
    </svg>
  ),
  recovery: (
    <svg className={styles.viz} viewBox="0 0 300 144">
      <circle cx="150" cy="78" r="44" stroke="rgba(233,239,233,.1)" strokeWidth="9" fill="none" />
      <circle className={styles.ring} cx="150" cy="78" r="44" strokeWidth="9" fill="none" strokeLinecap="round" strokeDasharray="276" strokeDashoffset="72" transform="rotate(-90 150 78)" />
      <path className={styles.ln} d="M136 84l14-15 14 15" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  hrv: (
    <svg className={styles.viz} viewBox="0 0 300 140">
      <line className={styles.axis} x1="14" y1="72" x2="286" y2="72" strokeDasharray="2 6" />
      <path className={`${styles.ln} ${styles.draw}`} d="M16 72 L30 64 L42 82 L54 58 L66 84 L78 62 L90 78 L100 72 C124 72 132 40 154 40 S 196 100 218 90 S 262 44 286 58" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <text className={styles.vizDay} x="40" y="118" textAnchor="middle">today</text>
      <text className={styles.vizTag} x="250" y="118" textAnchor="middle">steadier</text>
    </svg>
  ),
  strain: (
    <svg className={styles.viz} viewBox="0 0 300 140">
      <line className={styles.axis} x1="14" y1="120" x2="286" y2="120" />
      <line className={styles.ceil} x1="20" y1="96" x2="288" y2="34" strokeWidth="1.5" strokeDasharray="4 5" />
      <text className={`${styles.vizTag} ${styles.ceil}`} x="288" y="28" textAnchor="end">what you can handle</text>
      <rect className={`${styles.bar} ${styles.hit}`} x="30" y="104" width="26" height="16" rx="5" style={{ fillOpacity: 0.4, animationDelay: '.05s' }} />
      <rect className={`${styles.bar} ${styles.hit}`} x="73" y="96" width="26" height="24" rx="5" style={{ fillOpacity: 0.55, animationDelay: '.12s' }} />
      <rect className={`${styles.bar} ${styles.hit}`} x="116" y="86" width="26" height="34" rx="5" style={{ fillOpacity: 0.7, animationDelay: '.19s' }} />
      <rect className={`${styles.bar} ${styles.hit}`} x="159" y="74" width="26" height="46" rx="5" style={{ fillOpacity: 0.82, animationDelay: '.26s' }} />
      <rect className={`${styles.bar} ${styles.hit}`} x="202" y="60" width="26" height="60" rx="5" style={{ fillOpacity: 0.92, animationDelay: '.33s' }} />
      <rect className={`${styles.bar} ${styles.hit}`} x="245" y="50" width="26" height="70" rx="5" style={{ fillOpacity: 1, animationDelay: '.40s' }} />
    </svg>
  ),
}

interface GoalOption {
  metric: VitalsGoalMetric
  accent: string
  title: string
  sub: string
  cap: string
  read: React.ReactNode
  meta: string
}

const GOALS: GoalOption[] = [
  { metric: 'sleep', accent: '#57cfc9', title: 'Sleep more', sub: 'get your hours up',
    cap: 'Stack better nights.', read: <>Win each <span className={styles.hl}>night</span>, and the week climbs.</>, meta: 'feels different in about 2 weeks' },
  { metric: 'recovery', accent: '#6ee7b7', title: 'Recover better', sub: 'raise your recovery',
    cap: 'Wake up readier.', read: <>Show up daily, and the <span className={styles.hl}>ring fills</span> higher.</>, meta: 'climbs over 3 to 4 weeks' },
  { metric: 'hrv', accent: '#76e6d2', title: 'Calmer and more resilient', sub: 'raise your HRV',
    cap: 'Find a calmer rhythm.', read: <>Stay steady, and the jagged line settles <span className={styles.hl}>calmer</span>.</>, meta: 'a slow mover. 4 to 6 weeks' },
  { metric: 'strain', accent: '#93efa3', title: 'Train harder', sub: 'build your capacity',
    cap: 'Do more, safely.', read: <>Do more, and your <span className={styles.hl}>limit rises</span> right with you.</>, meta: 'build over about 4 weeks' },
]

const SAFETY: { key: VitalsHealthFlag; label: string }[] = [
  { key: 'injury', label: 'an injury' },
  { key: 'medication', label: 'medication' },
  { key: 'condition', label: 'a condition' },
  { key: 'cycle', label: 'a cycle' },
]

export default function GoalPicker() {
  const router = useRouter()
  const [metric, setMetric] = useState<VitalsGoalMetric | null>(null)
  const [flags, setFlags] = useState<Set<VitalsHealthFlag>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheetMetric, setSheetMetric] = useState<VitalsGoalMetric | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const sheetGoal = GOALS.find(g => g.metric === sheetMetric) ?? null

  function select(m: VitalsGoalMetric) {
    setMetric(m)
  }
  function toggleFlag(f: VitalsHealthFlag) {
    setFlags(prev => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f); else next.add(f)
      return next
    })
  }
  function openSheet(m: VitalsGoalMetric) {
    setSheetMetric(m)
    setSheetOpen(true)
  }
  function closeSheet() { setSheetOpen(false) }

  async function confirm() {
    if (!metric || saving) return
    setSaving(true)
    setError(null)
    const res = await pickVitalsGoal(metric, Array.from(flags))
    if (res.ok) {
      router.push('/app/vitals/quiz/goal')
    } else {
      setError(res.error || 'Something went wrong. try again.')
      setSaving(false)
    }
  }

  // Esc closes the sheet.
  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSheet() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sheetOpen])

  return (
    <div className={styles.root}>
      <main className={styles.page}>
        <div className={styles.atmosphere} aria-hidden />
        <div className={styles.grain} aria-hidden />
        <div className={styles.shell}>
          <div className={styles.gemWrap}><DashboardHeaderGem size={220} /></div>

          <div className={styles.eyebrow}><span className={styles.tick}>&#10003;</span> paired</div>
          <h1 className={styles.title}>What do you want to work on?</h1>
          <p className={styles.lede}>Pick one. I size it to your body, then coach you there. Tap the <span className={styles.ledeI}>i</span> to see how a goal works.</p>

          <div className={styles.list}>
            {GOALS.map((g, i) => {
              const on = metric === g.metric
              return (
                <button
                  key={g.metric}
                  type="button"
                  className={`${styles.card} ${on ? `${styles.on} ${styles.pop}` : ''}`}
                  style={{ animationDelay: `${(0.5 + i * 0.08).toFixed(2)}s`, '--accent': g.accent } as React.CSSProperties}
                  onClick={() => select(g.metric)}
                  aria-pressed={on}
                >
                  <span className={styles.glyph}>
                    {GLYPHS[g.metric]}
                    <span className={styles.badge}>{CheckIcon}</span>
                  </span>
                  <span className={styles.body}>
                    <span className={styles.cardTitle}>{g.title}</span>
                    <span className={styles.cardSub}>{g.sub}</span>
                  </span>
                  <span
                    className={styles.info}
                    role="button"
                    tabIndex={0}
                    aria-label={`how ${g.title} works`}
                    onClick={(e) => { e.stopPropagation(); openSheet(g.metric) }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); openSheet(g.metric) } }}
                  >i</span>
                </button>
              )
            })}
          </div>

          <div className={styles.safety}>
            <div className={styles.safetyLabel}>Anything I should know, so my advice stays safe?</div>
            <div className={styles.chips}>
              {SAFETY.map(s => (
                <button
                  key={s.key}
                  type="button"
                  className={`${styles.chip} ${flags.has(s.key) ? styles.chipOn : ''}`}
                  onClick={() => toggleFlag(s.key)}
                  aria-pressed={flags.has(s.key)}
                >{s.label}</button>
              ))}
              <button
                type="button"
                className={`${styles.chip} ${flags.size === 0 ? styles.chipOn : ''}`}
                onClick={() => setFlags(new Set())}
                aria-pressed={flags.size === 0}
              >nothing</button>
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="button" className={styles.cta} disabled={!metric || saving} onClick={confirm}>
            {saving ? 'setting your goal…' : metric ? 'set my goal' : 'pick a goal'}
          </button>
        </div>
      </main>

      {/* visual detail sheet */}
      <div
        className={`${styles.scrim} ${sheetOpen ? styles.open : ''}`}
        onClick={(e) => { if (e.target === e.currentTarget) closeSheet() }}
        style={sheetGoal ? ({ '--accent': sheetGoal.accent } as React.CSSProperties) : undefined}
      >
        <div className={styles.sheet} role="dialog" aria-modal="true">
          <div className={styles.handle} />
          <button className={styles.sheetClose} aria-label="close" onClick={closeSheet}>{CloseIcon}</button>
          {sheetGoal && (
            <div key={sheetGoal.metric}>
              <div className={styles.sheetHead}>
                <div className={styles.sheetGlyph}>{GLYPHS[sheetGoal.metric]}</div>
                <div className={styles.sheetTitle}>{sheetGoal.title}</div>
              </div>
              <div className={styles.vizPanel}>{VIZ[sheetGoal.metric]}</div>
              <div className={styles.vizCap}>{sheetGoal.cap}</div>
              <div className={styles.vizRead}>{sheetGoal.read}</div>
              <div className={styles.vizMeta}>{sheetGoal.meta}</div>
              <button
                className={styles.sheetCta}
                onClick={() => { select(sheetGoal.metric); closeSheet() }}
              >Choose this goal</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

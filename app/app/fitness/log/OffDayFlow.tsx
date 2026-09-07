'use client'

import { useState } from 'react'
import styles from './offDayFlow.module.css'
import { kgToDisplay, displayToKg, unitLabel, type Units } from '@/lib/units'
import {
  type OffDayLevel,
  type OffDayLift,
  type OffDayTarget,
  buildOffDayPlan,
  RIR_COPY,
  OFF_HEADNOTE,
  OFF_BADGE,
} from './offDayPlan'

/**
 * Off-day / readiness flow — three calm cards opened from the logger header.
 *
 *   1. How are you feeling?   pick a readiness level (cozy checkmark)
 *   2. Today's eased session  every lift, labelled sets/reps/weight, editable
 *   3. Your weights are safe  reassurance + a "show me" graph proof
 *
 * On confirm it hands SplitLog the chosen level + the (possibly edited) per-lift
 * plan, which SplitLog applies to the live session. The science behind the cuts
 * lives in ./offDayPlan.
 */

interface OffDayFlowProps {
  lifts: OffDayLift[]
  units: Units
  onConfirm: (level: OffDayLevel, plan: Record<string, OffDayTarget>) => void
  /** Escalate to a deload week (a lighter pass through the whole split) instead
   *  of easing just today. Surfaced as a quiet third option on the first card. */
  onDeload?: () => void
  onClose: () => void
}

const LEVELS: { key: OffDayLevel; title: string; desc: string }[] = [
  { key: 'little', title: 'A little off', desc: 'Tired, poor sleep, a mild headache.' },
  { key: 'rough', title: 'Pretty rough', desc: 'Sick or drained, but still showing up.' },
]

const round1 = (n: number) => Math.round(n * 10) / 10

function PulseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2 5 4-14 2 9h6" /></svg>
}
function MoonIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z" /></svg>
}

export default function OffDayFlow({ lifts, units, onConfirm, onDeload, onClose }: OffDayFlowProps) {
  const [step, setStep] = useState(0)
  const [level, setLevel] = useState<OffDayLevel | null>(null)
  const [plan, setPlan] = useState<Record<string, OffDayTarget>>({})
  const [editing, setEditing] = useState<Record<string, boolean>>({})
  const [showProof, setShowProof] = useState(false)

  function pick(l: OffDayLevel) {
    setLevel(l)
    setPlan(buildOffDayPlan(l, lifts))
  }

  function adj(id: string, field: 'sets' | 'reps' | 'kg', dir: number) {
    setPlan(p => {
      const t = { ...p[id] }
      if (field === 'sets') t.sets = Math.max(1, Math.min(12, t.sets + dir))
      else if (field === 'reps') t.reps = Math.max(1, Math.min(30, t.reps + dir))
      else {
        const d = displayToKg(units === 'imperial' ? 5 : 2.5, units)
        t.kg = Math.max(0, round1(t.kg + dir * d))
      }
      return { ...p, [id]: t }
    })
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="Readiness">
      <div className={`${styles.sheet} ${step === 1 ? styles.sheetTall : ''}`} onClick={e => e.stopPropagation()}>
        <div className={styles.dots} aria-hidden>
          {[0, 1, 2].map(n => <span key={n} className={`${styles.dot} ${step === n ? styles.dotOn : ''}`} />)}
        </div>

        {/* ── Card 1 · readiness ── */}
        {step === 0 && (
          <div className={styles.card}>
            <p className={styles.eyebrow}>readiness</p>
            <h2 className={styles.h}>How are you feeling?</h2>
            <p className={styles.sub}>No PRs today. Pick one and we&apos;ll shape the session around it.</p>
            <div className={styles.levels}>
              {LEVELS.map(l => {
                const on = level === l.key
                return (
                  <button
                    key={l.key}
                    type="button"
                    className={`${styles.level} ${on ? styles.levelOn : ''}`}
                    onClick={() => pick(l.key)}
                  >
                    <span className={styles.levelMed}>{l.key === 'little' ? <PulseIcon /> : <MoonIcon />}</span>
                    <span className={styles.levelTx}>
                      <span className={styles.levelT}>{l.title}</span>
                      <span className={styles.levelD}>{l.desc}</span>
                    </span>
                    <span className={styles.levelRight}>
                      {on ? (
                        <span className={styles.chk}>
                          <svg viewBox="0 0 24 24"><circle className={styles.chkRing} cx="12" cy="12" r="11" /><path className={styles.chkTick} d="M7 12.5l3.2 3.2L17 8.5" /></svg>
                        </span>
                      ) : (
                        <span className={styles.meter} aria-hidden>
                          <i className={styles.dotOn} />
                          <i className={l.key === 'rough' ? styles.dotOn : styles.dotOff} />
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
            {level === 'rough' && (
              <div className={styles.restnote}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
                <span>Fever, body aches, or it&apos;s in your chest or stomach? Rest today instead.</span>
              </div>
            )}
            {onDeload && (
              <div className={styles.deloadSplit}>
                <div className={styles.deloadLead}>
                  <MoonIcon />
                  <span>A few rough ones lately?</span>
                </div>
                <button type="button" className={styles.deloadOpt} onClick={onDeload}>
                  <span className={styles.deloadOptTx}>
                    <span className={styles.deloadOptT}>Maybe a lighter week would help more</span>
                    <span className={styles.deloadOptD}>One easy pass through your split, then back to building.</span>
                  </span>
                  <span className={styles.deloadOptArr} aria-hidden>→</span>
                </button>
              </div>
            )}
            <div className={styles.actions}>
              <button type="button" className={styles.ghost} onClick={onClose}>cancel</button>
              <button type="button" className={styles.btn} disabled={!level} onClick={() => setStep(1)}>Continue</button>
            </div>
          </div>
        )}

        {/* ── Card 2 · eased session ── */}
        {step === 1 && level && (
          <div className={`${styles.card} ${styles.cardTall}`}>
            <div className={styles.c2head}>
              <div>
                <p className={styles.eyebrow}>today, eased</p>
                <p className={styles.c2sub}>{OFF_HEADNOTE[level]}</p>
              </div>
              <span className={styles.badge}>{OFF_BADGE[level]}</span>
            </div>
            <div className={`${styles.lifts} ${styles.playing}`}>
              {lifts.map((l, i) => {
                const t = plan[l.id]
                if (!t) return null
                const ed = !!editing[l.id]
                return (
                  <div key={l.id} className={styles.row} style={{ ['--i' as string]: i }}>
                    <div className={styles.rh}>
                      <span className={styles.lname}>{l.name}</span>
                      <button
                        type="button"
                        className={`${styles.adjust} ${ed ? styles.adjustOn : ''}`}
                        onClick={() => setEditing(e => ({ ...e, [l.id]: !e[l.id] }))}
                      >
                        {ed ? 'done' : 'adjust'}
                      </button>
                    </div>
                    {!ed ? (
                      <div className={styles.stats}>
                        <Stat label="sets" now={t.sets} was={l.sets} />
                        <Stat label="reps" now={t.reps} was={l.reps} />
                        <Stat label="weight" now={kgToDisplay(t.kg, units)} was={kgToDisplay(l.baseKg, units)} unit={unitLabel(units)} />
                      </div>
                    ) : (
                      <div className={styles.edit}>
                        <Stepper label="sets" value={String(t.sets)} onDown={() => adj(l.id, 'sets', -1)} onUp={() => adj(l.id, 'sets', 1)} />
                        <Stepper label="reps" value={String(t.reps)} onDown={() => adj(l.id, 'reps', -1)} onUp={() => adj(l.id, 'reps', 1)} />
                        <Stepper label="weight" value={String(kgToDisplay(t.kg, units))} onDown={() => adj(l.id, 'kg', -1)} onUp={() => adj(l.id, 'kg', 1)} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div className={styles.rir}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></svg>
              <p>{RIR_COPY[level]}</p>
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.ghost} onClick={() => setStep(0)}>back</button>
              <button type="button" className={styles.btn} onClick={() => setStep(2)}>Proceed</button>
            </div>
          </div>
        )}

        {/* ── Card 3 · safe ── */}
        {step === 2 && level && (
          <div className={styles.card}>
            <div className={styles.shield}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="M9 12l2 2 4-4" /></svg>
            </div>
            <h2 className={styles.safeH}>Your real weights are safe</h2>
            <p className={styles.safeSub}>Today won&apos;t lower your numbers or dent your progress graph.</p>
            <button type="button" className={`${styles.showme} ${showProof ? styles.showmeOpen : ''}`} onClick={() => setShowProof(s => !s)}>
              show me <span className={styles.ar}>▾</span>
            </button>
            <div className={`${styles.proof} ${showProof ? styles.proofOpen : ''}`}>
              <div className={styles.proofCard}>
                <div className={styles.pcEb}><span>your line</span><span className={styles.pcNow}>climbing</span></div>
                <OffDayGraph />
                <div className={styles.legend}>
                  <span><i className={styles.legMint} /> training day</span>
                  <span><i className={styles.legOff} /> off day</span>
                </div>
                <p className={styles.pcCap}>Off days sit to the side, never on the line. Your trend keeps climbing as if today were a rest.</p>
              </div>
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.ghost} onClick={() => setStep(1)}>back</button>
              <button type="button" className={styles.btn} onClick={() => level && onConfirm(level, plan)}>Ease into it →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, now, was, unit }: { label: string; now: number; was: number; unit?: string }) {
  const changed = was !== now
  return (
    <div className={`${styles.stat} ${changed ? styles.statChanged : ''}`}>
      <span className={styles.sl}>{label}</span>
      <span className={styles.vrow}>
        {changed && (
          <>
            <s className={styles.wasN}>{was}</s>
            <span className={styles.arr} aria-hidden>→</span>
          </>
        )}
        <span className={styles.nowN}>{now}{unit && <u>{unit}</u>}</span>
      </span>
    </div>
  )
}

function Stepper({ label, value, onDown, onUp }: { label: string; value: string; onDown: () => void; onUp: () => void }) {
  return (
    <div className={styles.stp}>
      <span className={styles.stpL}>{label}</span>
      <div className={styles.stpCtl}>
        <button type="button" onClick={onDown} aria-label={`decrease ${label}`}>−</button>
        <span className={styles.stpV}>{value}</span>
        <button type="button" onClick={onUp} aria-label={`increase ${label}`}>+</button>
      </div>
    </div>
  )
}

/** Tiny proof graph: a climbing mint line with one off-day dot sitting off it. */
function OffDayGraph() {
  const W = 320, H = 110, padX = 26, padT = 12, padB = 16
  const real = [{ x: 0, w: 80 }, { x: 1, w: 82.5 }, { x: 2, w: 85 }, { x: 4, w: 87.5 }, { x: 5, w: 90 }]
  const off = { x: 3, w: 70 }
  const all = [...real.map(p => p.w), off.w]
  const lo = Math.floor(Math.min(...all) / 5) * 5 - 3
  const hi = Math.ceil(Math.max(...all) / 5) * 5 + 3
  const X = (i: number) => padX + (W - padX - 12) * (i / 5)
  const Y = (w: number) => padT + (H - padT - padB) * (1 - (w - lo) / (hi - lo))
  const d = real.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.w).toFixed(1)}`).join(' ')
  const area = `${d} L${X(real[real.length - 1].x).toFixed(1)} ${H - padB} L${X(real[0].x).toFixed(1)} ${H - padB} Z`
  return (
    <div className={styles.graph}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 110 }}>
        <defs>
          <linearGradient id="odg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6ee7b7" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#6ee7b7" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#odg)" />
        <path d={d} className={styles.gLine} fill="none" vectorEffect="non-scaling-stroke" />
        {real.map((p, i) => <circle key={i} cx={X(p.x).toFixed(1)} cy={Y(p.w).toFixed(1)} r="3.2" className={styles.gDot} vectorEffect="non-scaling-stroke" />)}
        <line x1={X(off.x).toFixed(1)} y1={Y(off.w).toFixed(1)} x2={X(off.x).toFixed(1)} y2={H - padB} className={styles.gOffDrop} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        <circle cx={X(off.x).toFixed(1)} cy={Y(off.w).toFixed(1)} r="3" className={styles.gOffDot} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}

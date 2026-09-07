'use client'

/*
 * Vitals · manual entry (the no-wearable check-in, on Vitals). A single-screen
 * form that turns a fast self-report into the same WHOOP-style trio every band
 * reports (Recovery / Sleep / Strain, via lib/vitals/manualScore) and POSTs it to
 * /api/wearables/manual as provider 'manual'. On success it navigates to the
 * Vitals dashboard, where today's numbers + the score reflect what was entered.
 * We never echo the derived numbers here — no figure shown twice.
 *
 * Field logic mirrors Peak's ManualVitals (sleep hours, restful/feel/effort
 * scales, optional pulse-timer RHR, optional HRV) but is self-contained: its own
 * local state, no PeakState / localStorage. Baselines aren't passed on a fresh
 * entry (HRV/RHR join Recovery once a personal baseline exists server-side); the
 * raw hrv/rhr still save and feed those baselines over time.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './manualEntry.module.css'
import { deriveManualMetrics } from '@/lib/vitals/manualScore'

const RESTFUL = ['Rough', 'Light', 'OK', 'Solid', 'Deep']
const FEEL = ['Wrecked', 'Rough', 'OK', 'Good', 'Amazing']
const EFFORT = ['Rest', 'Easy', 'Moderate', 'Hard', 'Max']
const PULSE_SECONDS = 15
const SLEEP_NEED = 8

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function Spark() {
  return <svg viewBox="0 0 24 24" aria-hidden><path d="M12 2 L13.6 8.4 L20 10 L13.6 11.6 L12 18 L10.4 11.6 L4 10 L10.4 8.4 Z" fill="currentColor" /></svg>
}

function fmtHM(hours: number | null): string {
  if (hours == null) return '--'
  let h = Math.floor(hours)
  let m = Math.round((hours - h) * 60)
  if (m === 60) { h += 1; m = 0 }
  return m ? `${h}h ${m}m` : `${h}h`
}

function Scale({ label, words, value, onPick }: { label: string; words: string[]; value: number | null; onPick: (v: number) => void }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowHead}><span className={styles.lbl}>{label}</span></div>
      <div className={styles.chips}>
        {words.map((w, i) => {
          const v = i + 1
          const on = value === v
          return (
            <button key={v} type="button" className={`${styles.chip} ${on ? styles.chipOn : ''}`} onClick={() => onPick(v)} aria-pressed={on}>
              {w}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Resting HR by guided pulse count: tap Measure, tap each beat for 15s, bpm = beats x 4. */
function PulseTimer({ value, onMeasured }: { value: number | null; onMeasured: (bpm: number) => void }) {
  const [counting, setCounting] = useState(false)
  const [secs, setSecs] = useState(PULSE_SECONDS)
  const [beats, setBeats] = useState(0)
  const beatsRef = useRef(0)

  useEffect(() => {
    if (!counting) return
    const id = setInterval(() => {
      setSecs(s => {
        if (s <= 1) {
          clearInterval(id)
          setCounting(false)
          const bpm = beatsRef.current * (60 / PULSE_SECONDS)
          if (bpm > 0) onMeasured(Math.round(bpm))
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [counting, onMeasured])

  const tap = () => { beatsRef.current += 1; setBeats(beatsRef.current) }
  const start = () => { beatsRef.current = 0; setBeats(0); setSecs(PULSE_SECONDS); setCounting(true) }

  return (
    <div className={styles.row}>
      <div className={styles.rowHead}><span className={styles.lbl}>Resting HR</span><span className={styles.opt}>Optional</span></div>
      {counting ? (
        <div className={styles.measure}>
          <span className={styles.secs}>{secs}s</span>
          <button type="button" className={styles.beat} onClick={tap} aria-label="tap each beat">Tap each beat<i>{beats}</i></button>
        </div>
      ) : (
        <div className={styles.measure}>
          <span className={styles.readout}>{value ?? '--'}<i>bpm</i></span>
          <button type="button" className={styles.pillBtn} onClick={start}>{value != null ? 'Re-measure' : 'Measure'}</button>
        </div>
      )}
    </div>
  )
}

export default function ManualEntry() {
  const router = useRouter()
  const [sleepHours, setSleepHours] = useState<number | null>(null)
  const [sleepQuality, setSleepQuality] = useState<number | null>(null)
  const [feel, setFeel] = useState<number | null>(null)
  const [exertion, setExertion] = useState<number | null>(null)
  const [rhr, setRhr] = useState<number | null>(null)
  const [hrv, setHrv] = useState<number | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveMsg, setSaveMsg] = useState('')

  const dirty = () => { if (saveState === 'saved') setSaveState('idle') }
  const stepSleep = (deltaMin: number) => {
    dirty()
    setSleepHours(prev => {
      const next = Math.max(0, Math.min(16, (prev ?? SLEEP_NEED) + deltaMin / 60))
      return Math.round(next * 60) / 60
    })
  }

  const filled = sleepHours != null || sleepQuality != null || feel != null || exertion != null || rhr != null || hrv != null

  async function save() {
    if (!filled || saveState === 'saving') return
    setSaveState('saving')
    const metrics = deriveManualMetrics({
      sleepHours, sleepQuality, feel, hrv, rhr, exertion,
      hrvBaseline: null, rhrBaseline: null, sleepNeed: SLEEP_NEED,
    })
    try {
      const res = await fetch('/api/wearables/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recovery: metrics.recovery,
          sleep_perf: metrics.sleepPerf,
          strain: metrics.strain,
          sleep_hours: sleepHours,
          hrv, rhr,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setSaveState('error')
        setSaveMsg(body?.error === 'unauthorized' ? 'Sign in to save.' : 'Could not save. Try again.')
        return
      }
      setSaveState('saved')
      // Land on the Vitals dashboard, where the score + today's grid now reflect
      // this check-in. refresh() re-runs the server page so it sees the new row.
      router.push('/app/vitals/manual')
      router.refresh()
    } catch {
      setSaveState('error')
      setSaveMsg('Could not save. Check your connection.')
    }
  }

  return (
    <main className={styles.root}>
      <div className={styles.atmosphere} aria-hidden />
      <div className={styles.grain} aria-hidden />

      <div className={styles.page}>
        <header className={styles.head}>
          <a className={styles.back} href="/app/vitals">
            <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
            sources
          </a>
          <span className={styles.headTitle}>Vitals</span>
          <span />
        </header>

        <section className={styles.hero}>
          <div className={styles.eyebrow}><Spark /> Daily check-in</div>
          <h1 className={styles.title}>How did you <em>sleep</em>?</h1>
          <div className={styles.lede}>Fill what you know. I score the rest.</div>
        </section>

        <div className={styles.card}>
          {/* Sleep hours */}
          <div className={styles.row}>
            <div className={styles.rowHead}><span className={styles.lbl}>Sleep</span></div>
            <div className={styles.stepper}>
              <button type="button" className={styles.step} onClick={() => stepSleep(-15)} aria-label="15 minutes less sleep">-</button>
              <span className={styles.bigNum}>{fmtHM(sleepHours)}</span>
              <button type="button" className={styles.step} onClick={() => stepSleep(15)} aria-label="15 minutes more sleep">+</button>
            </div>
          </div>

          <Scale label="Restful?" words={RESTFUL} value={sleepQuality} onPick={v => { dirty(); setSleepQuality(v) }} />
          <Scale label="Feel" words={FEEL} value={feel} onPick={v => { dirty(); setFeel(v) }} />
          <Scale label="Effort" words={EFFORT} value={exertion} onPick={v => { dirty(); setExertion(v) }} />

          <PulseTimer value={rhr} onMeasured={bpm => { dirty(); setRhr(bpm) }} />

          {/* HRV */}
          <div className={styles.row}>
            <div className={styles.rowHead}><span className={styles.lbl}>HRV</span><span className={styles.opt}>Optional</span></div>
            <div className={styles.measure}>
              <input
                type="number" inputMode="numeric" className={styles.num} placeholder="--" min={1} max={400}
                value={hrv ?? ''}
                onChange={e => {
                  dirty()
                  const n = e.target.value === '' ? null : Math.round(Number(e.target.value))
                  setHrv(n != null && Number.isFinite(n) ? n : null)
                }}
                aria-label="heart-rate variability in milliseconds"
              />
              <span className={styles.unit}>ms</span>
            </div>
          </div>
        </div>

        <div className={styles.saveWrap}>
          <button type="button" className={styles.save} onClick={save} disabled={!filled || saveState === 'saving'}>
            {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : 'Save to Vitals'}
            {saveState === 'idle' && <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
          </button>
          <span className={`${styles.hint} ${saveState === 'error' ? styles.err : ''}`}>
            {saveState === 'error' ? saveMsg : 'Feeds your Vitals score and today’s numbers.'}
          </span>
        </div>
      </div>
    </main>
  )
}

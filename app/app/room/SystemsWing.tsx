'use client'

/**
 * THE SYSTEMS - "every system, and whether it's alive."
 *
 * The room's second wing. Where the registry above answers "what number can
 * Vitality draw", this answers "is the machine that draws it actually running".
 * Born the day an empty ANTHROPIC_API_KEY hid for weeks and the food scanner
 * died in silence. Fetches /api/systems/health on mount; that route reports
 * env-key presence only, never a key value.
 *
 * Status scheme (NEVER red - amber is the app-wide caution color):
 *   ok       -> filled mint dot
 *   degraded -> filled amber dot
 *   unknown  -> hollow amber dot
 *   down     -> hollow amber ring (filled vs hollow carries alive vs dead)
 */
import { useEffect, useState } from 'react'
import s from './room.module.css'

type SystemStatus = 'ok' | 'degraded' | 'down' | 'unknown'

interface SystemCheck {
  label: string
  ok: boolean
  note?: string
}

interface SystemHealth {
  key: string
  name: string
  detail: string
  status: SystemStatus
  checks: SystemCheck[]
}

const STATUS_WORD: Record<SystemStatus, string> = {
  ok: 'alive',
  degraded: 'degraded',
  down: 'down',
  unknown: 'unknown',
}

function StatusDot({ status }: { status: SystemStatus }) {
  return <span className={`${s.dot} ${s[`dot_${status}`]}`} aria-hidden="true" />
}

/** Tiny ok / not-ok glyph beside a check row. Mint check, amber slash - never
 *  a red cross. Both are line marks, so they read at 12px. */
function CheckMark({ ok }: { ok: boolean }) {
  if (ok) {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-label="ok" role="img">
        <path d="M2.5 6.4 L5 9 L9.5 3" stroke="var(--mint)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-label="not ok" role="img">
      <circle cx="6" cy="6" r="4.2" stroke="var(--amber)" strokeWidth="1.3" fill="none" />
      <path d="M4.2 6 L7.8 6" stroke="var(--amber)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export default function SystemsWing() {
  const [systems, setSystems] = useState<SystemHealth[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let live = true
    fetch('/api/systems/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('bad status'))))
      .then((d) => { if (live) setSystems(Array.isArray(d.systems) ? d.systems : []) })
      .catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [])

  return (
    <section className={s.systems} aria-label="every system, and whether it's alive">
      <div className={s.kicker}>the systems</div>
      <h2 className={`${s.systemsTitle} serif`}>Every system, and whether it&apos;s alive</h2>
      <p className={s.systemsIntro}>
        Every system in Vitality, and whether it&apos;s alive. Born the day an empty
        API key hid for weeks. What runs on Claude, USDA and the nightly cron reports
        here first, so no subsystem ever dies in silence again.
      </p>

      {error && (
        <p className={s.systemsGap}>Could not read system health right now. Reload the room.</p>
      )}

      {!error && systems === null && (
        <p className={s.systemsGap}>Reading the machine&hellip;</p>
      )}

      {!error && systems !== null && (
        <div className={s.sysGrid}>
          {systems.map((sys) => (
            <div key={sys.key} className={s.sysCard}>
              <div className={s.sysHead}>
                <StatusDot status={sys.status} />
                <span className={`${s.sysName} serif`}>{sys.name}</span>
                <span className={`${s.sysStatus} ${s[`word_${sys.status}`]}`}>{STATUS_WORD[sys.status]}</span>
              </div>
              <p className={s.sysDetail}>{sys.detail}</p>
              <div className={s.sysChecks}>
                {sys.checks.map((c) => (
                  <div key={c.label} className={s.sysCheck}>
                    <span className={s.sysCheckMark}><CheckMark ok={c.ok} /></span>
                    <span className={s.sysCheckLabel}>
                      {c.label}
                      {c.note && <span className={s.sysCheckNote}>{c.note}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

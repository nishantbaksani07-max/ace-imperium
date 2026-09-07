'use client'

import { useState } from 'react'
import { resetVitalsSetup } from './goalActions'

/**
 * Dev-only reset. Wipes the caller's vitals setup (prefs slice + goals +
 * cached insights) so the goal-picker → celebrate flow can be re-walked
 * without a fresh account or reconnecting WHOOP. Rendered only when
 * VERCEL_ENV !== 'production' (see the parent page), so it never reaches jade.
 */
export default function DevResetVitals() {
  const [busy, setBusy] = useState(false)

  async function reset() {
    if (busy) return
    setBusy(true)
    const res = await resetVitalsSetup()
    if (!res.ok) {
      alert('reset failed: ' + res.error)
      setBusy(false)
      return
    }
    // hard navigate to the TOP of the flow (the connect gallery) so you walk it
    // the real way: gallery → into WHOOP → goal picker → congrats → metrics.
    window.location.assign('/app/vitals')
  }

  return (
    <button
      type="button"
      onClick={reset}
      disabled={busy}
      style={{
        position: 'fixed', right: 16, bottom: 16, zIndex: 50,
        font: '600 11px/1 ui-monospace, monospace', letterSpacing: '0.12em', textTransform: 'uppercase',
        color: '#f4a4a4', background: 'rgba(244,164,164,0.08)', border: '1px solid rgba(244,164,164,0.32)',
        borderRadius: 999, padding: '9px 14px', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1,
      }}
    >
      {busy ? 'resetting…' : 'dev · reset vitals'}
    </button>
  )
}

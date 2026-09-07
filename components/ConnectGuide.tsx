'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import SectionGem from '@/components/SectionGem'
import styles from './connectGuide.module.css'

/* Wearable key-guide — the BYO-keys walkthrough that bridges "pick WHOOP" and
 * the OAuth hop. WHOOP/Oura never gave us a shared production app, so each user
 * brings their own developer app: this makes that as calm as possible.
 *
 * Two modes:
 *  - preview (no props): the band picker + the whole flow, Connect just advances
 *    to the success screen. Used by the no-auth /vitals-preview/connect-guide.
 *  - live ({ fixedBand, live }): band is fixed (entered from a band row), and
 *    Connect saves the sealed keys (POST /api/{band}/credentials) then hands off
 *    to the provider OAuth (/api/{band}/connect). Used by the gated route. */

type Band = 'whoop' | 'oura'
const BANDS: Record<Band, { name: string; metric: string; dev: string; first: string; redirect: string }> = {
  whoop: { name: 'WHOOP', metric: 'recovery', dev: 'https://developer-dashboard.whoop.com/', first: 'Create app', redirect: 'http://localhost:3000/api/whoop/callback' },
  oura: { name: 'Oura', metric: 'readiness', dev: 'https://cloud.ouraring.com/oauth/applications', first: 'New application', redirect: 'http://localhost:3000/api/oura/callback' },
}

function Pulse() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2 6 4-14 2 8h6" /></svg>
}
function Ring() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="7" /></svg>
}
function Chevron() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
}
function External() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M9 7h8v8" /></svg>
}
function CopyIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
}
function Check() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
}
function Lock() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
}

export default function ConnectGuide({ fixedBand, live = false, redirectUri }: { fixedBand?: Band; live?: boolean; redirectUri?: string } = {}) {
  const router = useRouter()
  const [band, setBand] = useState<Band>(fixedBand ?? 'whoop')
  const [step, setStep] = useState(fixedBand ? 0 : -1) // -1 choose · 0/1/2 steps · 3 done
  const [copied, setCopied] = useState(false)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [checking, setChecking] = useState(false)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const particlesRef = useRef<HTMLDivElement>(null)
  const b = BANDS[band]
  // The exact callback the user must register in their own WHOOP/Oura app. The
  // gated route passes the REAL server-derived one (whoopRedirectUri /
  // ouraRedirectUri, the exact value our OAuth hop will send) so what they paste
  // can never disagree with what the vendor receives - that mismatch is the
  // whole invalid_request wall. The preview falls back to the prod constant.
  const redirect = (fixedBand && band === fixedBand && redirectUri) || b.redirect

  // Live connect: save the sealed keys, then hand off to the provider's OAuth.
  // Preview: just advance to the success screen.
  async function connect() {
    if (!live) { setStep(3); return }
    setSaving(true); setSaveErr('')
    try {
      const res = await fetch(`/api/${band}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setSaveErr(j.error || 'Could not save your keys. Check them and try again.')
        setSaving(false)
        return
      }
      window.location.href = `/api/${band}/connect?return=/app/vitals/paired`
    } catch {
      setSaveErr('Network hiccup. Try again in a moment.')
      setSaving(false)
    }
  }
  function backFromStart() { fixedBand ? router.push('/app/vitals') : setStep(-1) }

  useEffect(() => {
    const root = particlesRef.current
    if (!root) return
    root.innerHTML = ''
    const N = window.innerWidth < 640 ? 15 : 24
    for (let i = 0; i < N; i++) {
      const s = document.createElement('span')
      s.style.left = `${Math.random() * 100}%`
      s.style.top = `${60 + Math.random() * 40}%`
      const size = 1.2 + Math.random() * 1.2
      s.style.width = s.style.height = `${size}px`
      const d = 22 + Math.random() * 28
      s.style.animationDuration = `${d}s`
      s.style.animationDelay = `${-Math.random() * d}s`
      s.style.setProperty('--dx', `${Math.random() * 30 - 15}px`)
      s.style.setProperty('--dy', `${-(60 + Math.random() * 50)}vh`)
      root.appendChild(s)
    }
    return () => { root.innerHTML = '' }
  }, [])

  // Quiet FORMAT check only (both modes): are two plausible-length codes pasted?
  // Nothing pings the provider here; the keys are truly verified at the vendor
  // OAuth wall right after Connect. The copy on the paste step says exactly that.
  useEffect(() => {
    setReady(false)
    if (clientId.trim().length <= 6 || clientSecret.trim().length <= 6) { setChecking(false); return }
    setChecking(true)
    const t = setTimeout(() => { setChecking(false); setReady(true) }, 1100)
    return () => clearTimeout(t)
  }, [clientId, clientSecret])

  function pick(x: Band) { setBand(x); setClientId(''); setClientSecret(''); setReady(false); setStep(0) }
  function copy() {
    navigator.clipboard?.writeText(redirect)
    setCopied(true); setTimeout(() => setCopied(false), 1300)
  }

  const eyebrow = step === 3 ? 'CONNECTED' : 'VITALS · CONNECT'
  const dotsShown = step >= 0 && step <= 2

  return (
    <main className={styles.root}>
      <div className={styles.atmosphere} aria-hidden />
      <div className={styles.mountains} aria-hidden>
        <svg viewBox="0 0 1600 420" preserveAspectRatio="none">
          <defs>
            <linearGradient id="cgMtFar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d1a17" stopOpacity="0" /><stop offset="55%" stopColor="#0d1a17" stopOpacity=".55" /><stop offset="100%" stopColor="#0d1a17" stopOpacity=".95" />
            </linearGradient>
            <linearGradient id="cgMtNear" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#050a09" stopOpacity=".4" /><stop offset="60%" stopColor="#050a09" stopOpacity=".95" /><stop offset="100%" stopColor="#050a09" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path d="M0,300 L120,230 L210,260 L320,180 L430,220 L560,150 L680,210 L820,170 L960,220 L1100,180 L1240,240 L1380,200 L1500,250 L1600,220 L1600,420 L0,420 Z" fill="url(#cgMtFar)" />
          <path d="M0,360 L100,320 L220,340 L340,290 L460,330 L590,300 L720,340 L860,310 L1000,350 L1140,310 L1280,355 L1420,320 L1540,360 L1600,340 L1600,420 L0,420 Z" fill="url(#cgMtNear)" />
        </svg>
      </div>
      <div className={styles.particles} ref={particlesRef} aria-hidden />
      <div className={styles.grain} aria-hidden />

      <div className={styles.stage}>
        <div className={styles.eyebrow}>{eyebrow}</div>
        <div className={styles.gemWrap}>
          {step === 3 && <span className={styles.bloom} aria-hidden />}
          <SectionGem glyph="LINK" shape="dodecahedron" glyphScale={1.5} size={252} position="inline" />
        </div>

        <div className={`${styles.dots} ${dotsShown ? styles.dotsShow : ''}`}>
          {[0, 1, 2].map((i, idx) => (
            <span key={`w${i}`} style={{ display: 'contents' }}>
              <span className={`${styles.d} ${step > i ? styles.dDone : ''} ${step === i ? styles.dActive : ''}`} />
              {idx < 2 && <span className={`${styles.bar} ${step > i ? styles.barDone : ''}`} />}
            </span>
          ))}
        </div>

        {/* CHOOSE */}
        {step === -1 && (
          <section className={styles.screen}>
            <h1 className={styles.title}>Which band do you wear?</h1>
            <p className={styles.lede}>Two minutes, and we stay with you the whole way.</p>
            <div className={styles.choice}>
              <button className={styles.band} onClick={() => pick('whoop')}>
                <span className={styles.bandMk}><Pulse /></span>
                <span className={styles.bandT}><b>WHOOP</b><span>Recovery &amp; strain</span></span>
                <span className={styles.chev}><Chevron /></span>
              </button>
              <button className={styles.band} onClick={() => pick('oura')}>
                <span className={styles.bandMk}><Ring /></span>
                <span className={styles.bandT}><b>Oura</b><span>Readiness &amp; sleep</span></span>
                <span className={styles.chev}><Chevron /></span>
              </button>
            </div>
          </section>
        )}

        {/* STEP 1 — make key */}
        {step === 0 && (
          <section className={styles.screen}>
            <h1 className={styles.title}>Make your key</h1>
            <p className={styles.lede}>Free, and takes a minute. We hand you the one line to paste.</p>
            <a className={`${styles.btn} ${styles.primary}`} href={b.dev} target="_blank" rel="noopener noreferrer">
              Open {b.name} dashboard <External />
            </a>
            <p className={styles.cap} style={{ marginTop: 12 }}>Sign in, then hit &ldquo;{b.first}&rdquo;. Name it anything.</p>
            <div className={styles.chip}>
              <span className={styles.chipV}>{redirect}</span>
              <button className={`${styles.copyBtn} ${copied ? styles.copied : ''}`} onClick={copy}>
                {copied ? <>Copied</> : <><CopyIcon />Copy</>}
              </button>
            </div>
            <p className={styles.cap}>Add this exact Redirect URI to your {b.name} app. One character off and {b.name} refuses the connection.</p>
            <div className={styles.stack}><button className={`${styles.btn} ${styles.primary}`} onClick={() => setStep(1)}>Continue</button></div>
            <div className={styles.below}><button className={styles.back} onClick={backFromStart}>Back</button></div>
          </section>
        )}

        {/* STEP 2 — copy codes */}
        {step === 1 && (
          <section className={styles.screen}>
            <h1 className={styles.title}>Copy your two codes</h1>
            <p className={styles.lede}>{b.name} shows a Client ID and a Secret. Grab both.</p>
            <div className={styles.stack}><button className={`${styles.btn} ${styles.primary}`} onClick={() => setStep(2)}>I have them</button></div>
            <p className={styles.cap} style={{ marginTop: 16 }}>The Secret shows once. If it slips, a new one is free.</p>
            <div className={styles.below}><button className={styles.back} onClick={() => setStep(0)}>Back</button></div>
          </section>
        )}

        {/* STEP 3 — paste */}
        {step === 2 && (
          <section className={styles.screen}>
            <h1 className={styles.title}>Paste them in</h1>
            <p className={styles.lede}>We check the format now; {b.name} verifies them when you connect.</p>
            <div className={`${styles.field} ${ready ? styles.fieldOk : ''}`}>
              <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Client ID" autoComplete="off" spellCheck={false} />
              <label>Client ID</label>
              <span className={styles.tick}><Check /></span>
            </div>
            <div className={`${styles.field} ${ready ? styles.fieldOk : ''}`}>
              <input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="Client Secret" autoComplete="off" spellCheck={false} />
              <label>Client Secret</label>
              <span className={styles.tick}><Check /></span>
            </div>
            <div className={`${styles.checkline} ${ready ? styles.checkGood : ''}`}>
              {checking ? <><span className={styles.spin} />Checking the format…</> : ready ? 'Format looks right. Connect to verify.' : ''}
            </div>
            {saveErr && <div className={styles.checkline} style={{ color: 'var(--amber)' }}>{saveErr}</div>}
            <div className={styles.stack}>
              <button className={`${styles.btn} ${styles.primary}`} disabled={!ready || saving} onClick={connect}>
                {saving ? <><span className={styles.spin} />Connecting…</> : <>Connect {b.name}</>}
              </button>
            </div>
            <div className={styles.below}><button className={styles.back} onClick={() => setStep(1)}>Back</button></div>
          </section>
        )}

        {/* DONE */}
        {step === 3 && (
          <section className={styles.screen}>
            <div className={styles.done}>
              <h1 className={styles.title}>You&rsquo;re in</h1>
              <p className={styles.lede} style={{ marginBottom: 0 }}>Reading your <em>{b.metric}</em> now. Your score updates in a moment.</p>
            </div>
          </section>
        )}

        <div className={styles.trust}><Lock /> Your keys are sealed, and only ever yours.</div>
      </div>
    </main>
  )
}

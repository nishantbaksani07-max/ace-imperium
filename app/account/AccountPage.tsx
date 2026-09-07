'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import styles from './account.module.css'
import { saveProfile, saveCreatorProfile, saveAvatarUrl } from './actions'
import { createClient } from '@/lib/supabase/client'
import { validateUsername, normalizeUsername } from '@/lib/profiles/username'
import { AVATAR_BUCKET, avatarObjectPath } from '@/lib/profiles/avatar'

// The public host makers' pages live at. Shown as a live preview under the
// handle field so a maker sees exactly where their published work is found.
const PUBLIC_HOST = 'localhost:3000'

/**
 * Soften whatever the save action surfaces into a warm, human line. The action
 * already returns friendly copy for the common cases (taken handle, bad link);
 * this is a belt-and-braces map so a raw Postgres error (e.g. a unique-violation
 * that slipped through as a constraint string) never reaches the maker as a
 * scary technical message. Anything already friendly passes straight through.
 */
function friendlyCreatorError(raw: string): string {
  const lower = raw.toLowerCase()
  if (
    lower.includes('taken') ||
    lower.includes('duplicate') ||
    lower.includes('unique') ||
    lower.includes('already exists') ||
    lower.includes('23505')
  ) {
    return 'That name is taken. Try another.'
  }
  if (lower === 'unauthorized') {
    return 'You’re signed out. Sign in and try again.'
  }
  return raw
}

const LB_PER_KG = 2.20462262
const KG_PER_LB = 0.45359237
const IN_PER_CM = 0.3937008
const CM_PER_IN = 2.54

interface BillingSnapshot {
  tier: 'free' | 'plus' | 'pro'
  status: string | null
  currentPeriodEnd: string | null
  hasCustomer: boolean
}

function formatPeriodEnd(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

function SubscriptionStatusLine({ billing }: { billing: BillingSnapshot }) {
  // Plain-English status. `currentPeriodEnd` is only meaningful for
  // pro users (and trialing — webhook still keeps them on pro). For
  // free + past_due, we describe what the user needs to do.
  if (billing.tier === 'pro') {
    if (billing.status === 'trialing') {
      return (
        <p className={styles.sectionLede}>
          <em>Pro · Trialing.</em> Trial ends {formatPeriodEnd(billing.currentPeriodEnd)}.
        </p>
      )
    }
    return (
      <p className={styles.sectionLede}>
        <em>Pro · Active.</em> Renews {formatPeriodEnd(billing.currentPeriodEnd)}.
      </p>
    )
  }

  if (billing.hasCustomer && billing.status === 'past_due') {
    return (
      <p className={styles.sectionLede}>
        <em>Payment failed.</em> Update your card in the billing portal to restore Pro.
      </p>
    )
  }

  if (billing.hasCustomer) {
    return (
      <p className={styles.sectionLede}>
        <em>You&apos;re on Free.</em> Your subscription ended. Resubscribe any time to bring Pro back.
      </p>
    )
  }

  return (
    <p className={styles.sectionLede}>
      <em>You&apos;re on Free.</em> Pro unlocks every module and the full dashboard. One price, cancel anytime.
    </p>
  )
}

interface McpToken {
  id: string
  name: string
  token_prefix: string
  token_last4: string
  last_used_at: string | null
  created_at: string
  expires_at: string
}

interface OAuthConn {
  client_id: string
  client_name: string | null
  connected_at: string
  token_count: number
}

interface CreatorSnapshot {
  username: string | null
  displayName: string
  bio: string
  linkUrl: string
  instagramUrl: string
  avatarUrl: string | null
}

interface ProfileSnapshot {
  firstName: string
  sex: 'M' | 'F'
  heightCm: number
  weightKg: number
  units: 'metric' | 'imperial'
  email: string
  billing: BillingSnapshot
  creator: CreatorSnapshot
}

interface AccountPageProps {
  initial: ProfileSnapshot
}

// Paste-in instructions that turn a Claude Project into an auto-rendering
// Vitality dashboard (see docs/ideas/claude-project-dashboard.md). Copied to the
// clipboard from the connect card so users don't have to retype it.
const PROJECT_INSTRUCTIONS = `You are my Vitality dashboard. At the START of every conversation, WITHOUT being asked, call vitality_daily_briefing and vitality_weekly_recap. Then render ONE HTML artifact titled "Vitality — <today's date>" as a glanceable dashboard: a top banner with today's call (train hard / moderate / rest) and the single most important alert, then a responsive grid of cards — Recovery & Sleep, Training readiness, Nutrition (today + weekly consistency), Weight (rate + goal verdict), Hydration, Goals streak, and Finance/Subscriptions. Aesthetic: pure-black (#04060a) background, mint (#6ee7b7) accents, Inter font, rounded cards with a faint mint border, big numbers / small labels, plain HTML/CSS only. Pull EVERY number from the tools — never invent data; show "—" for any gap. Under the artifact, write ONE line: the highest-leverage action right now. If I ask you to log something (weight, meal, water, workout, supplement, note), use the matching write tool, confirm what changed, and re-render just the affected card. Keep replies short — the artifact is the main output.`

/**
 * Personal settings page — the single source of truth for the user's
 * body data. Edit name / sex / height / weight / unit preference here;
 * every downstream feature (setup wizard, splitlog unit toggle, score
 * recommendations) reads from this row instead of re-asking.
 *
 * Wraps in the editorial canvas (atmosphere + mountains + particles)
 * matching the SessionMenu and SetupWizard pages.
 */
export default function AccountPage({ initial }: AccountPageProps) {
  const [firstName, setFirstName] = useState(initial.firstName)
  const [sex, setSex] = useState<'M' | 'F'>(initial.sex)
  const [units, setUnits] = useState<'metric' | 'imperial'>(initial.units)
  const [heightCm, setHeightCm] = useState<number>(initial.heightCm)
  const [weightKg, setWeightKg] = useState<number>(initial.weightKg)

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  // ── Public maker profile (Arts District identity, v2) ──
  // claimedUsername drives the one-way-door lock as STATE (not a const off the
  // initial snapshot) so the UI locks the instant a first claim succeeds,
  // without needing a page reload.
  const [claimedUsername, setClaimedUsername] = useState<string | null>(initial.creator.username)
  const [username, setUsername] = useState(initial.creator.username ?? '')
  const usernameLocked = claimedUsername !== null
  const [displayName, setDisplayName] = useState(initial.creator.displayName)
  const [bio, setBio] = useState(initial.creator.bio)
  const [linkUrl, setLinkUrl] = useState(initial.creator.linkUrl)
  const [instagramUrl, setInstagramUrl] = useState(initial.creator.instagramUrl)
  const [creatorStatus, setCreatorStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [creatorError, setCreatorError] = useState<string | null>(null)

  // Live handle validation, computed as the user types (only meaningful before
  // the first claim locks the handle). Uses the same rules the server writes
  // with, so what shows here is exactly what the save will accept. We report
  // an "ok" state only once there's real input, so an empty field stays calm
  // (a hint, not an error). Uniqueness can only be known on save, so the
  // friendly "taken, try another" comes back from the server action.
  const handleNormalized = useMemo(() => normalizeUsername(username), [username])
  const handleCheck = useMemo(() => validateUsername(username), [username])
  const handleTouched = username.trim().length > 0
  const handleValid = handleCheck.ok
  // Live preview of the public page the handle powers. Falls back to a
  // placeholder before there's a valid handle so the URL shape is always shown.
  const handlePreview = handleValid ? handleNormalized : 'yourname'

  // ── Maker avatar (profile photo) ──
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.creator.avatarUrl)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [billingBusy, setBillingBusy] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)

  // ── Connect to Claude (hosted MCP) ──
  const [mcpTokens, setMcpTokens] = useState<McpToken[]>([])
  const [mcpCommand, setMcpCommand] = useState<string | null>(null)
  const [mcpBusy, setMcpBusy] = useState(false)
  const [mcpError, setMcpError] = useState<string | null>(null)
  const [mcpCopied, setMcpCopied] = useState(false)
  const [mcpUrlCopied, setMcpUrlCopied] = useState(false)
  const [codeCmdCopied, setCodeCmdCopied] = useState(false)
  const [oauthConns, setOauthConns] = useState<OAuthConn[]>([])
  // Phase 2 connector URL (claude.ai / Desktop / mobile — no token to paste).
  // NEXT_PUBLIC_APP_URL is inlined at build, so this is stable across SSR/CSR.
  const connectorUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '')}/api/mcp/mcp`
    : null

  const [, startTransition] = useTransition()
  const router = useRouter()
  const searchParams = useSearchParams()
  const particlesRef = useRef<HTMLDivElement | null>(null)

  // If we just came back from Stripe Checkout, the webhook may have
  // already mirrored the new tier onto profiles — but our server data
  // was loaded before that. Refresh once so the section updates from
  // "upgrade to pro" to "pro · active" without a manual reload.
  const checkoutParam = searchParams.get('checkout')
  useEffect(() => {
    if (checkoutParam === 'success') {
      router.refresh()
    }
  }, [checkoutParam, router])

  // Where "← Back" goes. Priority:
  //  1. ?from=/internal/path — explicit referrer set by the link that
  //     brought the user here (setup wizard, log SettingsSheet, etc.).
  //  2. browser history — if the user navigated here from inside the
  //     app, router.back() pops them back to that page.
  //  3. /app fallback — direct landings (URL paste, bookmark) have no
  //     history and no from-param; ship them to the dashboard.
  // Label is always "Back" so the chrome stays consistent regardless
  // of how the user arrived.
  const fromParam = useMemo(() => {
    const f = searchParams.get('from')
    return f && f.startsWith('/') && !f.startsWith('//') ? f : null
  }, [searchParams])

  function handleBack(e: React.MouseEvent<HTMLAnchorElement>) {
    if (fromParam) return // <Link href={fromParam}> handles it
    e.preventDefault()
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/app')
    }
  }

  // Drift particles — same recipe as the rest of the editorial pages.
  useEffect(() => {
    const root = particlesRef.current
    if (!root) return
    const N = window.innerWidth < 640 ? 12 : 20
    const created: HTMLSpanElement[] = []
    for (let i = 0; i < N; i++) {
      const s = document.createElement('span')
      s.style.left = (Math.random() * 100) + '%'
      s.style.top = (60 + Math.random() * 40) + '%'
      const size = 1.2 + Math.random() * 1.2
      s.style.width = s.style.height = size + 'px'
      const dur = 20 + Math.random() * 26
      s.style.animationDuration = dur + 's'
      s.style.animationDelay = -Math.random() * dur + 's'
      s.style.setProperty('--dx', (Math.random() * 30 - 15) + 'px')
      s.style.setProperty('--dy', -(60 + Math.random() * 50) + 'vh')
      root.appendChild(s)
      created.push(s)
    }
    return () => { created.forEach(s => s.remove()) }
  }, [])

  // ── Unit-aware display helpers ──
  const heightDisplay = units === 'imperial'
    ? Math.round(heightCm * IN_PER_CM)   // total inches
    : Math.round(heightCm)
  const heightUnitLabel = units === 'imperial' ? 'in' : 'cm'

  const weightDisplay = units === 'imperial'
    ? Math.round(weightKg * LB_PER_KG)
    : Math.round(weightKg)
  const weightUnitLabel = units === 'imperial' ? 'lb' : 'kg'

  function onHeightChange(displayVal: string) {
    const n = parseFloat(displayVal)
    if (!Number.isFinite(n) || n <= 0) return
    setHeightCm(units === 'imperial' ? n * CM_PER_IN : n)
  }

  function onWeightChange(displayVal: string) {
    const n = parseFloat(displayVal)
    if (!Number.isFinite(n) || n <= 0) return
    setWeightKg(units === 'imperial' ? n * KG_PER_LB : n)
  }

  async function handleSignOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function handleUpgrade() {
    setBillingError(null)
    setBillingBusy(true)
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
      const body = await res.json()
      if (!res.ok || !body.url) {
        setBillingError(body.error ?? 'Could not start checkout. Try again.')
        setBillingBusy(false)
        return
      }
      window.location.href = body.url
    } catch {
      setBillingError('Network error. Try again.')
      setBillingBusy(false)
    }
  }

  async function handleManage() {
    setBillingError(null)
    setBillingBusy(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const body = await res.json()
      if (!res.ok || !body.url) {
        setBillingError(body.error ?? 'Could not open billing portal.')
        setBillingBusy(false)
        return
      }
      window.location.href = body.url
    } catch {
      setBillingError('Network error. Try again.')
      setBillingBusy(false)
    }
  }

  // Load this user's active connect credentials (RLS scopes them to the user).
  const loadMcpTokens = useMemo(
    () => async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('mcp_tokens')
        .select('id, name, token_prefix, token_last4, last_used_at, created_at, expires_at')
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
      setMcpTokens((data as McpToken[] | null) ?? [])
    },
    [],
  )

  // Load this user's active OAuth connections (claude.ai / Desktop / mobile).
  // The list comes from a SECURITY DEFINER fn scoped to auth.uid().
  const loadOauthConns = useMemo(
    () => async () => {
      const supabase = createClient()
      const { data } = await supabase.rpc('mcp_oauth_list_connections')
      setOauthConns((data as OAuthConn[] | null) ?? [])
    },
    [],
  )

  useEffect(() => {
    loadMcpTokens()
    loadOauthConns()
  }, [loadMcpTokens, loadOauthConns])

  async function handleRevokeOauth(clientId: string) {
    const supabase = createClient()
    await supabase.rpc('mcp_oauth_revoke_connection', { p_client_id: clientId })
    await loadOauthConns()
  }

  async function handleGenerateMcp() {
    setMcpError(null)
    setMcpCopied(false)
    setMcpBusy(true)
    try {
      const res = await fetch('/api/mcp/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = await res.json()
      if (!res.ok || !body.addCommand) {
        setMcpError(body.error === 'could_not_mint'
          ? 'Could not generate a credential. Try again.'
          : body.error ?? 'Something went wrong. Try again.')
        setMcpBusy(false)
        return
      }
      setMcpCommand(body.addCommand as string)
      await loadMcpTokens()
    } catch {
      setMcpError('Network error. Try again.')
    }
    setMcpBusy(false)
  }

  async function handleCopyMcp() {
    if (!mcpCommand) return
    try {
      await navigator.clipboard.writeText(mcpCommand)
      setMcpCopied(true)
      setTimeout(() => setMcpCopied(false), 2000)
    } catch {
      setMcpError('Copy failed — select the text and copy manually.')
    }
  }

  async function handleCopyConnectorUrl() {
    if (!connectorUrl) return
    try {
      await navigator.clipboard.writeText(connectorUrl)
      setMcpUrlCopied(true)
      setTimeout(() => setMcpUrlCopied(false), 2000)
    } catch {
      setMcpError('Copy failed — select the text and copy manually.')
    }
  }

  async function handleCopyCodeCmd() {
    if (!connectorUrl) return
    try {
      await navigator.clipboard.writeText(
        `claude mcp add --scope user --transport http vitality ${connectorUrl}`,
      )
      setCodeCmdCopied(true)
      setTimeout(() => setCodeCmdCopied(false), 2000)
    } catch {
      setMcpError('Copy failed — select the text and copy manually.')
    }
  }

  async function handleRevokeMcp(id: string) {
    const supabase = createClient()
    await supabase
      .from('mcp_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
    await loadMcpTokens()
  }

  async function handleSave() {
    setError(null)
    if (!firstName.trim()) { setError('Name can’t be empty.'); return }
    setSaveStatus('saving')
    const res = await saveProfile({
      firstName: firstName.trim(),
      sex,
      heightCm,
      weightKg,
      units,
    })
    if (!res.ok) {
      setError(res.error ?? 'Save failed.')
      setSaveStatus('error')
      return
    }
    setSaveStatus('saved')
    startTransition(() => {
      setTimeout(() => setSaveStatus(s => s === 'saved' ? 'idle' : s), 1500)
    })
  }

  async function handleSaveCreator() {
    setCreatorError(null)
    // Validate the handle client-side on first claim for an instant message.
    if (!usernameLocked) {
      const check = validateUsername(username)
      if (!check.ok) { setCreatorError(check.error ?? 'Pick a valid username.'); return }
    }
    setCreatorStatus('saving')
    const res = await saveCreatorProfile({
      username: usernameLocked ? undefined : username,
      displayName: displayName.trim(),
      bio: bio.trim(),
      linkUrl: linkUrl.trim(),
      instagramUrl: instagramUrl.trim(),
    })
    if (!res.ok) {
      setCreatorError(res.error ?? 'Save failed.')
      setCreatorStatus('error')
      return
    }
    if (res.username) {
      setUsername(res.username)
      setClaimedUsername(res.username) // lock the handle immediately on first claim
    }
    setCreatorStatus('saved')
    startTransition(() => {
      setTimeout(() => setCreatorStatus(s => s === 'saved' ? 'idle' : s), 1500)
    })
  }

  // Upload a chosen image to the per-user avatars folder, then persist its
  // public URL. A cache-busting `?v=` keeps a re-upload from showing the old
  // cached image. Owner-only writes are enforced by Storage RLS on the path.
  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the user re-pick the same file after a failure
    if (!file) return
    setAvatarError(null)
    if (!file.type.startsWith('image/')) { setAvatarError('Pick an image file.'); return }
    if (file.size > 4 * 1024 * 1024) { setAvatarError('Image must be under 4 MB.'); return }
    setAvatarBusy(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setAvatarError('You’re signed out. Sign in and try again.'); setAvatarBusy(false); return }
      const path = avatarObjectPath(user.id)
      const { error: upErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' })
      if (upErr) { setAvatarError('Upload failed. Try again.'); setAvatarBusy(false); return }
      const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
      const url = `${pub.publicUrl}?v=${Date.now()}`
      const res = await saveAvatarUrl(url)
      if (!res.ok) { setAvatarError(res.error ?? 'Could not save your photo.'); setAvatarBusy(false); return }
      setAvatarUrl(url)
    } catch {
      setAvatarError('Something went wrong. Try again.')
    }
    setAvatarBusy(false)
  }

  async function handleAvatarRemove() {
    setAvatarError(null)
    setAvatarBusy(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) await supabase.storage.from(AVATAR_BUCKET).remove([avatarObjectPath(user.id)])
      const res = await saveAvatarUrl(null)
      if (!res.ok) { setAvatarError(res.error ?? 'Could not remove your photo.'); setAvatarBusy(false); return }
      setAvatarUrl(null)
    } catch {
      setAvatarError('Something went wrong. Try again.')
    }
    setAvatarBusy(false)
  }

  const avatarInitial = (
    displayName.trim()[0] || username.trim()[0] || firstName.trim()[0] || 'V'
  ).toUpperCase()

  return (
    <main className={`${styles.editorialPage} grain-overlay`}>
      <div className={styles.atmosphere} aria-hidden />
      <div className={styles.mountainsLayer} aria-hidden>
        <svg viewBox="0 0 1600 420" preserveAspectRatio="none">
          <defs>
            <linearGradient id="account-mt-far" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d1a17" stopOpacity="0" />
              <stop offset="55%" stopColor="#0d1a17" stopOpacity=".55" />
              <stop offset="100%" stopColor="#0d1a17" stopOpacity=".95" />
            </linearGradient>
            <linearGradient id="account-mt-near" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#050a09" stopOpacity=".4" />
              <stop offset="60%" stopColor="#050a09" stopOpacity=".95" />
              <stop offset="100%" stopColor="#050a09" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path d="M0,300 L120,230 L210,260 L320,180 L430,220 L560,150 L680,210 L820,170 L960,220 L1100,180 L1240,240 L1380,200 L1500,250 L1600,220 L1600,420 L0,420 Z" fill="url(#account-mt-far)" />
          <path d="M0,360 L100,320 L220,340 L340,290 L460,330 L590,300 L720,340 L860,310 L1000,350 L1140,310 L1280,355 L1420,320 L1540,360 L1600,340 L1600,420 L0,420 Z" fill="url(#account-mt-near)" />
        </svg>
      </div>
      <div className={styles.particles} ref={particlesRef} aria-hidden />

      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href={fromParam ?? '/app'} className={styles.back} onClick={handleBack}>
            <span aria-hidden>←</span> Back
          </Link>
          <h1 className={styles.title}>Personal</h1>
          <p className={styles.subtitle}>
            <em>Saved once, used everywhere.</em>
            <br />
            Update here when your numbers change. The rest of the app picks it up automatically.
          </p>
        </header>

        <section className={styles.sectionGroup}>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="firstName">Name</label>
            <input
              id="firstName"
              type="text"
              className={styles.input}
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              maxLength={40}
            />
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.fieldLabel}>Sex</div>
            <div className={styles.segmented} role="group" aria-label="Sex">
              <button
                type="button"
                className={`${styles.segmentedOption} ${sex === 'M' ? styles.segmentedOptionActive : ''}`}
                onClick={() => setSex('M')}
                aria-pressed={sex === 'M'}
              >
                male
              </button>
              <button
                type="button"
                className={`${styles.segmentedOption} ${sex === 'F' ? styles.segmentedOptionActive : ''}`}
                onClick={() => setSex('F')}
                aria-pressed={sex === 'F'}
              >
                female
              </button>
            </div>
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.fieldLabel}>Units</div>
            <div className={styles.segmented} role="group" aria-label="Units">
              <button
                type="button"
                className={`${styles.segmentedOption} ${units === 'metric' ? styles.segmentedOptionActive : ''}`}
                onClick={() => setUnits('metric')}
                aria-pressed={units === 'metric'}
              >
                kg / cm
              </button>
              <button
                type="button"
                className={`${styles.segmentedOption} ${units === 'imperial' ? styles.segmentedOptionActive : ''}`}
                onClick={() => setUnits('imperial')}
                aria-pressed={units === 'imperial'}
              >
                lb / in
              </button>
            </div>
          </div>

          <div className={styles.numFieldRow}>
            <div className={styles.numField}>
              <label className={styles.fieldLabel} htmlFor="height">Height</label>
              <div className={styles.inputRow}>
                <input
                  id="height"
                  type="number"
                  inputMode="numeric"
                  className={styles.numInput}
                  value={heightDisplay}
                  onChange={e => onHeightChange(e.target.value)}
                  min={50}
                  max={250}
                />
                <span className={styles.unit}>{heightUnitLabel}</span>
              </div>
            </div>
            <div className={styles.numField}>
              <label className={styles.fieldLabel} htmlFor="weight">Bodyweight</label>
              <div className={styles.inputRow}>
                <input
                  id="weight"
                  type="number"
                  inputMode="decimal"
                  className={styles.numInput}
                  value={weightDisplay}
                  onChange={e => onWeightChange(e.target.value)}
                  min={20}
                  max={300}
                />
                <span className={styles.unit}>{weightUnitLabel}</span>
              </div>
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Email</span>
            <div className={styles.staticValue}>{initial.email}</div>
          </div>
        </section>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.footer}>
          <span className={styles.saveStatus} aria-live="polite">
            {saveStatus === 'saving' && 'saving…'}
            {saveStatus === 'saved' && <em>saved ✓</em>}
          </span>
          <button
            type="button"
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? 'saving…' : 'save changes'}
          </button>
        </div>

        {/* ── Public profile (Arts District identity) ───────────── */}
        <section className={styles.sectionGroup}>
          <h2 className={styles.sectionHeading}>Claim your maker name</h2>
          <p className={styles.sectionLede}>
            <em>This is how your work is found.</em>
            <br />
            Pick a handle and it becomes your maker page at{' '}
            <span className={styles.inlineUrl}>{PUBLIC_HOST}/u/&lt;you&gt;</span>.
            Every tile you publish is credited to you there, so anyone can find
            it and add it to their own dashboard.
          </p>

          <div className={styles.avatarRow}>
            <div className={styles.avatarPreview}>
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="Your profile photo" />
              ) : (
                <span aria-hidden>{avatarInitial}</span>
              )}
            </div>
            <div className={styles.avatarActions}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={handleAvatarPick}
              />
              {usernameLocked ? (
                <>
                  <div className={styles.avatarBtnRow}>
                    <button
                      type="button"
                      className={styles.avatarBtn}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={avatarBusy}
                    >
                      {avatarBusy ? 'uploading…' : avatarUrl ? 'Change photo' : 'Add a photo'}
                    </button>
                    {avatarUrl && !avatarBusy && (
                      <button type="button" className={styles.avatarRemove} onClick={handleAvatarRemove}>
                        Remove
                      </button>
                    )}
                  </div>
                  <p className={styles.fieldHint}>PNG, JPG or WebP, up to 4 MB.</p>
                </>
              ) : (
                <p className={styles.fieldHint}>Claim your handle below to add a photo.</p>
              )}
              {avatarError && <p className={styles.error}>{avatarError}</p>}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="username">Your handle</label>
            {usernameLocked ? (
              <div className={styles.lockedHandle}>@{username}</div>
            ) : (
              <>
                <div
                  className={`${styles.handleField} ${
                    handleTouched && !handleValid ? styles.handleFieldWarn : ''
                  } ${handleTouched && handleValid ? styles.handleFieldOk : ''}`}
                >
                  <span className={styles.handlePrefix}>@</span>
                  <input
                    id="username"
                    type="text"
                    className={styles.handleInput}
                    value={username}
                    onChange={e => setUsername(e.target.value.toLowerCase())}
                    placeholder="yourname"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={20}
                    aria-invalid={handleTouched && !handleValid}
                    aria-describedby="handle-feedback"
                  />
                  {handleTouched && handleValid && (
                    <span className={styles.handleTick} aria-hidden>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 13 4 4L19 7" />
                      </svg>
                    </span>
                  )}
                </div>

                {/* Live feedback: friendly, calm, never a raw error. */}
                <p
                  id="handle-feedback"
                  className={
                    handleTouched && !handleValid
                      ? styles.handleFeedbackWarn
                      : styles.fieldHint
                  }
                  aria-live="polite"
                >
                  {handleTouched && !handleValid
                    ? handleCheck.error
                    : 'Lowercase letters, numbers and underscores. Permanent once set, so pick one you love.'}
                </p>

                {/* Live public URL preview: shows exactly where their work lives. */}
                <div className={styles.urlPreview}>
                  <span className={styles.urlPreviewLabel}>Your page</span>
                  <span className={styles.urlPreviewValue}>
                    {PUBLIC_HOST}/u/<span className={styles.urlPreviewHandle}>{handlePreview}</span>
                  </span>
                </div>
              </>
            )}
            {usernameLocked && (
              <Link href={`/u/${username}`} className={styles.viewLink} target="_blank">
                View your public page →
              </Link>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="displayName">Display name</label>
            <input
              id="displayName"
              type="text"
              className={styles.input}
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="The name shown on your page"
              maxLength={50}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="bio">Bio</label>
            <textarea
              id="bio"
              className={`${styles.input} ${styles.bioInput}`}
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="One line on what you build."
              maxLength={240}
              rows={2}
            />
            <p className={styles.fieldHint}>Shown under your name on your maker page. Keep it to a line.</p>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="linkUrl">Your link</label>
            <input
              id="linkUrl"
              type="url"
              inputMode="url"
              className={styles.input}
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              placeholder="youtube.com/@you"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={400}
            />
            <p className={styles.fieldHint}>
              The headline button on your page. Your channel, site, anything.
            </p>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="instagramUrl">Instagram</label>
            <input
              id="instagramUrl"
              type="url"
              inputMode="url"
              className={styles.input}
              value={instagramUrl}
              onChange={e => setInstagramUrl(e.target.value)}
              placeholder="instagram.com/you"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={400}
            />
          </div>

          {creatorError && (
            <p className={styles.creatorNotice} role="status">
              {friendlyCreatorError(creatorError)}
            </p>
          )}

          <div className={styles.footer}>
            <span className={styles.saveStatus} aria-live="polite">
              {creatorStatus === 'saving' && 'saving…'}
              {creatorStatus === 'saved' && <em>saved ✓</em>}
            </span>
            <button
              type="button"
              className={styles.saveBtn}
              onClick={handleSaveCreator}
              disabled={creatorStatus === 'saving'}
            >
              {creatorStatus === 'saving'
                ? 'saving…'
                : usernameLocked ? 'save profile' : 'claim your name'}
            </button>
          </div>
        </section>

        {/* ── Subscription ──────────────────────────────────────── */}
        <section className={styles.sectionGroup}>
          <h2 className={styles.sectionHeading}>Subscription</h2>
          {checkoutParam === 'success' && (
            <p className={styles.sectionLede}>
              <em>Welcome to Pro.</em> Your subscription is active.
              If anything looks off here, give it a moment. Billing
              state lands a second or two after checkout closes.
            </p>
          )}
          <SubscriptionStatusLine billing={initial.billing} />
          {billingError && <p className={styles.error}>{billingError}</p>}
          {initial.billing.tier === 'pro' || initial.billing.hasCustomer ? (
            <button
              type="button"
              className={styles.signOutBtn}
              onClick={handleManage}
              disabled={billingBusy}
            >
              {billingBusy ? 'opening…' : 'Manage subscription'}
            </button>
          ) : (
            <button
              type="button"
              className={styles.signOutBtn}
              onClick={handleUpgrade}
              disabled={billingBusy}
            >
              {billingBusy ? 'opening…' : 'Upgrade to Pro · $15/mo'}
            </button>
          )}
        </section>

        {/* ── Connect to Claude (hosted MCP) ────────────────────── */}
        <section className={styles.sectionGroup}>
          <h2 className={styles.sectionHeading}>Connect to Claude</h2>
          <p className={styles.sectionLede}>
            <em>One connection, once.</em> Claude reads your real numbers and can log
            for you. You approve access when you connect, and nothing is ever deleted.
            {initial.billing.tier !== 'pro' && ' The tools need Pro to return data.'}
          </p>

          {mcpError && <p className={styles.error}>{mcpError}</p>}

          {connectorUrl && (
            <div className={styles.mcpSubBlock}>
              <h3 className={styles.mcpSubHeading}>In Claude Code</h3>
              <p className={styles.mcpNote}>Paste once in any terminal, then just talk.</p>
              <div className={styles.mcpCommandCard}>
                <code className={styles.mcpCommand}>
                  {`claude mcp add --scope user --transport http vitality ${connectorUrl}`}
                </code>
                <button type="button" className={styles.mcpCopyBtn} onClick={handleCopyCodeCmd}>
                  {codeCmdCopied ? 'copied ✓' : 'copy'}
                </button>
              </div>
            </div>
          )}

          {connectorUrl && (
            <div className={styles.mcpSubBlock}>
              <h3 className={styles.mcpSubHeading}>In the Claude apps</h3>
              <p className={styles.mcpNote}>
                Add this link under <em>Settings → Connectors</em>, then tap{' '}
                <em>Allow</em>.
              </p>
              <div className={styles.mcpCommandCard}>
                <code className={styles.mcpCommand}>{connectorUrl}</code>
                <button
                  type="button"
                  className={styles.mcpCopyBtn}
                  onClick={handleCopyConnectorUrl}
                >
                  {mcpUrlCopied ? 'copied ✓' : 'copy link'}
                </button>
              </div>
              <p className={styles.mcpNote}>
                Then try: <em>&ldquo;Give me my Vitality daily briefing.&rdquo;</em>
              </p>
            </div>
          )}

          {oauthConns.length > 0 && (
            <>
              <h3 className={styles.mcpSubHeading}>Connected apps</h3>
              <ul className={styles.mcpConnList}>
                {oauthConns.map((c) => (
                  <li key={c.client_id} className={styles.mcpConnRow}>
                    <div className={styles.mcpConnMeta}>
                      <span className={styles.mcpConnName}>{c.client_name || 'Claude'}</span>
                      <span className={styles.mcpConnId}>
                        Connected {formatPeriodEnd(c.connected_at)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.mcpRevokeBtn}
                      onClick={() => handleRevokeOauth(c.client_id)}
                    >
                      disconnect
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* The legacy shown-once token generator is retired from the UI
              (launch simplification, 2026-07-11): both lanes above use the
              OAuth Allow flow, no token to babysit. Existing tokens stay
              revocable below; the server endpoints are untouched. */}
          {mcpTokens.length > 0 && (
            <ul className={styles.mcpConnList}>
              {mcpTokens.map((t) => (
                <li key={t.id} className={styles.mcpConnRow}>
                  <div className={styles.mcpConnMeta}>
                    <span className={styles.mcpConnName}>{t.name}</span>
                    <span className={styles.mcpConnId}>
                      {t.token_prefix}…{t.token_last4}
                      {t.last_used_at
                        ? ` · last used ${formatPeriodEnd(t.last_used_at)}`
                        : ' · never used'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.mcpRevokeBtn}
                    onClick={() => handleRevokeMcp(t.id)}
                  >
                    revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Privacy & account control ─────────────────────────── */}
        <section className={styles.sectionGroup}>
          <h2 className={styles.sectionHeading}>Privacy & data</h2>
          <p className={styles.sectionLede}>
            <em>Your data is yours.</em> We don&apos;t share or sell anything you log here. Per-user RLS keeps every workout, weight, and metric isolated to your account.
          </p>
          <ul className={styles.privacyList}>
            <li>Workout logs, weight history, and profile data stay on your row only</li>
            <li>WHOOP and other wearable tokens are server-side, never exposed to the client</li>
            <li>Anthropic prompts (mentor module) include only the context needed for that conversation</li>
          </ul>
        </section>

        <section className={styles.sectionGroup}>
          <h2 className={styles.sectionHeading}>Sign out</h2>
          <p className={styles.sectionLede}>End your session on this device. You&apos;ll need your email + password (or Google) to come back.</p>
          <button
            type="button"
            className={styles.signOutBtn}
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </section>
      </div>
    </main>
  )
}

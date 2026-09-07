'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import styles from './dashboard.module.css'
import DashboardHeader from './DashboardHeader'
import VitalityIntro from './VitalityIntro'
import WelcomeBackdrop from '@/components/WelcomeBackdrop'
import DashboardHeaderGem from './DashboardHeaderGem'
import DashboardGrid from './DashboardGrid'
import Homecoming from './home/Homecoming'
import '@/components/veeTiles.css'
import SettingsSheet from '../app/fitness/log/SettingsSheet'
import { setUnits as setUnitsAction } from '../app/fitness/log/actions'
import { SettingsGear } from '@/components/SettingsGear'
import { dashboardChrome, backgroundAccent, DEFAULT_CHROME, type DashboardChrome } from '@/lib/tiles/dashboardChrome'
import { safeNextPath } from '@/lib/auth/safe-next'
import type { Units } from '@/lib/units'
import type { OnboardingTask } from '@/lib/onboardingTasks'
import type { ScoreState } from '@/lib/vitality/score'
import type { DashboardTileStats } from '@/lib/vitality/dashboardStats'

/** The tile-entrance library (see dashboard.module.css). One is picked at
 *  random per app-open; sessionStorage remembers the last pick so two opens
 *  in a row never feel identical. */
const ENTRANCES = ['rise', 'spring', 'blur', 'slide', 'settle', 'drift'] as const

/** "Vitality, I'm home" entry gate. The full ritual (3 acts + questions +
 *  close) shipped with the 4-lane mega-build; the gem tap is live. */
const IMHOME_ENABLED = true

function pickEntrance(): string {
  let i = Math.floor(Math.random() * ENTRANCES.length)
  try {
    const last = window.sessionStorage.getItem('vitality:entrance-last')
    if (ENTRANCES[i] === last) i = (i + 1) % ENTRANCES.length
    window.sessionStorage.setItem('vitality:entrance-last', ENTRANCES[i])
  } catch {
    /* storage unavailable: any pick works */
  }
  return ENTRANCES[i]
}

interface DashboardProps {
  firstName: string | null
  units: Units
  /** Onboarding tasks + user id passed through to SettingsSheet so the
   *  "Your Vitality setup" entry can render once the user is fully set up. */
  tasks: OnboardingTask[]
  userId: string
  /** The user's maker handle (Arts District). Drives the top-bar profile
   *  avatar: tap goes to /u/<handle>, or /account to claim if absent. */
  creatorHandle?: string | null
  /** The user's uploaded profile photo (public URL), or null → show the initial. */
  avatarUrl?: string | null
  score: number | null
  scoreState: ScoreState
  /** Live leading metric per tile; null fields render no stat. */
  tileStats: DashboardTileStats
  /** Founder viewer: Arts District also shows founderOnly dogfood tiles. */
  isFounder?: boolean
}

/**
 * Consolidated dashboard. The Vitality character lives in ONE place in the
 * header: the <DashboardHeaderGem> next to the greeting. Below it sits
 * <VeeTiles> - the animated-orb tile grid ported 1:1 from the approved mockup
 * (public/vee-dashboard.html), each tile a Link to its real module route.
 *
 * Everything around the tiles is unchanged: the <WelcomeBackdrop> aurora +
 * mountains + drifting mint particles, the header gem, the greeting + date, and
 * the top-right gear that opens the shared SettingsSheet (Personal + Edit
 * training setup + unit toggle).
 */
export default function Dashboard({
  firstName,
  units: initialUnits,
  tasks,
  userId,
  creatorHandle,
  avatarUrl,
  score,
  scoreState,
  tileStats,
  isFounder,
}: DashboardProps) {
  const avatarInitial = (firstName?.trim()?.[0] || creatorHandle?.[0] || 'V').toUpperCase()
  const profileHref = creatorHandle ? `/u/${creatorHandle}` : '/account'
  const [units, setUnits] = useState<Units>(initialUnits)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // "Vitality, I'm home" - tapping the header gem opens the daily ritual.
  const [homeOpen, setHomeOpen] = useState(false)
  const [, startTransition] = useTransition()
  // The chrome the user themed (wallpaper + greeting + date + gem). Undefined
  // until mount (localStorage), so SSR + first paint use the defaults - identical
  // to today, no flash.
  const [chrome, setChrome] = useState<DashboardChrome | undefined>(undefined)

  useEffect(() => {
    setChrome(dashboardChrome.get(userId))
  }, [userId])

  // Consume the signup-time ?next stash (AuthForm): a fresh email signup walks
  // onboarding first, then lands here - this returns them to the shared set /
  // tile / authorize link they actually came for. Re-validated before use; a
  // hard navigation because OAuth ?next targets are route handlers, not pages.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('vitality:next-after-onboarding')
      if (!raw) return
      window.localStorage.removeItem('vitality:next-after-onboarding')
      const next = safeNextPath(raw)
      if (next && next !== '/app') window.location.replace(next)
    } catch {
      /* storage blocked: the dashboard is a fine place to land */
    }
  }, [])

  // ── App-open reveal ──
  // The VitalityIntro splash calls reveal() as it starts to fade (or right
  // away when it skips: already played this session, storage blocked, or it
  // crashed). reveal() arms the staggered greeting word-in and stamps one
  // random tile-entrance style on the page. FAIL OPEN: with no reveal at all
  // the dashboard is fully visible (the entrance CSS is inert without the
  // data-entrance attribute), and a safety timer force-reveals regardless.
  const revealedRef = useRef(false)
  const [revealed, setRevealed] = useState(false)
  const [entrance, setEntrance] = useState<string | null>(null)

  const reveal = useCallback(() => {
    if (revealedRef.current) return
    revealedRef.current = true
    setRevealed(true)
    setEntrance(pickEntrance())
  }, [])

  useEffect(() => {
    // Safety net: if the intro never reports back, reveal anyway.
    const safety = window.setTimeout(reveal, 5000)
    return () => window.clearTimeout(safety)
  }, [reveal])

  useEffect(() => {
    // Drop the entrance attribute once the animations have finished so the
    // finished fills never fight the grid's own left/top/opacity transitions
    // (drag settle, reflow) and later-added tiles don't replay it.
    if (!revealed) return
    const done = window.setTimeout(() => setEntrance(null), 3400)
    return () => window.clearTimeout(done)
  }, [revealed])

  function updateChrome(patch: Partial<DashboardChrome>) {
    setChrome((prev) => ({ ...(prev ?? DEFAULT_CHROME), ...patch }))
    dashboardChrome.update(userId, patch)
  }

  function toggleUnits(next: Units) {
    if (next === units) return
    setUnits(next)
    startTransition(async () => {
      const res = await setUnitsAction(next)
      if (!res.ok) setUnits(units)
    })
  }

  // Publish the wallpaper accent so the whole page (gem, greeting name, future
  // tile theming) can pick it up via --wall-accent. The backdrop tints itself.
  const wallAccent = chrome ? backgroundAccent(chrome.background) : '#6EE7B7'
  const showGem = chrome?.gem.show ?? true

  return (
    <>
      {/* "The Swipe" app-open splash. Sibling of <main> (not a child) so no
          page stacking context can trap it; it covers everything, plays once
          per browser session, then fades to reveal the dashboard. */}
      <VitalityIntro onReveal={reveal} />
      <main
        className={`${styles.page} ${styles.oneScreen} grain-overlay`}
        style={{ ['--wall-accent' as string]: wallAccent }}
        data-entrance={entrance ?? undefined}
      >
      {/* Canonical brand backdrop - the themeable "world" (aurora + mountains +
          drifting particles, or a gradient / solid the user chose). Fixed layers
          at z 0-2; .shell sits above at z 5. */}
      <WelcomeBackdrop background={chrome?.background} />

      <div className={styles.shell}>
        <div className={styles.headerRow}>
          {/* The gem is the ritual's front door: tap it and Vee pulls your day
              ("Vitality, I'm home"). DEV-GATED until the full ritual ships:
              the spine went out half-built and buggy (gem sizing), and the
              locked method is build-it-ALL, then test once at the end. Flip
              IMHOME_ENABLED when the finished ritual merges. */}
          {showGem && IMHOME_ENABLED ? (
            <button
              type="button"
              className={styles.gemBtn}
              onClick={() => setHomeOpen(true)}
              aria-label="Vitality, I'm home"
              title="I'm home"
            >
              <DashboardHeaderGem className={styles.headerGem} />
            </button>
          ) : showGem ? (
            <DashboardHeaderGem className={styles.headerGem} />
          ) : null}
          <DashboardHeader firstName={firstName} greeting={chrome?.greeting} date={chrome?.date} revealed={revealed} />
          {/* The gear lives inside the header row. On desktop it's pinned to
              the page's top-right corner (position:absolute); on phone it
              becomes a normal flex child, vertically centered with the gem +
              greeting and pushed to the right, so it stays aligned and never
              overlaps the greeting text. */}
          {/* Top-bar profile avatar (Arts District). Always-visible doorway to
              your public maker page; routes to /account to claim a handle when
              you have none yet. Pinned top-right, just left of the gear. */}
          <Link
            href={profileHref}
            className={styles.profileAvatar}
            aria-label={creatorHandle ? 'Your maker profile' : 'Set up your maker profile'}
            title={creatorHandle ? `@${creatorHandle}` : 'Your profile'}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className={styles.profileAvatarImg} />
            ) : (
              <span aria-hidden>{avatarInitial}</span>
            )}
          </Link>
          <button
            type="button"
            className={styles.settingsBtn}
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            title="Settings"
          >
            <SettingsGear />
          </button>
        </div>

        {/* The fused dashboard: ONE customizable grid. The animated-orb core
            tiles (Train, Fuel, Vitals, Peak, Brand, Finance), the locked Library
            app-folder, the optional Vee tile, and the user's own built tiles all
            live together. Tap Customize to drag, resize, recolor, restyle,
            rename, add, and remove any of them (only Library is locked on). */}
        <DashboardGrid
          userId={userId}
          score={score}
          scoreState={scoreState}
          tileStats={tileStats}
          chrome={chrome}
          onChromeChange={updateChrome}
          isFounder={isFounder}
        />
      </div>

      {settingsOpen && (
        <SettingsSheet
          units={units}
          onUnitsChange={toggleUnits}
          tasks={tasks}
          userId={userId}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      </main>

      {/* "Vitality, I'm home" - the full-screen daily ritual. Sibling of <main>
          (like the intro splash) so no page stacking context can trap it. */}
      {homeOpen && (
        <Homecoming
          firstName={firstName?.trim() || 'friend'}
          onClose={() => setHomeOpen(false)}
        />
      )}
    </>
  )
}

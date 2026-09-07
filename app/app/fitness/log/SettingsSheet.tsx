'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import styles from './settingsSheet.module.css'
import { createClient } from '@/lib/supabase/client'
import type { Units } from '@/lib/units'
import type { OnboardingTask } from '@/lib/onboardingTasks'
import { isFullySetUp } from '@/lib/onboardingTasks'
import OnboardingChecklist from '@/components/OnboardingChecklist'

interface SettingsSheetProps {
  units: Units
  /** Parent owns persistence (calls setUnits server action + handles
   *  optimistic state + rollback on failure). Sheet just bubbles the
   *  desired new value. */
  onUnitsChange: (next: Units) => void
  /** Whether the user has taken the 11-question tailored intake. Drives
   *  the Completed / Not started indicator on the "Tailor my split" row. */
  intakeCompleted?: boolean
  /** Onboarding tasks + user id, threaded through from the dashboard so
   *  the sheet can show a "Vitality setup" entry that opens the full
   *  checklist sub-screen. Both required to render the entry — without
   *  them the sheet falls back to its pre-existing preferences-only UX.
   *  The entry only appears once `isFullySetUp(tasks)` is true (matches
   *  the dashboard pill's hide condition). */
  tasks?: OnboardingTask[]
  userId?: string
  onClose: () => void
}

/**
 * Shared settings modal — opens from the gear icon on the SessionMenu
 * top-right AND from the SplitLog day-page header. Backdrop dims + blurs the
 * page, the sheet drops into the center. Kept deliberately lean: units toggle,
 * "Training plan" (split/days/exercises + the tailoring intake, with status),
 * "Your Vitality setup" (the onboarding checklist), Account, and Sign out.
 * (Past-workout logging lives as a board pill; the two old setup rows merged.)
 *
 * Replaces the older anchored popover (which clipped under the day-card
 * grid and felt fragile). Modal pattern matches ExerciseSettings + the
 * FormReferenceSheet so the whole logger speaks one dialog language.
 */
export default function SettingsSheet({ units, onUnitsChange, intakeCompleted = false, tasks, userId, onClose }: SettingsSheetProps) {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)
  // Two views inside the same modal: 'preferences' is the default landing
  // (units toggle + the existing quick-link rows). 'checklist' swaps the
  // body to the OnboardingChecklist component with a back arrow. We keep
  // the modal mounted across the swap so there's no flash.
  const [view, setView] = useState<'preferences' | 'checklist'>('preferences')
  const showChecklistEntry = !!tasks && !!userId && isFullySetUp(tasks)

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    onClose()
    router.push('/login')
    router.refresh()
  }

  // Lock body scroll + close on Escape.
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.sheet}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close settings"
        >
          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
            <line x1="3" y1="3" x2="11" y2="11" />
            <line x1="11" y1="3" x2="3" y2="11" />
          </svg>
        </button>

        <div className={styles.head}>
          {view === 'checklist' && (
            <button
              type="button"
              className={styles.backBtn}
              onClick={() => setView('preferences')}
              aria-label="Back to preferences"
            >
              <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="8,3 4,7 8,11" />
                <line x1="4" y1="7" x2="12" y2="7" />
              </svg>
              <span>back</span>
            </button>
          )}
          <span className={styles.eyebrow}>{view === 'checklist' ? 'YOUR SETUP' : 'SETTINGS'}</span>
          <h2 id="settings-title" className={styles.title}>
            <em>{view === 'checklist' ? 'Your Vitality setup' : 'Your preferences'}</em>
          </h2>
        </div>

        {view === 'checklist' && tasks && userId && (
          <div className={styles.checklistWrap}>
            <p className={styles.checklistIntro}>
              <em>Edit any answer. Quizzes pre-fill with what you saved last time. Change what&apos;s changed and re-save.</em>
            </p>
            <OnboardingChecklist tasks={tasks} userId={userId} mode="edit" />
          </div>
        )}

        {view === 'preferences' && (
        <>
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Units</span>
          <div className={styles.unitToggle} role="group" aria-label="Weight units">
            <button
              type="button"
              className={`${styles.unitOption} ${units === 'metric' ? styles.unitOptionActive : ''}`}
              onClick={() => onUnitsChange('metric')}
              aria-pressed={units === 'metric'}
            >
              kg
            </button>
            <button
              type="button"
              className={`${styles.unitOption} ${units === 'imperial' ? styles.unitOptionActive : ''}`}
              onClick={() => onUnitsChange('imperial')}
              aria-pressed={units === 'imperial'}
            >
              lbs
            </button>
          </div>
          <span className={styles.sectionHint}>
            <em>Storage stays in kg. Toggle changes display only.</em>
          </span>
        </div>

        {/* Training plan — one entry for the split, days, exercises AND the
            tailoring intake. Not-yet-tailored deep-links into the quiz; once
            tailored it opens the setup hub. Replaces the old, confusing pair of
            "Tailor my split" + "Edit training setup" rows. */}
        <Link
          href={intakeCompleted ? '/app/fitness/setup' : '/app/fitness/setup?intake=open'}
          className={styles.actionRow}
          onClick={onClose}
        >
          <div className={styles.actionRowLeft}>
            <span className={styles.actionRowTitle}><em>Training plan</em></span>
            <span className={styles.actionRowDesc}>Your split, days, and exercises.</span>
          </div>
          <span
            className={`${styles.actionRowStatus} ${intakeCompleted ? styles.actionRowStatusDone : styles.actionRowStatusEmpty}`}
            aria-label={intakeCompleted ? 'Tailored to you' : 'Not tailored yet'}
          >
            {intakeCompleted ? '✓ Tailored' : 'Tailor it'}
          </span>
        </Link>

        {showChecklistEntry && (
          <button
            type="button"
            className={styles.actionRow}
            onClick={() => setView('checklist')}
            style={{ textAlign: 'left', font: 'inherit', width: '100%', cursor: 'pointer' }}
          >
            <div className={styles.actionRowLeft}>
              <span className={styles.actionRowTitle}><em>Your Vitality setup</em></span>
              <span className={styles.actionRowDesc}>Goal, mentor, hydration and more — edit any answer.</span>
            </div>
            <span className={styles.actionRowArrow} aria-hidden>→</span>
          </button>
        )}

        <Link
          href="/account?from=/app/fitness/log"
          className={styles.actionRow}
          onClick={onClose}
        >
          <div className={styles.actionRowLeft}>
            <span className={styles.actionRowTitle}><em>Account</em></span>
            <span className={styles.actionRowDesc}>Name, height, weight.</span>
          </div>
          <span className={styles.actionRowArrow} aria-hidden>→</span>
        </Link>

        <button
          type="button"
          className={styles.actionRow}
          onClick={handleSignOut}
          disabled={signingOut}
          style={{
            // <button> doesn't inherit text-align / font from parent;
            // explicit overrides keep it visually identical to the Link rows.
            textAlign: 'left',
            font: 'inherit',
            cursor: signingOut ? 'progress' : 'pointer',
            width: '100%',
          }}
        >
          <div className={styles.actionRowLeft}>
            <span className={styles.actionRowTitle}>
              <em>{signingOut ? 'Signing out…' : 'Sign out'}</em>
            </span>
            <span className={styles.actionRowDesc}>End your session on this device</span>
          </div>
          <span className={styles.actionRowArrow} aria-hidden>→</span>
        </button>
        </>
        )}
      </div>
    </div>
  )
}

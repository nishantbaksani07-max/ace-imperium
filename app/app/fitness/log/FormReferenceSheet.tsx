'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './formReferenceSheet.module.css'
import { exerciseReferences } from '@/lib/exerciseReferences'
import { TIER_LABEL, type Tier } from './splitData'
import MuscleIcon from '@/components/MuscleIcon'
import { exerciseMuscleDisplay } from '@/lib/training/muscleDisplay'

interface FormReferenceSheetProps {
  exerciseId: string
  exerciseName: string
  tier: Tier
  onClose: () => void
}

/** Plain-English tier meanings, shown when the user taps the glowing tier
 *  button in the head. The exercise rows are now minimal (just a glyph + a
 *  name), so the tier signal that used to live on the row "shines through"
 *  here instead. Same digit + label + title + body shape as the picker's
 *  recommend modal so every explainer across the app reads the same. */
const TIER_INFO: Record<Tier, { digit: string; badge: string; title: string; body: string }> = {
  heavy_compound: {
    digit: '1',
    badge: 'Tier 1',
    title: 'Heavy compounds',
    body: 'The big lifts your day is built around. Bench, squat, overhead press, deadlift, weighted dips. These move the most strength and size, so they go first.',
  },
  compound: {
    digit: '2',
    badge: 'Tier 2',
    title: 'Compounds',
    body: 'Other multi-muscle moves. Dumbbell presses, machine presses, close-grip bench. They round out the day after the main lifts.',
  },
  heavy_iso: {
    digit: '2',
    badge: 'Tier 2',
    title: 'Heavy isolation',
    body: 'One-muscle lifts done heavy. Used when a muscle needs direct work but a full compound would be too much.',
  },
  iso: {
    digit: '3',
    badge: 'Tier 3',
    title: 'Isolation',
    body: 'The finishers. Cable fly, lateral raise, bicep curl, tricep pushdown. Quick lifts to hit one muscle directly.',
  },
  ab: {
    digit: 'A',
    badge: 'Abs',
    title: 'Core work',
    body: 'Direct ab training. Cable crunches, hanging leg raises, ab wheel. Their own category since abs recover fast and pair with any day.',
  },
}

/** Lowercase Roman numeral for step indices (1-8 covers any lift). Serif
 *  italic roman numerals are the editorial signature used across the logger. */
function roman(n: number): string {
  return ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'][n - 1] ?? String(n)
}

/**
 * Form reference sheet — opens from the small (i) button next to every
 * exercise. Built-time-distilled gist + steps + cues (see the distill stage
 * in scripts/build-exercise-references.mjs), with the raw Free Exercise DB
 * prose kept as a fallback so a card is never empty.
 *
 * Bottom sheet on mobile, centered sheet on desktop. The head surfaces what
 * the minimal exercise rows drop: full muscle attribution, a glowing tappable
 * tier button (opens a tier explainer), and the equipment.
 *
 * Returns null when no reference exists for the exercise — the calling
 * component (SplitLog / ExercisePicker) gates the (i) button on the same
 * check, so this is just belt-and-suspenders.
 */
export default function FormReferenceSheet({
  exerciseId,
  exerciseName,
  tier,
  onClose,
}: FormReferenceSheetProps) {
  const ref = exerciseReferences[exerciseId]
  const [tierOpen, setTierOpen] = useState(false)

  // Lock body scroll + close on Escape (Escape closes the tier card first,
  // then the sheet).
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setTierOpen(open => {
        if (open) return false
        onClose()
        return open
      })
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!ref) return null
  if (typeof document === 'undefined') return null

  const md = exerciseMuscleDisplay(exerciseId)
  const ti = TIER_INFO[tier]
  const steps = ref.steps && ref.steps.length > 0 ? ref.steps : null
  const cues = ref.cues && ref.cues.length > 0 ? ref.cues : null

  // Portal to <body> so the fixed backdrop is positioned against the viewport,
  // never a transformed/filtered ancestor in the logger (which would otherwise
  // push it to the bottom of the scrollable page instead of overlaying).
  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.sheet}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-ref-title"
      >
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close form reference"
        >
          <svg
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="3" y1="3" x2="11" y2="11" />
            <line x1="11" y1="3" x2="3" y2="11" />
          </svg>
        </button>

        <div className={`${styles.head} ${styles.rev}`} style={{ animationDelay: '40ms' }}>
          <span className={styles.eyebrow}>FORM</span>
          <h2 id="form-ref-title" className={styles.title}>{exerciseName}</h2>
          <div className={styles.meta}>
            {md && (
              <>
                <span className={styles.metaMuscle}>
                  <span className={styles.metaMuscleIcon} aria-hidden>
                    <MuscleIcon name={md.iconKey} size={16} ariaLabel={md.primaryLabel} />
                  </span>
                  <span>{md.joinedLabel}</span>
                </span>
                <span className={styles.metaSep}>·</span>
              </>
            )}
            <button
              type="button"
              className={styles.tierBtn}
              onClick={() => setTierOpen(true)}
              aria-label={`What does ${TIER_LABEL[tier]} mean?`}
              title="What does this tier mean?"
            >
              {TIER_LABEL[tier]}
            </button>
            <span className={styles.metaSep}>·</span>
            <span className={styles.metaItem}>{ref.equipment}</span>
          </div>
        </div>

        {ref.gist && (
          <p className={`${styles.gist} ${styles.rev}`} style={{ animationDelay: '120ms' }}>{ref.gist}</p>
        )}

        {ref.images.length > 0 && (
          <div className={`${styles.images} ${styles.rev}`} style={{ animationDelay: '170ms' }}>
            {ref.images.map((src, i) => (
              <figure key={src} className={styles.imageFrame}>
                {/* fill → the .imageFrame (position:relative, aspect 1/1) sizes it;
                    next/image then serves a resized WebP and lazy-loads it. */}
                <Image
                  src={src}
                  alt={`${exerciseName} position ${i + 1}`}
                  fill
                  sizes="(max-width: 480px) 45vw, 170px"
                  className={styles.image}
                />
              </figure>
            ))}
          </div>
        )}

        {steps ? (
          <ol className={styles.steps}>
            {steps.map((step, i) => (
              <li
                key={i}
                className={`${styles.stepRow} ${styles.rev}`}
                style={{ animationDelay: `${240 + i * 90}ms` }}
              >
                <span className={styles.stepNum} aria-hidden>{roman(i + 1)}</span>
                <span className={styles.stepText}>{step}</span>
              </li>
            ))}
          </ol>
        ) : (
          ref.instructions.length > 0 && (
            <div className={styles.instructions}>
              {ref.instructions.map((step, i) => (
                <p key={i} className={styles.step}>{step}</p>
              ))}
            </div>
          )
        )}

        {cues && (
          <div className={styles.cueChips}>
            {cues.map((cue, i) => (
              <span
                key={i}
                className={`${styles.cueChip} ${styles.rev}`}
                style={{ animationDelay: `${240 + (steps?.length ?? 0) * 90 + 60 + i * 60}ms` }}
              >
                {cue}
              </span>
            ))}
          </div>
        )}

        {tierOpen && (
          <div
            className={styles.tierOverlay}
            onClick={() => setTierOpen(false)}
            role="dialog"
            aria-modal="true"
          >
            <div className={styles.tierCard} onClick={e => e.stopPropagation()}>
              <div className={styles.tierBanner}>
                <span className={styles.tierDigit} aria-hidden>{ti.digit}</span>
                <span className={styles.tierBadge}>{ti.badge}</span>
              </div>
              <h3 className={styles.tierTitle}>{ti.title}</h3>
              <p className={styles.tierBody}>{ti.body}</p>
              <button
                type="button"
                className={styles.tierDismiss}
                onClick={() => setTierOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

'use client'

import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import WelcomeBackdrop from './WelcomeBackdrop'
import styles from './quizComplete.module.css'
import type { GlyphKey } from '@/lib/quizzes/glyphs'

// HeroCrystal is Three.js — client-only, SSR-disabled. Same dynamic
// pattern as OnboardingGem so this celebration screen drops the V
// crystal in without forcing Three.js into the server bundle.
const HeroCrystal = dynamic(() => import('./HeroCrystal'), {
  ssr: false,
  loading: () => <div className={styles.gemFallback} aria-hidden />,
})

/**
 * Shared "you're set" celebration screen, shown after the last question
 * of any quiz or setup wizard is submitted and saved. Tailored copy per
 * quiz; same animation + chrome everywhere so the moment feels
 * recognizable across the app.
 *
 * Rendered as content only — caller wraps in dialog overlay or page
 * shell as appropriate.
 */
interface QuizCompleteProps {
  /** Small overline above the headline. Default: "one step closer". */
  eyebrow?: string
  /** Main "you did it" line. Tailored per quiz. */
  headline: string
  /** Optional supporting line under the headline. */
  sub?: string
  /** Continue CTA label. Default: "let's go". */
  ctaLabel?: string
  /** Fires when the user clicks the continue CTA or presses Enter. */
  onContinue: () => void
  /** Disable the CTA while a follow-up action is in flight. */
  submitting?: boolean
  /** Per-quiz mark shown on the crystal at the start of the celebration.
   *  Flickers out and the CHECK glyph flickers in. When unset, the
   *  screen jumps straight to the check (no flicker sequence). */
  glyph?: GlyphKey
  /** Optional second CTA label, rendered as a quieter ghost link under
   *  the primary CTA. Used on shielded (first-time) completions so the
   *  user can either go see what their answers built (primary) OR go
   *  back to the onboarding checklist to finish remaining tasks
   *  (secondary). When unset, only the primary CTA renders. */
  secondaryCtaLabel?: string
  /** Fires when the user clicks the secondary CTA. */
  onSecondary?: () => void
}

export default function QuizComplete({
  eyebrow = 'one step closer',
  headline,
  sub,
  ctaLabel = "let's go",
  onContinue,
  submitting = false,
  glyph,
  secondaryCtaLabel,
  onSecondary,
}: QuizCompleteProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter' && !submitting) onContinue()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onContinue, submitting])

  return (
    <div className={styles.shell}>
      <WelcomeBackdrop />

      <div className={styles.content}>
        <div className={styles.gemStage} aria-hidden>
          {/* Face-painted glyphs via HeroCrystal — the check cycles
              face-to-face like the V on the landing page so the
              celebration mark sits ON the gem and refracts with the
              crystal. When a per-quiz glyph is set, the face plane
              alternates between the check and that glyph (mentor →
              dot, hydration → drop, goal → rings, training → bar) so
              the user sees both marks rotating with the gem instead
              of a flat HTML overlay. No DOM ghost; everything lives
              on the same plane. */}
          <HeroCrystal glyph="check" secondaryGlyph={glyph} />
        </div>

        <span className={styles.eyebrow}>
          <span className={styles.eyebrowRule} aria-hidden /> {eyebrow}
        </span>

        <h2 className={styles.headline}>
          <em>{headline}</em>
        </h2>

        {sub && <p className={styles.sub}>{sub}</p>}

        <button
          type="button"
          className={styles.cta}
          onClick={onContinue}
          disabled={submitting}
          autoFocus
        >
          {submitting ? 'loading…' : <>{ctaLabel} <span aria-hidden>→</span></>}
        </button>

        {secondaryCtaLabel && onSecondary && (
          <button
            type="button"
            className={styles.secondaryCta}
            onClick={onSecondary}
            disabled={submitting}
          >
            {secondaryCtaLabel}
          </button>
        )}
      </div>
    </div>
  )
}

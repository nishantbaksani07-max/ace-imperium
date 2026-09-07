'use client'

import VitalityIcon from '@/components/VitalityIcon'
import styles from '../fuelSections.module.css'

// The three-step "how it works" explainer, opened from the info button on the
// Maintenance tile. Minimal: one line per step, icon on a timeline, plain English.

const STEPS = [
  {
    icon: 'scale' as const,
    title: 'You log',
    body: <>Weigh in each morning. Log your meals.</>,
  },
  {
    icon: 'trend' as const,
    title: 'It learns you',
    body: (
      <>
        Vitality finds your <b>true calories</b> from the results, and sharpens every day.
      </>
    ),
  },
  {
    icon: 'cycle' as const,
    title: 'It adjusts, weekly',
    body: (
      <>
        It suggests one small change. <b>You approve it</b>, nothing moves on its own.
      </>
    ),
  },
]

// Timeline node glyphs — all canonical icon weight (stroke 1.7, round) so the
// three nodes read as one even set. 'trend' uses the canonical trend-up arrow
// (VitalityIcon "bulk") which is optically centered, matching 'scale'.
function StepGlyph({ name }: { name: 'scale' | 'trend' | 'cycle' }) {
  if (name === 'scale') return <VitalityIcon name="scale" size={19} />
  if (name === 'trend') return <VitalityIcon name="bulk" size={19} />
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

export default function HowItWorks({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.mSheetScrim} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.mSheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.mSheetHead}>
          <div>
            <div className={styles.mSheetEy}>Maintenance</div>
            <div className={styles.mSheetTitle}>How it works</div>
          </div>
          <button className={styles.mSheetX} onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <p className={styles.mIntro}>
          Your plan <b>adjusts itself</b> from your real results.
        </p>
        <div className={styles.mSteps}>
          <span className={styles.mRail} />
          {STEPS.map((s) => (
            <div key={s.title} className={styles.mStep}>
              <span className={styles.mStepIc}>
                <StepGlyph name={s.icon} />
              </span>
              <div>
                <div className={styles.mStepH}>{s.title}</div>
                <p className={styles.mStepP}>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
        <button className={styles.mGot} onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  )
}

import styles from './wizardSteps.module.css'

/**
 * Shared header for the "build a lift" wizard — a "BUILD A LIFT · STEP n OF 2"
 * eyebrow plus a two-segment progress track. Rendered at the top of both the
 * Name step (NameLiftCard) and the Setup step (ExerciseSettings `creating` mode)
 * so the two cards read as one deliberate, professional flow rather than two
 * unrelated popups.
 */
export default function WizardSteps({ step }: { step: 1 | 2 }) {
  return (
    <div className={styles.wrap}>
      <span className={styles.eyebrow}>Build a lift · Step {step} of 2</span>
      <div className={styles.track} aria-hidden>
        <span className={`${styles.seg} ${styles.segDone}`} />
        <span className={`${styles.seg} ${step >= 2 ? styles.segDone : ''}`} />
      </div>
    </div>
  )
}

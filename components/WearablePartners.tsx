import styles from './WearablePartners.module.css'

/*
 * Wearable partner glyphs — minimal geometric SVG marks that suggest
 * each brand's identity, paired with brand-styled wordmark text.
 * Used in the landing hero's bottom-right corner as a "Powered by" row.
 */

function WhoopMark() {
  return (
    <svg viewBox="0 0 32 32" className={styles.glyph} aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="M9 12 L11 22 L16 16 L21 22 L23 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function GarminMark() {
  return (
    <svg viewBox="0 0 32 32" className={styles.glyph} aria-hidden="true">
      <path
        d="M16 5 L28 25 L4 25 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function OuraMark() {
  return (
    <svg viewBox="0 0 32 32" className={styles.glyph} aria-hidden="true">
      <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="3" />
    </svg>
  )
}

function FitbitMark() {
  return (
    <svg viewBox="0 0 32 32" className={styles.glyph} fill="currentColor" aria-hidden="true">
      <circle cx="8" cy="8" r="1.6" />
      <circle cx="16" cy="8" r="2.2" />
      <circle cx="24" cy="8" r="2.8" />
      <circle cx="8" cy="16" r="2.2" />
      <circle cx="16" cy="16" r="2.8" />
      <circle cx="24" cy="16" r="2.2" />
      <circle cx="8" cy="24" r="2.8" />
      <circle cx="16" cy="24" r="2.2" />
      <circle cx="24" cy="24" r="1.6" />
    </svg>
  )
}

export default function WearablePartners() {
  return (
    <div className={styles.row}>
      <div className={`${styles.brand} ${styles.whoop}`}>
        <WhoopMark />
        <span>WHOOP</span>
      </div>
      <div className={`${styles.brand} ${styles.garmin}`}>
        <GarminMark />
        <span>GARMIN</span>
      </div>
      <div className={`${styles.brand} ${styles.oura}`}>
        <OuraMark />
        <span>ŌURA</span>
      </div>
      <div className={`${styles.brand} ${styles.fitbit}`}>
        <FitbitMark />
        <span>fitbit</span>
      </div>
    </div>
  )
}

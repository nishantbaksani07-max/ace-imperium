import styles from './fitness.module.css'

/**
 * Atmospheric layer for the Fitness sub-dashboard.
 *
 * Two mountain silhouette layers + a horizon glow. Rendered at the bottom
 * of the viewport via fixed positioning so the atmosphere stays consistent
 * across navigation inside /app/fitness/*.
 *
 * - Back layer: distant peaks, very pale fill, slow horizontal drift
 * - Front layer: closer ridge, near-black fill, static
 * - Horizon glow: mint radial above the front ridge, evokes dawn over peaks
 *
 * Strictly decorative — `aria-hidden`, `pointer-events: none`.
 */
export default function FitnessAtmosphere() {
  return (
    <div className={styles.atmosphere} aria-hidden>
      <div className={styles.horizonGlow} />
      <svg
        className={styles.mountainsBack}
        viewBox="0 0 1200 200"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M0,170 L60,110 L130,140 L220,80 L320,130 L420,90 L520,150 L640,100 L760,140 L880,90 L1000,130 L1120,100 L1200,140 L1200,200 L0,200 Z"
          fill="rgba(110, 231, 183, 0.05)"
        />
      </svg>
      <svg
        className={styles.mountainsFront}
        viewBox="0 0 1200 160"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M0,150 L80,80 L160,120 L260,50 L360,110 L460,70 L580,130 L700,90 L820,140 L960,100 L1080,130 L1200,90 L1200,160 L0,160 Z"
          fill="rgba(0, 0, 0, 0.92)"
          stroke="rgba(110, 231, 183, 0.08)"
          strokeWidth="0.4"
        />
      </svg>
    </div>
  )
}

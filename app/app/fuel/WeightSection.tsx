import Link from 'next/link'
import VitalityIcon from '@/components/VitalityIcon'
import styles from './fuelSections.module.css'

/**
 * Weight entry — a compact link section folded into the Fuel page, opening the
 * full weight tracker (weigh-in + 7-day-average chart + progress photos) which
 * lives at /app/fitness/progress. After the 6-tile consolidation the weight
 * logger belongs under Fuel (shares the `weights` table with macros), so this
 * is its front-door from the Fuel page. The full chart/photos UI stays on its
 * own focused route rather than crowding the macro tracker.
 *
 * Matches the Water/Supplements section eyebrow + card pattern; numbered ·04
 * to sit after Today(·01) / Water(·02) / Supplements(·03).
 */
export default function WeightSection() {
  return (
    <section className={styles.section}>
      <div className={styles.eyebrow}>
        <span className={styles.eyebrowNum}>·06</span>
        <span className={styles.eyebrowLbl}>Weight</span>
        <span className={styles.eyebrowRule} />
      </div>

      <Link href="/app/fitness/progress" className={styles.card} style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--space-4)', textDecoration: 'none' }}>
        <span className={styles.tileIc} aria-hidden>
          <VitalityIcon name="scale" size={22} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <span className={styles.tileLbl} style={{ fontSize: 'var(--text-base)', color: 'var(--fg)' }}>Weight tracker</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>Weigh-in · 7-day trend · progress photos</span>
        </span>
        <span style={{ color: 'var(--mint)', fontSize: 16 }}>→</span>
      </Link>
    </section>
  )
}

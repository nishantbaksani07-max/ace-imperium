import Link from 'next/link'
import styles from './profile.module.css'

/**
 * On-brand 404 for an unknown maker handle (the page calls notFound() when a
 * username has no creator_profiles row). Same calm/editorial language as the
 * profile itself — mint horizon glow, centered, a doorway back in.
 */
export default function MakerNotFound() {
  return (
    <div className={styles.page}>
      <div className={styles.glow} aria-hidden />

      <div className={styles.bar}>
        <Link href="/" className={styles.mark} aria-label="Vitality">V</Link>
        <span className={styles.barSpacer} />
        <Link href="/" className={styles.barCta}>Make your own</Link>
      </div>

      <div className={styles.prof}>
        <div className={styles.avwrap}>
          <div className={styles.av} aria-hidden>?</div>
        </div>
        <div className={styles.name}>No maker here</div>
        <p className={styles.bio}>
          This handle isn’t taken yet. The page may have moved, or the link
          could be a typo.
        </p>
        <div className={styles.links}>
          <Link className={`${styles.lk} ${styles.primary}`} href="/">
            Build your own dashboard
          </Link>
        </div>
      </div>

      <div className={styles.footer}>
        Made with <Link href="/">Vitality</Link>. Build your own dashboard.
      </div>
    </div>
  )
}

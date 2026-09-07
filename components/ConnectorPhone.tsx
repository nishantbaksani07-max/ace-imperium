import styles from './ConnectorPhone.module.css'

/**
 * ConnectorPhone — a landing-style phone showing the user's own Claude with the
 * Vitality connector live, pushing proactive, data-driven nudges (a stock
 * earnings heads-up, a forgotten subscription about to renew, a recovery flag).
 * Purely presentational + CSS-animated (notifications stagger in like they're
 * arriving). Reuses the HeroPhone frame language. aria-hidden — it's decoration.
 */
export default function ConnectorPhone() {
  return (
    <div className={styles.phone} aria-hidden="true">
      <div className={styles.bezel} />

      <div className={styles.header}>
        <span className={styles.appName}>Claude</span>
        <span className={styles.connected}>
          <span className={styles.connectedDot} /> Vitality connected
        </span>
      </div>

      <div className={`${styles.notif} ${styles.n1}`}>
        <div className={styles.notifHead}>
          <span className={styles.notifIcon}>↗</span>
          <span className={styles.notifTitle}>Disney earnings · Thursday</span>
        </div>
        <p className={styles.notifBody}>
          You hold DIS. The call&apos;s in 2 days — want the numbers the morning of?
        </p>
      </div>

      <div className={`${styles.notif} ${styles.n2}`}>
        <div className={styles.notifHead}>
          <span className={styles.notifIcon}>↻</span>
          <span className={styles.notifTitle}>CapCut renews in 3 days</span>
        </div>
        <p className={styles.notifBody}>
          You haven&apos;t opened it in 3 weeks · $9.99/mo.
        </p>
        <div className={styles.notifActions}>
          <span className={styles.actPrimary}>Cancel it</span>
          <span className={styles.actGhost}>Keep</span>
        </div>
      </div>

      <div className={`${styles.notif} ${styles.n3}`}>
        <div className={styles.notifHead}>
          <span className={styles.notifIcon}>☾</span>
          <span className={styles.notifTitle}>Why you feel flat</span>
        </div>
        <p className={styles.notifBody}>
          5h sleep, trained 6 days, no magnesium. Take it tonight — rest tomorrow.
        </p>
      </div>
    </div>
  )
}

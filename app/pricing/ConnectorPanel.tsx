import styles from './pricing.module.css'

/**
 * ConnectorPanel — a mock of Claude's "Connectors" settings panel with
 * Vitality shown live and Connected. The single job of this element is to
 * plant "Vitality is a Claude connector" in the visitor's head: it's the
 * cloud-connector section they already know from Claude, with Vitality the
 * one that's switched on. Presentational only.
 */
export default function ConnectorPanel() {
  return (
    <div className={styles.connPanel} aria-hidden>
      <div className={styles.connPanelHead}>
        <span className={styles.connPanelTitle}>Connectors</span>
        <span className={styles.connPanelSub}>
          Claude uses these to answer with your data
        </span>
      </div>

      <div className={`${styles.connRow} ${styles.connRowLive}`}>
        <span className={styles.connLogo}>V</span>
        <span className={styles.connMeta}>
          <span className={styles.connName}>Vitality</span>
          <span className={styles.connDesc}>Your whole life, in one dashboard</span>
        </span>
        <span className={styles.connBadge}>
          <span className={styles.connBadgeDot} /> Connected
        </span>
      </div>

      <div className={styles.connRow}>
        <span className={styles.connLogoDim} aria-hidden>
          ▢
        </span>
        <span className={styles.connMeta}>
          <span className={styles.connName}>Files</span>
          <span className={styles.connDesc}>Documents &amp; PDFs</span>
        </span>
        <span className={styles.connConnect}>Connect</span>
      </div>

      <div className={styles.connRow}>
        <span className={styles.connLogoDim} aria-hidden>
          ◷
        </span>
        <span className={styles.connMeta}>
          <span className={styles.connName}>Calendar</span>
          <span className={styles.connDesc}>Events &amp; reminders</span>
        </span>
        <span className={styles.connConnect}>Connect</span>
      </div>
    </div>
  )
}

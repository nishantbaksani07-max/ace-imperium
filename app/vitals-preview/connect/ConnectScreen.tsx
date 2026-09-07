'use client'

import SectionGem from '@/components/SectionGem'
import styles from '../vitals.module.css'

/** Vitals — not-yet-connected state. What the user sees before linking WHOOP. */

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
  )
}

export default function ConnectScreen() {
  return (
    <main className={`${styles.page} grain-overlay`}>
      <div className={styles.atmosphere} aria-hidden />
      <div className={styles.connectWrap}>
        <div className={styles.connectGem}>
          <SectionGem glyph="PULSE" size={300} position="inline" />
        </div>
        <div className={styles.connectEyebrow}>Vitals · WHOOP</div>
        <h1 className={styles.connectTitle}>Bring your body into Vitality.</h1>
        <p className={styles.connectSub}>Connect your WHOOP and I turn your recovery, sleep, and strain into advice built around your goals.</p>

        <div className={styles.connectList}>
          <div className={styles.connectItem}><Check /> A daily Vitality Score you can watch climb</div>
          <div className={styles.connectItem}><Check /> Sleep and recovery read against your own baseline</div>
          <div className={styles.connectItem}><Check /> Insights tied to your goals, in plain language</div>
        </div>

        <button className={styles.snap}>Connect WHOOP <span aria-hidden>→</span></button>
        <p className={styles.connectFine}>We never see your WHOOP password. Disconnect anytime.</p>
      </div>
    </main>
  )
}

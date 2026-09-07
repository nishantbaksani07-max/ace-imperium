import styles from './HeroPhone.module.css'

export default function HeroPhone() {
  return (
    <div className={styles.phone} aria-hidden="true">
      <div className={styles.bezel} />

      <div className={styles.headerRow}>
        <div>
          <div className={styles.greeting}>Tuesday</div>
          <div className={styles.greetingStrong}>Good morning, Alex</div>
        </div>
        <div className={styles.statusDot} />
      </div>

      <div className={styles.tile}>
        <div className={styles.tileLabel}>Fitness</div>
        <div className={styles.tileBody}>
          <div className={styles.ring}>
            <div className={styles.ringInner}>4/6</div>
          </div>
          <div>
            <div className={styles.tileMain}>This week</div>
            <div className={styles.tileSub}>Upper · Push tonight</div>
          </div>
        </div>
      </div>

      <div className={styles.tile}>
        <div className={styles.tileLabel}>Weight</div>
        <div className={styles.tileBody}>
          <div className={styles.weightValue}>173.2 lb</div>
          <svg className={styles.spark} viewBox="0 0 100 24" preserveAspectRatio="none">
            <polyline
              points="0,8 12,10 24,7 36,12 48,11 60,14 72,13 84,17 100,16"
              fill="none"
              stroke="var(--mint)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      <div className={styles.tile}>
        <div className={styles.tileLabel}>Supplements</div>
        <div className={styles.tileBody}>
          <div className={styles.tileMain}>3 of 5 today</div>
          <div className={styles.dotRow} style={{ marginLeft: 'auto' }}>
            <span className={`${styles.dot} ${styles.dotFilled}`} />
            <span className={`${styles.dot} ${styles.dotFilled}`} />
            <span className={`${styles.dot} ${styles.dotFilled}`} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </div>
        </div>
      </div>

      <div className={styles.tile}>
        <div className={styles.tileLabel}>Water</div>
        <div className={styles.tileBody}>
          <div className={styles.tileMain}>54 / 80 oz</div>
          <div className={styles.dotRow} style={{ marginLeft: 'auto' }}>
            <span className={`${styles.glass} ${styles.glassFilled}`} />
            <span className={`${styles.glass} ${styles.glassFilled}`} />
            <span className={`${styles.glass} ${styles.glassFilled}`} />
            <span className={`${styles.glass} ${styles.glassFilled}`} />
            <span className={`${styles.glass} ${styles.glassFilled}`} />
            <span className={styles.glass} />
            <span className={styles.glass} />
            <span className={styles.glass} />
          </div>
        </div>
      </div>

      <div className={styles.bottomCushion} />
    </div>
  )
}

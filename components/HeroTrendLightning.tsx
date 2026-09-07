'use client'

import styles from './HeroTrendLightning.module.css'

/**
 * HeroTrendLightning — subtle mint trend-line strikes in the hero
 * background. Same "lightning crackle then fade" feel as the creators
 * section's trend line, but with multiple path variants firing at
 * staggered intervals so each strike comes from a different starting
 * point and goes in a different direction (up-left, up-right, up).
 *
 * All paths trend UPWARD overall — symbolic of "your life upgraded".
 * Each path has 1-2 small dips along the way so it doesn't read as a
 * straight line.
 *
 * Pure SVG + CSS keyframes — no JS animation loop, no second WebGL
 * context, no extra render cost beyond the SVG itself. Honors
 * prefers-reduced-motion.
 */
export default function HeroTrendLightning() {
  return (
    <div className={styles.trendLightning} aria-hidden>
      <svg viewBox="0 0 1600 900" preserveAspectRatio="none">
        <defs>
          <filter
            id="hero-trend-glow"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Path A — starts bottom-left, trends up to upper-right.
            Two small dips for realism. Fires first in the cycle. */}
        <g className={`${styles.strike} ${styles.strikeA}`}>
          <path
            className={styles.trendPath}
            d="M 60,760 L 180,720 L 290,740 L 410,650 L 530,560 L 640,590 L 760,490 L 880,430 L 1000,460 L 1110,350 L 1230,290 L 1340,320 L 1450,210 L 1560,150"
            fill="none"
            stroke="#6EE7B7"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#hero-trend-glow)"
          />
          {[
            [60, 760], [180, 720], [290, 740], [410, 650], [530, 560],
            [640, 590], [760, 490], [880, 430], [1000, 460], [1110, 350],
            [1230, 290], [1340, 320], [1450, 210], [1560, 150],
          ].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="2.5" fill="#A7F3D0" />
          ))}
        </g>

        {/* Path B — starts bottom-right, trends up to upper-left.
            Fires later in the cycle so the two strikes never overlap. */}
        <g className={`${styles.strike} ${styles.strikeB}`}>
          <path
            className={styles.trendPath}
            d="M 1540,790 L 1410,750 L 1290,770 L 1170,680 L 1050,590 L 930,620 L 810,520 L 690,470 L 570,490 L 450,390 L 330,340 L 210,360 L 90,250 L 30,180"
            fill="none"
            stroke="#6EE7B7"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#hero-trend-glow)"
          />
          {[
            [1540, 790], [1410, 750], [1290, 770], [1170, 680], [1050, 590],
            [930, 620], [810, 520], [690, 470], [570, 490], [450, 390],
            [330, 340], [210, 360], [90, 250], [30, 180],
          ].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="2.5" fill="#A7F3D0" />
          ))}
        </g>

      </svg>
    </div>
  )
}

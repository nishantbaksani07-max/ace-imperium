import styles from './HeroParticles.module.css'

/*
 * Pure-CSS particle layer for the landing hero. Each particle is a tiny
 * mint-tinted dot that drifts slowly downward with a subtle horizontal
 * sway. No JS, no video, perfect loop by definition. The whole layer is
 * disabled for prefers-reduced-motion users via the module CSS.
 */

type Particle = {
  left: string         // starting horizontal position (vw)
  top: string          // starting vertical offset (vh)
  size: number         // px diameter
  fall: number         // seconds for the full vertical drift cycle
  fallDelay: number    // seconds offset so they're staggered
  driftDuration: number // seconds for one left-right sway cycle
  opacity: number
}

// 26 particles, sized + speeded so the snow actually reads as motion.
// Falls in 18–35 sec (was 75–140 — invisibly slow). Sizes 2.5–5px.
// Opacity 0.55–0.9 (was 0.18–0.45 — dust not snow).
const PARTICLES: Particle[] = [
  { left: '4%',  top: '-5vh',  size: 3.5, fall: 22, fallDelay: 0,   driftDuration: 5, opacity: 0.75 },
  { left: '9%',  top: '-15vh', size: 2.5, fall: 30, fallDelay: 4,   driftDuration: 6, opacity: 0.55 },
  { left: '14%', top: '-2vh',  size: 4,   fall: 24, fallDelay: 9,   driftDuration: 5, opacity: 0.85 },
  { left: '19%', top: '-20vh', size: 2.5, fall: 32, fallDelay: 14,  driftDuration: 7, opacity: 0.5  },
  { left: '24%', top: '-8vh',  size: 3,   fall: 26, fallDelay: 2,   driftDuration: 4, opacity: 0.7  },
  { left: '29%', top: '-25vh', size: 2.5, fall: 28, fallDelay: 18,  driftDuration: 6, opacity: 0.6  },
  { left: '34%', top: '-12vh', size: 4.5, fall: 23, fallDelay: 7,   driftDuration: 5, opacity: 0.9  },
  { left: '38%', top: '-3vh',  size: 2.5, fall: 30, fallDelay: 12,  driftDuration: 6, opacity: 0.55 },
  { left: '43%', top: '-18vh', size: 3,   fall: 25, fallDelay: 5,   driftDuration: 5, opacity: 0.75 },
  { left: '48%', top: '-22vh', size: 2.5, fall: 32, fallDelay: 20,  driftDuration: 7, opacity: 0.55 },
  { left: '52%', top: '-6vh',  size: 4,   fall: 24, fallDelay: 11,  driftDuration: 5, opacity: 0.85 },
  { left: '57%', top: '-14vh', size: 2.5, fall: 28, fallDelay: 17,  driftDuration: 6, opacity: 0.6  },
  { left: '62%', top: '-9vh',  size: 3.5, fall: 22, fallDelay: 3,   driftDuration: 5, opacity: 0.8  },
  { left: '67%', top: '-19vh', size: 2.5, fall: 30, fallDelay: 15,  driftDuration: 7, opacity: 0.55 },
  { left: '71%', top: '-4vh',  size: 4,   fall: 25, fallDelay: 8,   driftDuration: 5, opacity: 0.85 },
  { left: '76%', top: '-24vh', size: 2.5, fall: 33, fallDelay: 22,  driftDuration: 7, opacity: 0.5  },
  { left: '81%', top: '-11vh', size: 3,   fall: 26, fallDelay: 6,   driftDuration: 5, opacity: 0.7  },
  { left: '85%', top: '-7vh',  size: 4.5, fall: 23, fallDelay: 13,  driftDuration: 4, opacity: 0.9  },
  { left: '90%', top: '-17vh', size: 2.5, fall: 29, fallDelay: 19,  driftDuration: 6, opacity: 0.6  },
  { left: '95%', top: '-5vh',  size: 3.5, fall: 24, fallDelay: 1,   driftDuration: 5, opacity: 0.8  },
  { left: '16%', top: '-30vh', size: 2.5, fall: 35, fallDelay: 25,  driftDuration: 7, opacity: 0.5  },
  { left: '31%', top: '-28vh', size: 3,   fall: 30, fallDelay: 21,  driftDuration: 6, opacity: 0.65 },
  { left: '46%', top: '-32vh', size: 2.5, fall: 34, fallDelay: 27,  driftDuration: 7, opacity: 0.55 },
  { left: '60%', top: '-26vh', size: 3,   fall: 28, fallDelay: 16,  driftDuration: 6, opacity: 0.7  },
  { left: '73%', top: '-29vh', size: 2.5, fall: 32, fallDelay: 23,  driftDuration: 7, opacity: 0.55 },
  { left: '88%', top: '-31vh', size: 3,   fall: 30, fallDelay: 24,  driftDuration: 6, opacity: 0.65 },
]

export default function HeroParticles() {
  return (
    <div className={styles.layer} aria-hidden="true">
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className={styles.particle}
          style={{
            left: p.left,
            top: p.top,
            width: `${p.size}px`,
            height: `${p.size}px`,
            opacity: p.opacity,
            animationDuration: `${p.fall}s, ${p.driftDuration}s`,
            animationDelay: `-${p.fallDelay}s, -${p.fallDelay / 2}s`,
          }}
        />
      ))}
    </div>
  )
}

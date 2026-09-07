'use client'

import CoachGem, { type CoachPreset } from '@/components/CoachGem'
import styles from './gemCoach.module.css'

/**
 * Gem Coach concepts — a visual demo of the Vitality coach gem FAMILY, built
 * 1:1 on the real gem-library v2 gem. Each card mounts the shared CoachGem
 * (the exact reusable component pages drop in), so the demo is the truth.
 * Echo is the macro AI recommender coach.
 */

interface Concept {
  preset: CoachPreset
  name: string
  role: string
  blurb: string
  spec: string
}

const CONCEPTS: Concept[] = [
  {
    preset: 'sage',
    name: 'Sage',
    role: 'Your steady guide',
    blurb: 'Calm, grounded, always present. The core Vitality voice that keeps you centered.',
    spec: 'icosahedron · mint · focus',
  },
  {
    preset: 'spark',
    name: 'Spark',
    role: 'Hype + accountability',
    blurb: 'Celebrates your wins and keeps you moving. Energetic, warm, a little loud.',
    spec: 'octahedron · amber · excited',
  },
  {
    preset: 'echo',
    name: 'Echo',
    role: 'Macro AI recommender coach',
    blurb: 'Asks the right questions and sees the patterns in your meals. Thoughtful, curious, precise.',
    spec: 'dodecahedron · iris · curious',
  },
]

export default function GemCoach() {
  return (
    <main className={`${styles.page} grain-overlay`}>
      <div className={styles.atmosphere} aria-hidden />

      <header className={styles.head}>
        <span className={styles.eyebrow}>gem coach · concepts</span>
        <h1 className={styles.title}>Meet the coach gems</h1>
        <p className={styles.sub}>
          Three concepts for the Vitality coach, all the real gem. Each is its own shape,
          colorway, and personality, playing its signature move on a loop. Echo is the macro
          AI recommender coach.
        </p>
      </header>

      <div className={styles.row}>
        {CONCEPTS.map((c) => (
          <article key={c.preset} className={styles.card}>
            <div className={styles.gemStage}>
              <CoachGem preset={c.preset} />
            </div>
            <h2 className={styles.name}>{c.name}</h2>
            <p className={styles.role}>{c.role}</p>
            <p className={styles.blurb}>{c.blurb}</p>
            <span className={styles.spec}>{c.spec}</span>
          </article>
        ))}
      </div>
    </main>
  )
}

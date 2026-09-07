import type { Metadata } from 'next'
import GemCoach from './GemCoach'

export const metadata: Metadata = {
  title: 'Gem Coach concepts · Vitality',
  description: 'Concept demo for the Vitality coach gem family — real gems, shape + color + personality.',
}

// Public route (not under /app, /account, or /welcome — see middleware), so the
// concept demo is reachable without auth at /gem-coach. Mounts the real
// HeroCrystal gem in three coach personalities to compare.
export default function GemCoachPage() {
  return <GemCoach />
}

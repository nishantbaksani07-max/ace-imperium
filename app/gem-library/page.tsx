import type { Metadata } from 'next'
import GemLibrary from './GemLibrary'

export const metadata: Metadata = {
  title: 'Gem Library v2 · Vitality',
  description: 'Internal design lab for the canonical Vitality gem and its signature animations.',
}

// Public route (not under /app, /account, or /welcome — see middleware), so
// the lab is reachable without auth at /gem-library on any deploy. This is
// the v2 clean-slate home for the canonical gem: it mounts the real
// HeroCrystal character-mode component (the exact /welcome gem, no re-port,
// no drift) and gives us a surface to build every signature move on top of.
export default function GemLibraryPage() {
  return <GemLibrary />
}

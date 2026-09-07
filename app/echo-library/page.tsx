import type { Metadata } from 'next'
import EchoLibrary from './EchoLibrary'

export const metadata: Metadata = {
  title: 'Echo · coach lab · Vitality',
  description: 'The lab for Echo, the macro AI recommender coach — build its coaching greetings, moods, and pulses.',
}

// Public route (not under /app, /account, or /welcome — see middleware), like
// /gem-library. The Echo-specific design lab: the real coach gem + its own
// (initially empty) coaching library, seeded with a hello.
export default function EchoLibraryPage() {
  return <EchoLibrary />
}

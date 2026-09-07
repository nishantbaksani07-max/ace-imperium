import type { Metadata } from 'next'
import CozyLibrary from './CozyLibrary'

export const metadata: Metadata = {
  title: 'Cozy Loader Library · Imperium',
  description: 'Internal design lab for the cozy loader, the warm cozy-wait card and its per-section content sets.',
}

// Public route (not under /app, /account, or /welcome, see middleware), so the
// lab is reachable without auth at /cozy-library on any deploy. It mounts the
// REAL CozyLoader component (no re-port, no drift) and drives every section's
// content set from lib/cozy, so this is the one place to see and tune the cozy
// loader as it rolls out across the app.
export default function CozyLibraryPage() {
  return <CozyLibrary />
}

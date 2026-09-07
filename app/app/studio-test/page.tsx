import StudioTest from './StudioTest'

// Cheap, first-party, session-gated test surface for the Studio AI packager.
// Lives under /app so the /app layout already guarantees a logged-in user; the
// page calls /api/studio/package directly with the session cookie, so it needs
// NONE of the sealed-tile trust-wiring. Purpose: judge package QUALITY on a
// small Anthropic balance before wiring the AI into the shipped tile.
export const metadata = {
  title: 'Studio AI test',
}

export default function StudioTestPage() {
  return <StudioTest />
}

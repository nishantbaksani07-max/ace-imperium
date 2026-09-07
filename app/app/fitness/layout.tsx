import FitnessAtmosphere from './FitnessAtmosphere'

/**
 * Nested layout for every /app/fitness/* route.
 *
 * Renders the fitness atmospheric layer (mountains + horizon glow) once
 * per navigation into the fitness section. Because it lives in a layout
 * rather than on each page, the atmosphere persists when navigating
 * between /app/fitness and /app/fitness/log — no re-mount flicker.
 *
 * Auth + onboarded gating already handled by ../layout.tsx (the /app
 * layout), so this layout is purely decorative.
 */
export default function FitnessLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <FitnessAtmosphere />
      {children}
    </>
  )
}

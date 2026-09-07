'use client'

import { useRouter } from 'next/navigation'
import CelebrationScreen from '@/components/CelebrationScreen'

/**
 * Paired! — the first of the two connect-first celebrations. Fires the moment
 * a WHOOP finishes pairing (reached from /app/vitals/paired after the OAuth
 * callback), before any quiz. The gem rides the LINK mark (a pulse glides the
 * wire and confirms with a check), then one button into the short setup quiz.
 * The second celebration (goal set) lives in GoalSetCelebration, after the
 * quiz, on the RADIAL mark. Both render through CelebrationScreen — see
 * docs/SKILL-celebration-screens.md.
 */
export default function PairedCelebration() {
  const router = useRouter()

  return (
    <CelebrationScreen
      gemGlyph="LINK"
      backHref="/app/vitals"
      eyebrow="you're paired"
      title="your whoop is linked."
      highlight="whoop"
      sub="now a couple of quick questions so i can build your readings around you, not a stranger."
      primary={{ label: 'take the quiz', onClick: () => router.push('/app/vitals/quiz') }}
    />
  )
}

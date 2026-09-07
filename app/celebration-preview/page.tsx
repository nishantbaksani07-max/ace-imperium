import CelebrationScreen from '@/components/CelebrationScreen'

/**
 * /celebration-preview — visual demo of the two vitals congrats screens, both
 * rendered through the shared CelebrationScreen system (see
 * docs/SKILL-celebration-screens.md). Public, no auth, real gems.
 *
 *   1. wearable paired  → the LINK mark
 *   2. quiz complete    → the RADIAL mark
 *
 * Scroll between them. This is the template every future congrats screen
 * (e.g. the workout-logger end-of-quiz) is cut from.
 */

const labelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 14,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 40,
  fontSize: 11,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: '#6ee7b7',
  background: 'rgba(7,16,12,0.7)',
  border: '1px solid rgba(110,231,183,0.2)',
  borderRadius: 999,
  padding: '6px 14px',
  backdropFilter: 'blur(6px)',
}

export default function CelebrationPreviewPage() {
  return (
    <main>
      <section style={{ position: 'relative' }}>
        <span style={labelStyle}>01 · wearable paired · the link</span>
        <CelebrationScreen
          gemGlyph="LINK"
          eyebrow="you're paired"
          title="your whoop is linked."
          highlight="whoop"
          sub="now a couple of quick questions so i can build your readings around you, not a stranger."
          primary={{ label: 'take the quiz', href: '#quiz' }}
        />
      </section>

      <section id="quiz" style={{ position: 'relative', borderTop: '1px solid rgba(110,231,183,0.12)' }}>
        <span style={labelStyle}>02 · quiz complete · the radial</span>
        <CelebrationScreen
          gemGlyph="RADIAL"
          eyebrow="your goal is set"
          title="recovery, dialed in."
          highlight="recovery"
          sub="i'll read your mornings around getting you recovered, and nudge the days that need a lighter touch."
          card={{ key: 'working toward', value: 'a stronger recovery score', chip: 'tracking your recovery (%)' }}
          primary={{ label: "let's do it", href: '#' }}
          secondary={{ label: 'pick a different focus', href: '#' }}
        />
      </section>
    </main>
  )
}

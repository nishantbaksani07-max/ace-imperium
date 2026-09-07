import React, { useState } from 'react'

// Import the styles once (here, for a self-contained demo). In a real app
// you'd do this at your root entry instead of per-component.
import '../tokens/tokens.css'
import '../components/styles.css'

import {
  Button,
  Card,
  Input,
  Textarea,
  Badge,
  Ring,
  Ticker,
  PageShell,
  PosterGrid,
} from '../components'
import type { PosterConfig } from '../components'

/**
 * Showcase — renders every component in the kit with dummy data, so you
 * can see the whole system on one page. No app dependencies; drop it into
 * any React route and it just renders.
 */

const eyebrow: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: 'var(--space-4)',
}

const POSTERS: PosterConfig[] = [
  { art: 'aurora',  slot: 'hero',    label: 'Overview', id: 'overview', active: true },
  { art: 'grid',    slot: 'wideTop', label: 'Activity', id: 'activity', active: true },
  { art: 'dots',    slot: 'square',  id: 'concept-a' },
  { art: 'frosted', slot: 'square',  id: 'concept-b' },
  { art: 'duotone', slot: 'wideBot', label: 'Reports', id: 'reports', active: true },
]

export default function Showcase() {
  const [ringValue, setRingValue] = useState(75)
  const [text, setText] = useState('')

  return (
    <PageShell>
      <header>
        <h1 className="dk-card__title" style={{ fontSize: 'var(--text-3xl)' }}>
          Design Kit <em style={{ color: 'var(--accent)' }}>showcase</em>
        </h1>
        <p style={{ color: 'var(--muted)', marginTop: 'var(--space-2)' }}>
          Every component, dummy data, one page.
        </p>
      </header>

      {/* Live ticker */}
      <section>
        <div style={eyebrow}>Ticker</div>
        <Ticker
          items={[
            { label: 'Recovery', value: '92%', live: true },
            { label: 'Streak', value: '14 days' },
            { label: 'Sessions', value: '3' },
            { label: 'Hydration', value: '6/8' },
          ]}
        />
      </section>

      {/* Buttons */}
      <section>
        <div style={eyebrow}>Buttons</div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="primary">Primary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="pill">← Back</Button>
          <Button variant="link">Skip</Button>
          <Button variant="primary" disabled>Disabled</Button>
        </div>
      </section>

      {/* Badges */}
      <section>
        <div style={eyebrow}>Badges</div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Badge tone="accent" dot>Live</Badge>
          <Badge tone="amber">Pending</Badge>
          <Badge tone="red">Over limit</Badge>
          <Badge tone="neutral">Draft</Badge>
        </div>
      </section>

      {/* Ring + Cards */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
        <Card eyebrow="Right now" title="Score ring">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>
            <Ring value={ringValue} label="Today overall" />
            <input
              type="range" min={0} max={100} value={ringValue}
              onChange={e => setRingValue(Number(e.target.value))}
              style={{ width: '80%', accentColor: 'var(--accent)' }}
            />
          </div>
        </Card>

        <Card elevated eyebrow="Surface" title="Elevated card">
          <p style={{ color: 'var(--muted-strong)', lineHeight: 1.5 }}>
            Cards are the translucent surface everything sits on. This one uses the
            <code> elevated </code> variant. Try the interactive one below.
          </p>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Card interactive title="Interactive card">
              <span style={{ color: 'var(--muted)' }}>Hover me — mint glow + lift.</span>
            </Card>
          </div>
        </Card>
      </section>

      {/* Inputs */}
      <section>
        <div style={eyebrow}>Inputs</div>
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <Input label="Name" name="name" placeholder="Jane Doe" />
            <Input label="Email" name="email" type="email" placeholder="jane@example.com" />
            <Input label="With error" name="broken" defaultValue="oops" error="Something's off here" />
            <div />
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Textarea
              label="Notes" name="notes" placeholder="Type something…"
              value={text} onChange={e => setText(e.target.value)}
            />
          </div>
          <div style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-3)' }}>
            <Button variant="primary">Save</Button>
            <Button variant="ghost">Cancel</Button>
          </div>
        </Card>
      </section>

      {/* Poster grid */}
      <section>
        <div style={eyebrow}>Poster grid</div>
        <PosterGrid
          posters={POSTERS}
          onSelect={(id) => alert(`Selected: ${id}`)}
        />
      </section>
    </PageShell>
  )
}

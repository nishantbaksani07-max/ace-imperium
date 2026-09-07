/**
 * Showcase — renders every component in the kit with dummy data. Drop it on a
 * route, or render <Showcase /> at your app root, to see the whole system.
 *
 *   import '../theme.css'
 *   import Showcase from './examples/Showcase.jsx'
 *   …render <Showcase />
 */
import React, { useState } from 'react'
import {
  Root, Container, Stack, Row, Divider,
  Button, Card, CardTitle, CardBody,
  Field, Input, Textarea, Badge, BrandMark,
} from '../components/index.js'

function Section({ title, children }) {
  return (
    <Stack gap={4}>
      <span className="dk-eyebrow">{title}</span>
      {children}
    </Stack>
  )
}

const swatches = [
  ['Black', 'var(--bg)'], ['Elevated', 'var(--bg-elevated)'], ['Mint', 'var(--mint)'],
  ['Mint deep', 'var(--mint-deep)'], ['Amber', 'var(--amber)'], ['Wine', 'var(--wine)'],
  ['Red', 'var(--red)'],
]

export default function Showcase() {
  const [text, setText] = useState('')

  return (
    <Root grain>
      <Container style={{ padding: 'var(--space-12) var(--space-6)' }}>
        <Stack gap={8}>
          <Row gap={4} style={{ justifyContent: 'space-between' }}>
            <BrandMark glyph="◆" word="Design Kit" />
            <Badge tone="mint" dot>v1.0</Badge>
          </Row>

          <h1 className="dk-heading-xl">
            A dark, editorial <span className="dk-serif-italic" style={{ color: 'var(--mint)' }}>design system</span>
          </h1>

          <Divider />

          <Section title="Color">
            <Row gap={3} style={{ flexWrap: 'wrap' }}>
              {swatches.map(([name, value]) => (
                <Stack key={name} gap={2} style={{ alignItems: 'center' }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: 'var(--radius-lg)',
                    background: value, border: '1px solid var(--border-strong)',
                  }} />
                  <span className="dk-text-xs dk-text-muted">{name}</span>
                </Stack>
              ))}
            </Row>
          </Section>

          <Section title="Typography">
            <Stack gap={3}>
              <span className="dk-heading-xl">Heading XL</span>
              <span className="dk-heading-lg">Heading LG</span>
              <span className="dk-heading-md">Heading MD</span>
              <span className="dk-serif-italic" style={{ fontSize: 'var(--text-2xl)' }}>
                Editorial serif italic — where the personality lives
              </span>
              <span className="dk-text-muted-strong">Body text, muted-strong for secondary copy.</span>
              <span className="dk-eyebrow">Mono eyebrow · caption</span>
            </Stack>
          </Section>

          <Section title="Buttons">
            <Row gap={3} style={{ flexWrap: 'wrap' }}>
              <Button>Primary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
              <Button variant="danger">Danger</Button>
              <Button disabled>Disabled</Button>
            </Row>
            <Row gap={3} style={{ flexWrap: 'wrap' }}>
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </Row>
          </Section>

          <Section title="Badges">
            <Row gap={3} style={{ flexWrap: 'wrap' }}>
              <Badge>Default</Badge>
              <Badge tone="mint" dot>Live</Badge>
              <Badge tone="amber">Beta</Badge>
              <Badge tone="red">Error</Badge>
            </Row>
          </Section>

          <Section title="Cards">
            <Row gap={4} style={{ flexWrap: 'wrap', alignItems: 'stretch' }}>
              <Card style={{ flex: '1 1 240px' }}>
                <Stack gap={2}>
                  <CardTitle>Plain card</CardTitle>
                  <CardBody>A bordered surface that floats on the black canvas.</CardBody>
                </Stack>
              </Card>
              <Card hover style={{ flex: '1 1 240px' }}>
                <Stack gap={2}>
                  <CardTitle>Hover card</CardTitle>
                  <CardBody>Hover me — mint glow + border lift.</CardBody>
                </Stack>
              </Card>
            </Row>
          </Section>

          <Section title="Forms">
            <Card style={{ maxWidth: 420 }}>
              <Stack gap={4}>
                <Field label="Email" htmlFor="sc-email">
                  <Input id="sc-email" type="email" placeholder="you@example.com" />
                </Field>
                <Field label="Message" error={text.length > 0 && text.length < 4 ? 'Too short' : undefined}>
                  <Textarea
                    placeholder="Say something…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                </Field>
                <Button block>Submit</Button>
              </Stack>
            </Card>
          </Section>
        </Stack>
      </Container>
    </Root>
  )
}

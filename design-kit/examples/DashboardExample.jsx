/**
 * DashboardExample — the full poster-grid dashboard, assembled from the kit
 * with dummy data only. This is the "whole dashboard" reference: ambient
 * canvas, editorial greeting, and a 6-tile bento grid.
 *
 *   import '../theme.css'
 *   import DashboardExample from './examples/DashboardExample.jsx'
 *   …render <DashboardExample />
 */
import React from 'react'
import { Root, DashboardShell, PosterGrid, Button } from '../components/index.js'

// Dummy tiles — no routing, no data. `href: '#'` marks a tile "active" (shows
// the → arrow + mint hover); omit href to get the "soon" teaser treatment.
const posters = [
  { art: 'aurora',   slot: 'hero',    label: 'Training', href: '#' },
  { art: 'duotone',  slot: 'wideTop', label: 'Fuel',     href: '#' },
  { art: 'mountain', slot: 'tall',    label: 'Peak',     href: '#' },
  { art: 'frosted',  slot: 'square',  label: 'Mind',     href: '#' },
  { art: 'dots',     slot: 'square',  label: 'Brand',    href: '#' },
  { art: 'grid',     slot: 'wideBot', label: 'Finance' }, // no href → "soon"
]

export default function DashboardExample() {
  return (
    <Root grain>
      <DashboardShell
        greeting="Good evening,"
        accent="Alex"
        date="Tuesday · June 9"
        action={<Button variant="ghost" size="sm">Settings</Button>}
      >
        <PosterGrid posters={posters} />
      </DashboardShell>
    </Root>
  )
}

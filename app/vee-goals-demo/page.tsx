import type { Metadata } from 'next'
import VeeGoalsDemo from './VeeGoalsDemo'

export const metadata: Metadata = {
  title: 'Imperium · Goals (preview)',
  description: 'Preview of the Imperium-housed Goals experience: identity + habits, auto-tracked, with the real Imperium gem reaching out when you slip.',
}

// Public route (top-level, not under /app, /account, /welcome — see middleware),
// so the preview is reachable without auth at /vee-goals-demo on any deploy.
// Mounts the REAL Imperium gem (CoachGem 'echo') with its real moods.
export default function VeeGoalsDemoPage() {
  return <VeeGoalsDemo />
}

import type { Metadata } from 'next'
import VeeGoalsDemo from './VeeGoalsDemo'

export const metadata: Metadata = {
  title: 'Vee · Goals (preview)',
  description: 'Preview of the Vee-housed Goals experience: identity + habits, auto-tracked, with the real Vee gem reaching out when you slip.',
}

// Public route (top-level, not under /app, /account, /welcome — see middleware),
// so the preview is reachable without auth at /vee-goals-demo on any deploy.
// Mounts the REAL Vee gem (CoachGem 'echo') with its real moods.
export default function VeeGoalsDemoPage() {
  return <VeeGoalsDemo />
}

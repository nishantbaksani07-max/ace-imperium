'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './macros.module.css'

const STEPS = [
  'Reading your plate',
  'Spotting each food',
  'Estimating portion sizes',
  'Matching foods to the USDA database',
  'Verifying the macros',
  'Adding up your plate',
]

const FACTS = [
  'Macros come from the verified USDA database, not a guess.',
  'Protein keeps you fuller for longer than carbs or fat.',
  'Cooked and raw weights differ a lot. We account for it.',
  'You can fix any food or portion after it logs.',
  'Tap a food anytime to correct what it is.',
]

interface Props {
  show: boolean
}

export default function AnalyzingOverlay({ show }: Props) {
  const [stepIdx, setStepIdx] = useState(0)
  const [factIdx, setFactIdx] = useState(0)
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const factTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!show) {
      // clear intervals and reset indices when hidden
      if (stepTimer.current) clearInterval(stepTimer.current)
      if (factTimer.current) clearInterval(factTimer.current)
      stepTimer.current = null
      factTimer.current = null
      setStepIdx(0)
      setFactIdx(0)
      return
    }

    // reset to first message each time show flips true
    setStepIdx(0)
    setFactIdx(0)

    stepTimer.current = setInterval(() => {
      setStepIdx(i => (i + 1) % STEPS.length)
    }, 2600)

    // offset fact cycling so they don't change in lockstep
    factTimer.current = setInterval(() => {
      setFactIdx(i => (i + 1) % FACTS.length)
    }, 3900)

    return () => {
      if (stepTimer.current) clearInterval(stepTimer.current)
      if (factTimer.current) clearInterval(factTimer.current)
    }
  }, [show])

  if (!show) return null

  return (
    <div className={styles.analyzeOverlay} role="status" aria-live="polite" aria-label="Analyzing your meal">
      <div className={styles.analyzeCard}>
        <div className={styles.analyzePulse} aria-hidden>
          <span className={styles.analyzePulseRing} />
          <span className={styles.analyzePulseRing} />
          <span className={styles.analyzePulseRing} />
          <span className={styles.analyzePulseDot} />
        </div>
        <p className={styles.analyzeStep}>{STEPS[stepIdx]}</p>
        <p className={styles.analyzeFact}>{FACTS[factIdx]}</p>
      </div>
    </div>
  )
}

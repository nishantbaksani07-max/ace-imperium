'use client'

import { useState } from 'react'
import VeeTile from './VeeTile'
import ConfirmTile from './ConfirmTile'
import ChoiceTile, { type ChoiceOption } from './ChoiceTile'
import styles from './veeTile.module.css'
import { confirmTrainingDay } from '@/app/app/mentor/actions'
import { getSplitGlyphKind } from '@/components/SplitGlyph'
import type { Category } from '@/app/app/fitness/log/splitData'
import type { TrainingDayOption } from '@/app/app/mentor/types'

export interface TrainingDayCardProps {
  /** Local date key YYYY-MM-DD. */
  today: string
  /** Best-guess day name, or null when there's no basis to guess. */
  guessName: string | null
  /** Sub-line reasoning for the guess (empty when no guess). */
  reason: string
  /** All rotation days (name + category), for the Choice fallback. */
  options: TrainingDayOption[]
}

type Phase = 'confirm' | 'pick' | 'done'

const Check = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>

export default function TrainingDayCard({ today, guessName, reason, options }: TrainingDayCardProps) {
  // No guess -> start on the pick card; otherwise confirm the guess.
  const [phase, setPhase] = useState<Phase>(guessName ? 'confirm' : 'pick')
  const [chosen, setChosen] = useState<string>('')

  async function choose(dayName: string) {
    setChosen(dayName)
    setPhase('done')
    await confirmTrainingDay(today, dayName)  // never throws; optimistic UI
  }

  const choiceOptions: ChoiceOption[] = options.map(o => ({
    label: o.name.replace(/ heavy| volume/i, ''),
    value: o.name,
    glyph: getSplitGlyphKind({ name: o.name, category: o.category as Category }),
  }))

  if (phase === 'done') {
    const label = /rest/i.test(chosen) ? 'rest' : chosen.replace(/ heavy| volume/i, '').toLowerCase()
    return (
      <VeeTile tag="locked in">
        <div className={styles.done}>
          <span className={styles.doneGlyph}>{Check}</span>
          <span className={styles.doneText}>Got it, {label} today. Let&apos;s go.</span>
        </div>
      </VeeTile>
    )
  }

  if (phase === 'pick') {
    return (
      <VeeTile tag="your call">
        <ChoiceTile
          lead={<>What are you <b>hitting?</b></>}
          sub="Pick today's day. Your split, your call."
          options={choiceOptions}
          onPick={choose}
        />
      </VeeTile>
    )
  }

  return (
    <VeeTile tag="quick check">
      <ConfirmTile
        lead={<>Today&apos;s <b>{guessName}</b>, yeah?</>}
        sub={reason}
        confirmLabel={`Yep, ${guessName ? guessName.replace(/ heavy| volume/i, '').toLowerCase() : 'that'}`}
        onConfirm={() => guessName && choose(guessName)}
        onReject={() => setPhase('pick')}
      />
    </VeeTile>
  )
}

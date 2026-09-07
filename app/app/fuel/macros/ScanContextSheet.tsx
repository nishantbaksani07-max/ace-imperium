'use client'

import { useEffect, useState } from 'react'
import VitalityIcon, { type IconName } from '@/components/VitalityIcon'
import type { MealType } from '@/lib/nutrition/types'
import { FOOD_SOURCES, FAT_METER, FAT_LEVELS, type FoodSource, type FoodSourceDef, type FatLevel } from '@/lib/nutrition/foodSource'
import styles from './scanSheet.module.css'

const MEALS: { id: MealType; label: string; icon: IconName }[] = [
  { id: 'breakfast', label: 'Breakfast', icon: 'breakfast' },
  { id: 'lunch', label: 'Lunch', icon: 'lunch' },
  { id: 'dinner', label: 'Dinner', icon: 'dinner' },
  { id: 'snack', label: 'Snack', icon: 'snack' },
]

export interface ScanContext {
  mealType: MealType
  foodSummary?: string
  source?: FoodSource
  /** User's hidden-fat dial. Defaults to the picked source's level; if they
   *  move it, it overrides as a smart prior (photo still wins on plain food). */
  fatLevel?: FatLevel
}

interface Props {
  photoUrl: string | null
  defaultMealType: MealType
  onCancel: () => void
  onScan: (ctx: ScanContext) => void
}

// Cozy section heading: a mint tick that springs in, and the label lifts to
// mint once the section has an answer.
function SectionLabel({ children, active, delay }: { children: React.ReactNode; active: boolean; delay: number }) {
  return (
    <p className={`${styles.section} ${active ? styles.sectionActive : ''} ${styles.anim}`} style={{ animationDelay: `${delay}s` }}>
      <span className={styles.tick} aria-hidden />
      {children}
    </p>
  )
}

// The "what does this mean" card. Icon, one-line meaning, an animated hidden-fat
// meter, and one concrete example. Scannable in two seconds.
function SourceInfoCard({ def, onClose }: { def: FoodSourceDef; onClose: () => void }) {
  const [filled, setFilled] = useState(false)
  const meter = FAT_METER[def.fatLevel]
  useEffect(() => {
    const t = setTimeout(() => setFilled(true), 60)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey) }
  }, [onClose])

  return (
    <div className={styles.infoScrim} onClick={onClose} role="dialog" aria-modal="true" aria-label={def.label}>
      <div className={styles.infoCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.infoDisc}>
          <VitalityIcon name={def.icon} size={26} />
        </div>
        <div className={styles.infoTitle}>{def.label}</div>
        <div className={styles.infoMeaning}>{def.meaning}</div>

        <div className={styles.meterLabel}>
          <span>Hidden fat we add back</span>
          <span className={styles.meterWord}>{meter.word}</span>
        </div>
        <div className={styles.meterTrack}>
          <div className={styles.meterFill} style={{ width: filled ? `${meter.fill}%` : '0%' }} />
        </div>

        <div className={styles.infoExample}>{def.example}</div>

        <button type="button" className={styles.infoClose} onClick={onClose}>Got it</button>
      </div>
    </div>
  )
}

export default function ScanContextSheet({ photoUrl, defaultMealType, onCancel, onScan }: Props) {
  const [foodSummary, setFoodSummary] = useState('')
  const [mealType, setMealType] = useState<MealType>(defaultMealType)
  const [source, setSource] = useState<FoodSource | null>(null)
  // Hidden-fat dial. Seeded from the picked source's level so it reads as a
  // fine-tune; null until a source is chosen.
  const [fatLevel, setFatLevel] = useState<FatLevel | null>(null)
  const [info, setInfo] = useState<FoodSourceDef | null>(null)

  // Esc to back out; lock body scroll while the sheet owns the screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !info) onCancel() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onCancel, info])

  function scan() {
    onScan({
      mealType,
      foodSummary: foodSummary.trim() || undefined,
      source: source ?? undefined,
      fatLevel: fatLevel ?? undefined,
    })
  }

  // Picking a source seeds the fat dial to that source's default level; tapping
  // it off clears the dial too.
  function pickSource(id: FoodSource) {
    const next = source === id ? null : id
    setSource(next)
    setFatLevel(next ? FOOD_SOURCES.find((s) => s.id === next)!.fatLevel : null)
  }

  return (
    <div className={styles.overlay} onClick={onCancel} role="dialog" aria-modal="true" aria-label="Add detail before scanning">
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.grab} />

        <div className={styles.anim} style={{ animationDelay: '0.04s' }}>
          <div className={styles.eyebrow}>Before we read it</div>
          <div className={styles.head}>Tell me about this plate</div>
          <div className={styles.headsub}>The more you tell me, the sharper your macros.</div>
        </div>

        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="Your meal" className={`${styles.thumb} ${styles.anim} ${styles.pop}`} style={{ animationDelay: '0.1s' }} />
        ) : (
          <div className={`${styles.thumb} ${styles.anim} ${styles.pop}`} style={{ animationDelay: '0.1s' }} />
        )}

        {/* what's on the plate — leads, since real context is what sharpens the read */}
        <div className={styles.detail}>
          <SectionLabel active={foodSummary.trim().length > 0} delay={0.16}>What&apos;s on the plate?</SectionLabel>
          <div className={`${styles.detailbox} ${styles.anim}`} style={{ animationDelay: '0.2s' }}>
            <VitalityIcon name="search" size={15} />
            <input
              value={foodSummary}
              onChange={(e) => setFoodSummary(e.target.value)}
              placeholder="e.g. chicken, rice, broccoli"
              enterKeyHint="done"
              onKeyDown={(e) => { if (e.key === 'Enter') scan() }}
            />
          </div>
          <p className={`${styles.hint} ${styles.anim}`} style={{ animationDelay: '0.24s' }}>
            A quick list keeps us from inventing extras.
          </p>
        </div>

        <SectionLabel active={mealType !== 'auto'} delay={0.3}>When</SectionLabel>
        <div className={styles.optGrid}>
          {MEALS.map((meal, i) => (
            <button
              key={meal.id}
              type="button"
              className={`${styles.opt} ${mealType === meal.id ? styles.optOn : ''} ${styles.anim}`}
              style={{ animationDelay: `${0.34 + i * 0.04}s` }}
              onClick={() => setMealType(mealType === meal.id ? 'auto' : meal.id)}
            >
              <span className={styles.optIcon}><VitalityIcon name={meal.icon} size={17} /></span>
              <span className={styles.optLabel}>{meal.label}</span>
              <span className={styles.check} aria-hidden><VitalityIcon name="check" size={12} strokeWidth={2.6} /></span>
            </button>
          ))}
        </div>

        <SectionLabel active={source !== null} delay={0.46}>Where it came from</SectionLabel>
        <div className={styles.optGrid}>
          {FOOD_SOURCES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`${styles.opt} ${source === s.id ? styles.optOn : ''} ${styles.anim}`}
              style={{ animationDelay: `${0.5 + i * 0.04}s` }}
              onClick={() => pickSource(s.id)}
            >
              <span className={styles.optIcon}><VitalityIcon name={s.icon} size={17} /></span>
              <span className={styles.optLabel}>{s.label}</span>
              <span className={styles.check} aria-hidden><VitalityIcon name="check" size={12} strokeWidth={2.6} /></span>
              <span
                className={styles.optInfo}
                role="button"
                tabIndex={0}
                aria-label={`What ${s.label} means`}
                onClick={(e) => { e.stopPropagation(); setInfo(s) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setInfo(s) } }}
              >
                i
              </span>
            </button>
          ))}
        </div>

        {/* Hidden-fat dial — appears once a source is picked, seeded from it.
            Drag it down for a plain plate, up for something saucy. */}
        {source !== null && fatLevel !== null && (
          <div className={styles.anim} style={{ animationDelay: '0.62s' }}>
            <SectionLabel active delay={0.62}>How much added oil or fat?</SectionLabel>
            <div className={styles.fatRow}>
              <span className={styles.fatRowHint}>Hidden fat we add back</span>
              <span className={styles.fatRowWord}>{FAT_METER[fatLevel].word}</span>
            </div>
            <input
              type="range"
              min={0}
              max={FAT_LEVELS.length - 1}
              step={1}
              value={FAT_LEVELS.indexOf(fatLevel)}
              onChange={(e) => setFatLevel(FAT_LEVELS[Number(e.target.value)])}
              className={styles.fatSlider}
              aria-label="How much added oil or fat"
              style={{ ['--fill' as string]: `${(FAT_LEVELS.indexOf(fatLevel) / (FAT_LEVELS.length - 1)) * 100}%` }}
            />
            <p className={styles.fatNote}>Plain food? Drag it down.</p>
          </div>
        )}

        <div className={`${styles.actions} ${styles.anim}`} style={{ animationDelay: '0.66s' }}>
          <button type="button" className={styles.scan} onClick={scan}>
            <VitalityIcon name="sparkles" size={17} />
            Scan my plate
          </button>
        </div>
      </div>

      {info && <SourceInfoCard def={info} onClose={() => setInfo(null)} />}
    </div>
  )
}

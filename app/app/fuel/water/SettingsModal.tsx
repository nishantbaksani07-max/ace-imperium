'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import styles from './water.module.css'
import SubstanceSearch from './SubstanceSearch'
import NumberInput from './NumberInput'
import { subExtraMl, fmtMl } from './state'
import type { WaterActions } from './state'
import type { ProfilePatch } from './WaterModule'
import type {
  AccountProfile,
  Sex,
  Substance,
  WaterState,
  WaterUnit,
  WeightUnit,
} from './types'

interface Props {
  state: WaterState
  profile: AccountProfile
  actions: WaterActions
  onProfilePatch: (patch: ProfilePatch) => void
  onClose: () => void
}

// -----------------------------------------------------------------------------
// View model
// -----------------------------------------------------------------------------
//
// The modal has two surfaces:
//
//   Summary  — a clean one-screen overview with per-section Edit chips.
//              Default surface for users who've completed setup.
//
//   Step     — a focused, single-topic screen. Driven by the same step
//              components in two modes:
//                · 'wizard' — first-run flow, linear Next/Back, last
//                             step's primary CTA marks setupComplete.
//                · 'edit'   — opened from a Summary Edit chip; one Back
//                             button returns to Summary.
// -----------------------------------------------------------------------------

type StepKey = 'profile' | 'training' | 'display' | 'caffeine' | 'substances'
type View = 'summary' | StepKey
type Mode = 'wizard' | 'edit'

const WIZARD_STEPS: StepKey[] = ['profile', 'training', 'display', 'caffeine', 'substances']

const STEP_LABELS: Record<StepKey, string> = {
  profile: 'About you',
  training: 'Training',
  display: 'How you drink',
  caffeine: 'Caffeine',
  substances: 'Stimulants & meds',
}

// -----------------------------------------------------------------------------
// Option sets (shared across summary + step renderers)
// -----------------------------------------------------------------------------

const UNIT_OPTS: { v: WaterUnit; label: string }[] = [
  { v: 'bottle', label: 'Bottles' },
  { v: 'glass',  label: 'Glasses' },
  { v: 'oz',     label: 'oz' },
  { v: 'ml',     label: 'ml' },
]

// user_profile.sex is M | F only, so 'Other' isn't an option here. The
// underlying water formula treats non-male as no +200 ml adjustment.
const SEX_OPTS: { v: Sex; label: string }[] = [
  { v: 'm', label: 'Male' },
  { v: 'f', label: 'Female' },
]

const WEIGHT_UNIT_OPTS: { v: WeightUnit; label: string }[] = [
  { v: 'kg', label: 'kg' },
  { v: 'lb', label: 'lb' },
]

const KG_PER_LB = 0.453592

function kgToDisplay(weightKg: number, unit: WeightUnit): number {
  if (unit === 'lb') return Math.round(weightKg / KG_PER_LB * 10) / 10
  return Math.round(weightKg * 10) / 10
}

function displayToKg(value: number, unit: WeightUnit): number {
  if (unit === 'lb') return value * KG_PER_LB
  return value
}

// -----------------------------------------------------------------------------
// Top-level modal
// -----------------------------------------------------------------------------

export default function SettingsModal({ state, profile, actions, onProfilePatch, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  // First-run users land in the wizard; everyone else sees the summary.
  // We capture this on mount only so that completing the wizard during
  // an open session doesn't reshuffle the view from under the user.
  const [view, setView] = useState<View>(() => state.setupComplete ? 'summary' : 'profile')
  const [mode, setMode] = useState<Mode>(() => state.setupComplete ? 'edit' : 'wizard')

  // Close on Escape — common modal expectation. Backdrop click also closes
  // via the onClick handler on the overlay.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  function openStep(step: StepKey) {
    setView(step)
    setMode('edit')
  }

  function finishWizard() {
    actions.markSetupComplete()
    setMode('edit')
    setView('summary')
  }

  function wizardNext() {
    if (view === 'summary') return
    const idx = WIZARD_STEPS.indexOf(view)
    if (idx < 0 || idx >= WIZARD_STEPS.length - 1) {
      finishWizard()
    } else {
      setView(WIZARD_STEPS[idx + 1])
    }
  }

  function wizardBack() {
    if (view === 'summary') return
    const idx = WIZARD_STEPS.indexOf(view)
    if (idx <= 0) return
    setView(WIZARD_STEPS[idx - 1])
  }

  function backToSummary() {
    setView('summary')
  }

  // --- Data ops (used by Summary's Data section) ---------------------------

  function handleExport() {
    const blob = new Blob([actions.exportJson()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `water-coach-data-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImportClick() {
    fileRef.current?.click()
  }

  function handleImportChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        if (!confirm('Replace ALL current data with the imported file?')) return
        const res = actions.importState(parsed)
        if (res === 'invalid') alert('Import failed: file is not valid water-coach data.')
      } catch (err) {
        alert('Import failed: ' + (err instanceof Error ? err.message : 'unknown error'))
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function handleReset() {
    if (!confirm('Wipe ALL water logs and settings? This cannot be undone.')) return
    actions.resetAll()
    onClose()
  }

  // --- Render --------------------------------------------------------------

  const title = view === 'summary'
    ? 'Settings'
    : STEP_LABELS[view]

  const showProgress = mode === 'wizard' && view !== 'summary'
  const stepIdx = view !== 'summary' ? WIZARD_STEPS.indexOf(view) : -1
  const isFirstStep = stepIdx === 0
  const isLastStep = stepIdx === WIZARD_STEPS.length - 1

  return (
    <div
      className={styles.modalBg}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Water settings"
    >
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <header className={styles.modalHead}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </header>

        {showProgress && (
          <div className={styles.wizardProgress} aria-hidden>
            {WIZARD_STEPS.map((_, i) => (
              <span
                key={i}
                className={`${styles.wizardProgressDot} ${i <= stepIdx ? styles.wizardProgressDotActive : ''}`}
              />
            ))}
            <span className={styles.wizardProgressLabel}>
              Step {stepIdx + 1} of {WIZARD_STEPS.length}
            </span>
          </div>
        )}

        {view === 'summary' ? (
          <SummaryView
            state={state}
            profile={profile}
            onEditStep={openStep}
            onExport={handleExport}
            onImport={handleImportClick}
            onReset={handleReset}
            onDone={onClose}
          />
        ) : (
          <StepShell
            mode={mode}
            onNext={wizardNext}
            onBack={wizardBack}
            onCancel={backToSummary}
            isFirstStep={isFirstStep}
            isLastStep={isLastStep}
          >
            {view === 'profile' && (
              <ProfileStep
                profile={profile}
                onProfilePatch={onProfilePatch}
              />
            )}
            {view === 'training' && (
              <TrainingStep state={state} actions={actions} />
            )}
            {view === 'display' && (
              <DisplayStep state={state} actions={actions} />
            )}
            {view === 'caffeine' && (
              <CaffeineStep state={state} actions={actions} />
            )}
            {view === 'substances' && (
              <SubstancesStep state={state} actions={actions} />
            )}
          </StepShell>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleImportChange}
        />
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Summary view
// -----------------------------------------------------------------------------

interface SummaryProps {
  state: WaterState
  profile: AccountProfile
  onEditStep: (step: StepKey) => void
  onExport: () => void
  onImport: () => void
  onReset: () => void
  onDone: () => void
}

function SummaryView({ state, profile, onEditStep, onExport, onImport, onReset, onDone }: SummaryProps) {
  const weightDisp = kgToDisplay(profile.weightKg, profile.weightUnit)
  const sexLabel = profile.sex === 'm' ? 'Male' : 'Female'
  const displayLabel = (() => {
    if (state.unit === 'bottle') return `Bottles (${state.bottleMl} ml)`
    if (state.unit === 'glass') return `Glasses (${state.glassMl} ml)`
    if (state.unit === 'oz') return 'oz'
    return 'ml'
  })()

  const rows: { key: StepKey; label: string; value: string }[] = [
    { key: 'profile',  label: STEP_LABELS.profile,  value: `${weightDisp} ${profile.weightUnit} · ${sexLabel} · ${profile.age}` },
    { key: 'training', label: STEP_LABELS.training, value: `${state.activityHrsPerWeek} h / week` },
    { key: 'display',  label: STEP_LABELS.display,  value: displayLabel },
    { key: 'caffeine', label: STEP_LABELS.caffeine, value: `${state.caffeineMgPerDay} mg / day` },
    {
      key: 'substances',
      label: STEP_LABELS.substances,
      value: state.substances.length === 0
        ? 'None added'
        : `${state.substances.length} added`,
    },
  ]

  return (
    <>
      <div className={styles.summaryList}>
        {rows.map(row => (
          <button
            key={row.key}
            type="button"
            className={styles.summaryRow}
            onClick={() => onEditStep(row.key)}
            aria-label={`Edit ${row.label.toLowerCase()}`}
          >
            <div className={styles.summaryRowText}>
              <span className={styles.summaryRowLabel}>{row.label}</span>
              <span className={styles.summaryRowValue}>{row.value}</span>
            </div>
            <span className={styles.summaryRowEdit}>Edit</span>
          </button>
        ))}
      </div>

      <section className={styles.setSection}>
        <h3 className={styles.setSectionTitle}>Data</h3>
        <div className={styles.dataRow}>
          <button type="button" className="btn btn-ghost" onClick={onExport}>
            Export JSON
          </button>
          <button type="button" className="btn btn-ghost" onClick={onImport}>
            Import JSON
          </button>
          <button
            type="button"
            className={`btn btn-ghost ${styles.dangerBtn}`}
            onClick={onReset}
          >
            Reset all
          </button>
        </div>
      </section>

      <footer className={styles.modalFoot}>
        <button type="button" className="btn btn-primary btn-block" onClick={onDone}>
          Done
        </button>
      </footer>
    </>
  )
}

// -----------------------------------------------------------------------------
// Step shell — wraps a step's body with the appropriate footer (wizard
// Back/Next vs edit Save & return).
// -----------------------------------------------------------------------------

interface StepShellProps {
  mode: Mode
  onNext: () => void
  onBack: () => void
  onCancel: () => void
  isFirstStep: boolean
  isLastStep: boolean
  children: React.ReactNode
}

function StepShell({ mode, onNext, onBack, onCancel, isFirstStep, isLastStep, children }: StepShellProps) {
  return (
    <>
      <div className={styles.stepBody}>{children}</div>
      <footer className={styles.modalFoot}>
        {mode === 'wizard' ? (
          <div className={styles.wizardNav}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onBack}
              disabled={isFirstStep}
            >
              Back
            </button>
            <button type="button" className="btn btn-primary" onClick={onNext}>
              {isLastStep ? 'Done. You’re set' : 'Next'}
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-primary btn-block" onClick={onCancel}>
            Save & back to summary
          </button>
        )}
      </footer>
    </>
  )
}

// -----------------------------------------------------------------------------
// Step bodies
// -----------------------------------------------------------------------------

function ProfileStep({
  profile,
  onProfilePatch,
}: {
  profile: AccountProfile
  onProfilePatch: (patch: ProfilePatch) => void
}) {
  const [weightInput, setWeightInput] = useState(() =>
    String(kgToDisplay(profile.weightKg, profile.weightUnit)),
  )
  useEffect(() => {
    setWeightInput(String(kgToDisplay(profile.weightKg, profile.weightUnit)))
  }, [profile.weightKg, profile.weightUnit])

  function commitWeight(raw: string) {
    const parsed = parseFloat(raw)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setWeightInput(String(kgToDisplay(profile.weightKg, profile.weightUnit)))
      return
    }
    const kg = displayToKg(parsed, profile.weightUnit)
    if (Math.abs(kg - profile.weightKg) < 0.05) return
    onProfilePatch({ weightKg: Math.round(kg * 10) / 10 })
  }

  return (
    <>
      <p className={styles.stepIntro}>
        Synced with your Vitality profile. Changes here update everywhere.
      </p>

      <div className={styles.fieldRow}>
        <div className="field">
          <label className="label">Weight</label>
          <input
            type="number"
            className="input"
            step={0.5}
            min={20}
            max={500}
            value={weightInput}
            onChange={e => setWeightInput(e.target.value)}
            onBlur={e => commitWeight(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
        </div>
        <div className="field">
          <label className="label">Unit</label>
          <Segmented
            options={WEIGHT_UNIT_OPTS}
            value={profile.weightUnit}
            onChange={v => onProfilePatch({ weightUnit: v as WeightUnit })}
          />
        </div>
      </div>

      <div className={styles.fieldRow}>
        <div className="field">
          <label className="label">Age</label>
          <input
            type="number"
            className="input"
            value={profile.age}
            readOnly
            aria-describedby="water-age-hint"
          />
          <p id="water-age-hint" className={styles.setHint}>
            From your birthday. Edit in account settings.
          </p>
        </div>
        <div className="field">
          <label className="label">Sex</label>
          <Segmented
            options={SEX_OPTS}
            value={profile.sex}
            onChange={v => onProfilePatch({ sex: v as Sex })}
          />
        </div>
      </div>
    </>
  )
}

function TrainingStep({ state, actions }: { state: WaterState; actions: WaterActions }) {
  return (
    <>
      <p className={styles.stepIntro}>
        Roughly how many hours per week do you train hard enough to sweat?
        Used to add ~500&nbsp;ml per training day.
      </p>
      <div className="field">
        <label className="label">Training hours per week</label>
        <NumberInput
          className="input"
          min={0}
          max={40}
          step={0.5}
          value={state.activityHrsPerWeek}
          onCommit={actions.setActivity}
        />
        <p className={styles.setHint}>
          Lifting, cardio, sport, hot yoga. Walking doesn&apos;t count.
        </p>
      </div>
    </>
  )
}

function DisplayStep({ state, actions }: { state: WaterState; actions: WaterActions }) {
  return (
    <>
      <p className={styles.stepIntro}>
        How do you want to see your water target? Pick whatever you
        actually carry around.
      </p>
      <div className="field">
        <label className="label">Show water as</label>
        <Segmented
          options={UNIT_OPTS}
          value={state.unit}
          onChange={v => actions.setUnit(v as WaterUnit)}
        />
      </div>

      {(state.unit === 'bottle' || state.unit === 'glass') && (
        <div className={styles.fieldRow}>
          {state.unit === 'bottle' && (
            <div className="field">
              <label className="label">Bottle size (ml)</label>
              <NumberInput
                className="input"
                min={100}
                max={2000}
                step={50}
                value={state.bottleMl}
                onCommit={actions.setBottleMl}
              />
            </div>
          )}
          {state.unit === 'glass' && (
            <div className="field">
              <label className="label">Glass size (ml)</label>
              <NumberInput
                className="input"
                min={100}
                max={500}
                step={10}
                value={state.glassMl}
                onCommit={actions.setGlassMl}
              />
            </div>
          )}
        </div>
      )}
    </>
  )
}

function CaffeineStep({ state, actions }: { state: WaterState; actions: WaterActions }) {
  return (
    <>
      <p className={styles.stepIntro}>
        Average caffeine on a normal day. Above 200&nbsp;mg starts to add
        a small water requirement.
      </p>
      <div className="field">
        <label className="label">Average caffeine per day (mg)</label>
        <NumberInput
          className="input"
          min={0}
          max={1000}
          step={10}
          value={state.caffeineMgPerDay}
          onCommit={actions.setCaffeine}
        />
        <p className={styles.setHint}>
          ~1 cup of coffee = 95mg · espresso shot = 75mg · energy drink = 160mg.
        </p>
      </div>
    </>
  )
}

function SubstancesStep({ state, actions }: { state: WaterState; actions: WaterActions }) {
  return (
    <>
      <p className={styles.stepIntro}>
        Anything that pulls extra water: ADHD stims, diuretics, decongestants,
        nicotine, alcohol. Skip this step if none apply.
      </p>
      <div className="field">
        <label className="label">Search to add</label>
        <SubstanceSearch onAdd={actions.addSubstance} />
      </div>

      <div className={styles.subsList}>
        {state.substances.length === 0 ? (
          <p className={styles.subsEmpty}>No substances added.</p>
        ) : (
          state.substances.map(s => (
            <SubstanceRow
              key={s.id}
              s={s}
              onSetDose={n => actions.setSubstanceDose(s.id, n)}
              onSetStrength={n => actions.setSubstanceStrength(s.id, n)}
              onRemove={() => actions.removeSubstance(s.id)}
            />
          ))
        )}
      </div>
    </>
  )
}

function SubstanceRow({
  s,
  onSetDose,
  onSetStrength,
  onRemove,
}: {
  s: Substance
  onSetDose: (n: number) => void
  onSetStrength: (n: number) => void
  onRemove: () => void
}) {
  const dose = s.dose ?? s.defaultDose
  const strength = s.strengthMg ?? s.defaultStrengthMg ?? 0
  const hasStrength = !!s.strengthOptions?.length
  const extra = useMemo(() => subExtraMl(s), [s])

  return (
    <div className={styles.subRow}>
      <div className={styles.subRowInfo}>
        <div className={styles.subRowName}>{s.name}</div>
        <div className={styles.subRowMeta}>
          + {fmtMl(extra)} / day · {s.cat}
        </div>
      </div>
      {hasStrength && (
        <div className={styles.subRowDose}>
          <select
            className={styles.subStrengthSelect}
            value={strength}
            onChange={e => onSetStrength(parseFloat(e.target.value) || 0)}
            aria-label={`${s.name} strength in mg`}
          >
            {s.strengthOptions!.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <span className={styles.subDoseUnit}>mg / pouch</span>
        </div>
      )}
      <div className={styles.subRowDose}>
        <NumberInput
          className={styles.subDoseInput}
          min={0}
          step={0.5}
          value={dose}
          onCommit={onSetDose}
        />
        <span className={styles.subDoseUnit}>{s.unit}</span>
      </div>
      <button
        type="button"
        className={styles.subRowDel}
        aria-label={`Remove ${s.name}`}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Segmented control — small reusable pill for the modal. Same DOM shape as
// finance's currency selector but unscoped (each consumer passes its own
// option set and value type).
// -----------------------------------------------------------------------------

interface SegmentedProps<T extends string> {
  options: { v: T; label: string }[]
  value: T
  onChange: (v: T) => void
}

function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <div className={styles.seg} role="radiogroup">
      {options.map(o => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={o.v === value}
          className={`${styles.segBtn} ${o.v === value ? styles.segBtnActive : ''}`}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

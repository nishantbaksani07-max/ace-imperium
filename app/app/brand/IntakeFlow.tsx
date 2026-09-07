'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './brand.module.css'
import { accentVars, ARCHETYPE_DEFAULTS, PICKER_ARCHETYPES } from './archetypes'
import {
  ARCHETYPE_BLURBS,
  ARCHETYPE_LABELS,
  PLATFORM_LABELS,
} from './types'
import type { Archetype } from './types'
import type { NewBrandInput } from './state'

interface Props {
  onClose: () => void
  onCreate: (input: NewBrandInput) => void
}

/**
 * Two-step "new brand" flow.
 *
 * Step 1 — Pick: a big search field "What are you building?" plus a
 * grid of 8 archetype chips (Creator / Shop / Service / Channel /
 * Product / Construction / Restaurant / Other). If the user types in
 * the search field and hits Enter, we hit /api/brand/intake and let
 * Claude pick the archetype + draft a name/blurb/emoji + suggest
 * follow-up questions. If they tap a chip directly, we skip the AI
 * call and seed from the template.
 *
 * Step 2 — Review: editable preview of everything the brand will be
 * created with (name, blurb, emoji, archetype, schedules, accounts,
 * links, KPIs). Hit "Create brand" to commit.
 *
 * Lighter than the old NewBrandModal: archetype-aware defaults mean
 * fewer fields the user has to fill in by hand.
 */
export default function IntakeFlow({ onClose, onCreate }: Props) {
  const [step, setStep] = useState<'pick' | 'review'>('pick')
  const [description, setDescription] = useState('')
  const [archetype, setArchetype] = useState<Archetype>('creator')
  const [name, setName] = useState('')
  const [blurb, setBlurb] = useState('')
  const [emoji, setEmoji] = useState(ARCHETYPE_DEFAULTS.creator.emoji)
  const [followups, setFollowups] = useState<string[]>([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { searchRef.current?.focus() }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Seed defaults whenever the archetype changes — keeps name + blurb
  // (user-typed) but refreshes emoji to match the new category.
  function applyArchetype(a: Archetype, opts: { keepName?: boolean; keepBlurb?: boolean; keepEmoji?: boolean } = {}) {
    const defaults = ARCHETYPE_DEFAULTS[a]
    setArchetype(a)
    if (!opts.keepEmoji) setEmoji(defaults.emoji)
  }

  // -------- AI path -----------------------------------------------------------

  async function runAiIntake() {
    const desc = description.trim()
    if (!desc) return
    setAiLoading(true)
    setAiError(null)
    try {
      const res = await fetch('/api/brand/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc }),
      })
      const data = await res.json() as {
        archetype?: Archetype
        name?: string
        blurb?: string
        emoji?: string
        followups?: string[]
        error?: string
      }
      if (!res.ok || !data.archetype) {
        throw new Error(data.error || `request failed (${res.status})`)
      }
      // Simplified model: only Creator vs Other. Anything the AI classifies
      // as a specific business type collapses into Other (which now seeds
      // links, marketing socials, goals + reflection).
      const a: Archetype = data.archetype === 'creator' ? 'creator' : 'other'
      setArchetype(a)
      setName(data.name ?? '')
      setBlurb(data.blurb ?? '')
      setEmoji(data.emoji ?? ARCHETYPE_DEFAULTS[a].emoji)
      setFollowups(Array.isArray(data.followups) ? data.followups : [])
      setStep('review')
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'unknown error')
    } finally {
      setAiLoading(false)
    }
  }

  // -------- Template path -----------------------------------------------------

  function pickTemplate(a: Archetype) {
    applyArchetype(a)
    setName('')
    setBlurb('')
    setFollowups([])
    setStep('review')
  }

  // -------- Submit ------------------------------------------------------------

  function handleCreate() {
    const defaults = ARCHETYPE_DEFAULTS[archetype]
    const payload: NewBrandInput = {
      name: name.trim() || 'Untitled brand',
      archetype,
      blurb: blurb.trim(),
      emoji: emoji.trim() || defaults.emoji,
      schedules: defaults.schedules,
      dailyActionLabel: defaults.dailyActionLabel,
      // Seed each suggested account as an empty-handle row — the detail
      // page shows them with a placeholder and the user fills in.
      accounts: defaults.suggestedAccounts.map(a => ({
        platform: a.platform,
        handle: '',
      })),
      links: defaults.suggestedLinks.map(l => ({ label: l.label })),
      kpis: defaults.suggestedKpis.map(k => ({
        label: k.label,
        unit: k.unit,
        value: k.value ?? 0,
      })),
    }
    onCreate(payload)
  }

  // -------- Render ------------------------------------------------------------

  return (
    <div
      className={styles.modalBg}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="New brand"
    >
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <header className={styles.modalHead}>
          <h2 className={styles.modalTitle}>
            {step === 'pick' ? 'What are you building?' : 'Review your brand'}
          </h2>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {step === 'pick' ? (
          <PickStep
            description={description}
            setDescription={setDescription}
            onRunAi={runAiIntake}
            onPickTemplate={pickTemplate}
            aiLoading={aiLoading}
            aiError={aiError}
            searchRef={searchRef}
          />
        ) : (
          <ReviewStep
            archetype={archetype}
            onChangeArchetype={a => applyArchetype(a, { keepEmoji: true })}
            name={name}
            setName={setName}
            blurb={blurb}
            setBlurb={setBlurb}
            emoji={emoji}
            setEmoji={setEmoji}
            followups={followups}
            onBack={() => setStep('pick')}
            onCreate={handleCreate}
          />
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Step 1 — Pick
// -----------------------------------------------------------------------------

interface PickStepProps {
  description: string
  setDescription: (s: string) => void
  onRunAi: () => void
  onPickTemplate: (a: Archetype) => void
  aiLoading: boolean
  aiError: string | null
  searchRef: React.RefObject<HTMLInputElement>
}

function PickStep({
  description, setDescription, onRunAi, onPickTemplate,
  aiLoading, aiError, searchRef,
}: PickStepProps) {
  return (
    <div className={styles.intakeBody}>
      <p className={styles.intakeIntro}>
        Type one sentence about what you’re building, or pick a template below.
      </p>

      <div className={styles.intakeSearchWrap}>
        <input
          ref={searchRef}
          type="text"
          className={styles.intakeSearch}
          placeholder="e.g. construction company in Austin · TikTok creator · Etsy print shop"
          value={description}
          onChange={e => setDescription(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && description.trim() && !aiLoading) {
              e.preventDefault()
              onRunAi()
            }
          }}
          spellCheck
          autoComplete="off"
        />
        <button
          type="button"
          className={styles.intakeSearchBtn}
          onClick={onRunAi}
          disabled={!description.trim() || aiLoading}
        >
          {aiLoading ? 'Thinking…' : 'Continue →'}
        </button>
      </div>

      {aiError && <p className={styles.intakeError}>{aiError}</p>}

      <div className={styles.intakeDivider}>
        <span className={styles.intakeDividerText}>or pick a template</span>
      </div>

      <div className={styles.templateGrid}>
        {PICKER_ARCHETYPES.map(a => (
          <button
            key={a}
            type="button"
            className={styles.templateChip}
            style={accentVars(a)}
            onClick={() => onPickTemplate(a)}
          >
            <span className={styles.templateEmoji} aria-hidden>
              {ARCHETYPE_DEFAULTS[a].emoji}
            </span>
            <span className={styles.templateLabel}>{ARCHETYPE_LABELS[a]}</span>
            <span className={styles.templateBlurb}>{ARCHETYPE_BLURBS[a]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Step 2 — Review
// -----------------------------------------------------------------------------

interface ReviewStepProps {
  archetype: Archetype
  onChangeArchetype: (a: Archetype) => void
  name: string
  setName: (s: string) => void
  blurb: string
  setBlurb: (s: string) => void
  emoji: string
  setEmoji: (s: string) => void
  followups: string[]
  onBack: () => void
  onCreate: () => void
}

function ReviewStep({
  archetype, onChangeArchetype,
  name, setName, blurb, setBlurb, emoji, setEmoji,
  followups, onBack, onCreate,
}: ReviewStepProps) {
  const defaults = ARCHETYPE_DEFAULTS[archetype]

  return (
    <div className={styles.intakeBody}>
      <div className={styles.reviewArchetype}>
        <span className={styles.reviewLabel}>Category</span>
        <select
          className={styles.formInput}
          value={archetype}
          onChange={e => onChangeArchetype(e.target.value as Archetype)}
          aria-label="Archetype"
        >
          {PICKER_ARCHETYPES.map(a => (
            <option key={a} value={a}>
              {ARCHETYPE_DEFAULTS[a].emoji} {ARCHETYPE_LABELS[a]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.reviewIdentityRow}>
        <div className={styles.reviewEmojiField}>
          <span className={styles.reviewLabel}>Icon</span>
          <input
            type="text"
            className={`${styles.formInput} ${styles.reviewEmojiInput}`}
            value={emoji}
            onChange={e => setEmoji(e.target.value)}
            maxLength={4}
            aria-label="Emoji"
          />
        </div>
        <div className={styles.reviewNameField}>
          <span className={styles.reviewLabel}>Name</span>
          <input
            type="text"
            className={styles.formInput}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="What do you call it?"
            autoFocus
          />
        </div>
      </div>

      <div>
        <span className={styles.reviewLabel}>
          One-line description <span className={styles.formOpt}>(optional)</span>
        </span>
        <input
          type="text"
          className={styles.formInput}
          value={blurb}
          onChange={e => setBlurb(e.target.value)}
          placeholder="What you’re building, in a sentence"
        />
      </div>

      <div className={styles.reviewPreview}>
        <span className={styles.reviewLabel}>What you’ll get</span>
        <ul className={styles.reviewPreviewList}>
          <li>
            {defaults.schedules.length > 1 ? 'Schedules: ' : 'Schedule: '}
            {defaults.schedules.map((s, i) => (
              <span key={i}>
                {i > 0 && ' + '}
                <strong>{s.target}</strong> {s.unit}{' '}
                {s.period === 'daily' ? '/ day' : '/ week'}
              </span>
            ))}
            , counter says <em>“{defaults.dailyActionLabel}”</em>
          </li>
          {defaults.suggestedAccounts.length > 0 && (
            <li>
              Account slots: {defaults.suggestedAccounts.map(a => PLATFORM_LABELS[a.platform]).join(', ')}
            </li>
          )}
          {defaults.suggestedLinks.length > 0 && (
            <li>
              Link placeholders: {defaults.suggestedLinks.map(l => l.label).join(', ')}
            </li>
          )}
          {defaults.suggestedKpis.length > 0 && (
            <li>
              KPIs to track: {defaults.suggestedKpis.map(k => k.label).join(', ')}
            </li>
          )}
        </ul>
        <p className={styles.reviewPreviewHint}>
          Edit any of this on the brand’s page after you create it.
        </p>
      </div>

      {followups.length > 0 && (
        <div className={styles.reviewFollowups}>
          <span className={styles.reviewLabel}>Things to fill in next</span>
          <ul className={styles.reviewFollowupList}>
            {followups.slice(0, 4).map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      <footer className={styles.modalFoot}>
        <button type="button" className={styles.btnGhost} onClick={onBack}>← Back</button>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={onCreate}
          disabled={!name.trim()}
        >
          Create brand
        </button>
      </footer>
    </div>
  )
}

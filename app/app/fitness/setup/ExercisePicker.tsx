'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import styles from './setup.module.css'
import {
  EX,
  CATEGORY_GROUPS,
  ABS_EXERCISES,
  defaultSetsReps,
  REST_SEC,
  type DayExercise,
  type Category,
  type DayType,
} from '../log/splitData'
import FormReferenceSheet from '../log/FormReferenceSheet'
import { exerciseReferences } from '@/lib/exerciseReferences'
import { recommendedAddsForPicker, type RecommendationReason } from './exerciseSelection'
import type { IntakeAnswers } from './presets'
import MuscleIcon from '@/components/MuscleIcon'
import { exerciseMuscleDisplay } from '@/lib/training/muscleDisplay'
import { computeStartingWeight } from './tailorTable'
import { setExerciseTune } from './tuneState'
import ExerciseSettings from '../log/ExerciseSettings'
import { unitLabel, kgToDisplay, type Units } from '@/lib/units'
import type { GymLevel } from './actions'

interface ExercisePickerProps {
  dayIdx: number
  dayName: string
  dayType: DayType
  /** Whether to show the HEAVY/VOLUME badge. False when the user isn't
   *  running an H/V split (no volume day) — then it's just noise. */
  showDayType?: boolean
  category: Category
  exercises: DayExercise[]
  onChange: (next: DayExercise[]) => void
  /** When provided, the picker surfaces a "Recommended for you" section
   *  at the top with exercises sourced from the user's intake answers
   *  (priority body parts, restriction substitutes). Falls back to the
   *  legacy "Added by you" behavior when null. */
  intakeAnswers?: IntakeAnswers | null
  /** Per-row labeling source. IDs in this set were what the intake
   *  engine recommended for this exact day given the current preset.
   *  - Picked row whose id is in this set    → "RECOMMENDED" mint pill.
   *  - Picked row whose id is NOT in this set → "YOUR ADD" amber pill.
   *  - Unpicked row whose id IS in this set  → quiet "recommended" hint.
   *  - Unpicked row not in this set          → no extra chrome.
   *  Undefined means the user hasn't done the intake; we skip the
   *  labeling entirely and the picker behaves like before. */
  recommendedExerciseIds?: Set<string>
  /** Per-exercise reasons from the recommendation engine. Keyed by
   *  exercise id (already scoped to this day). Only engine-touched
   *  exercises appear. When a reason exists, the "recommended" pill
   *  becomes a clickable button revealing the one-sentence reason. */
  reasons?: Record<string, RecommendationReason>
  startingWeightKg: number
  sex: 'M' | 'F'
  gymLevel: GymLevel
  units: Units
}

/**
 * Per-day exercise selector — checkbox-list style ported from the splitlog
 * standalone. The whole library is on-screen by default, grouped Compounds
 * / Isolation / Abs by day category. Each row is a toggle: tap to add, tap
 * again to remove. Picked rows show editable sets × reps inline.
 *
 * A search input at the top filters across the entire EX library; matches
 * surface in a "TAP TO ADD" dropdown so the user can pull in lifts from
 * outside the day's recommended groups without leaving the picker.
 */

/** Human label for the day's pattern category, used in the recommend
 *  modal's banner. */
function categoryLabel(c: Category): string {
  switch (c) {
    case 'push':  return 'Push'
    case 'pull':  return 'Pull'
    case 'legs':  return 'Legs'
    case 'upper': return 'Upper'
    case 'lower': return 'Lower'
    case 'rest':  return 'Rest'
  }
}

/** Small glyph drawn next to the category label. Kept as text so it
 *  inherits color and renders crisp at any size. */
function categoryGlyph(c: Category): string {
  switch (c) {
    case 'push':  return '⇈'
    case 'pull':  return '⇊'
    case 'legs':  return '◆'
    case 'upper': return '▲'
    case 'lower': return '▼'
    case 'rest':  return '○'
  }
}

/** Picked "Your picks" row, made sortable via dnd-kit. Extracted to module
 *  scope because `useSortable` is a hook and cannot run inside `renderRow`
 *  (a plain function called in a `.map`). Drag starts ONLY from the grip
 *  handle — taps on Tune / info / × stay tappable. */
function SortablePickRow({
  id,
  name,
  md,
  tierClass,
  isYourAdd,
  summary,
  hasRef,
  tuned,
  onTune,
  onInfo,
  onRemove,
}: {
  id: string
  name: string
  md: ReturnType<typeof exerciseMuscleDisplay>
  tierClass: string
  isYourAdd: boolean
  summary: string | null
  hasRef: boolean
  tuned?: boolean
  onTune: (id: string) => void
  onInfo: (id: string) => void
  onRemove: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <li
      ref={setNodeRef}
      className={styles.pickRow}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      <span
        className={styles.pickGrip}
        style={{ cursor: 'grab', touchAction: 'none' }}
        aria-hidden
        {...attributes}
        {...listeners}
      >
        <svg width="14" height="14" viewBox="0 0 16 16"><g fill="currentColor">
          <circle cx="6" cy="3" r="1.3"/><circle cx="10" cy="3" r="1.3"/>
          <circle cx="6" cy="8" r="1.3"/><circle cx="10" cy="8" r="1.3"/>
          <circle cx="6" cy="13" r="1.3"/><circle cx="10" cy="13" r="1.3"/>
        </g></svg>
      </span>
      {md && (
        <span className={`${styles.pickGlyph} ${tierClass}`} aria-hidden>
          <MuscleIcon name={md.iconKey} size={20} ariaLabel={md.primaryLabel} />
        </span>
      )}
      <span className={styles.pickName}>
        {isYourAdd && <span className={styles.pickYourAdd}>+</span>}
        {name}
        {summary && <span className={styles.pickMeta}>{summary}</span>}
      </span>
      {hasRef && (
        <button type="button" className={styles.pickInfo}
          onClick={() => onInfo(id)}
          aria-label={`How to do ${name}`}>i</button>
      )}
      <button type="button"
        className={`${styles.pickTune} ${tuned ? styles.pickTuneOn : styles.pickTuneOff}`}
        onClick={() => onTune(id)}>
        {tuned ? '✓ tuned' : 'Tune'}
      </button>
      <button type="button"
        className={styles.pickRemove}
        onClick={() => onRemove(id)}
        aria-label={`Remove ${name}`}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      </button>
    </li>
  )
}

export default function ExercisePicker({
  dayIdx,
  dayName,
  dayType,
  showDayType = true,
  category,
  exercises,
  onChange,
  intakeAnswers = null,
  recommendedExerciseIds,
  reasons,
  startingWeightKg,
  sex,
  gymLevel,
  units,
}: ExercisePickerProps) {
  const [search, setSearch] = useState('')
  const [formRefOpenExId, setFormRefOpenExId] = useState<string | null>(null)
  // Which exercise's "why we picked this" popover is open (null = none).
  // One at a time — clicking another pill swaps; outside-click or Esc
  // closes. Tied to exercise id, not row index, so it survives reorder.
  const [openReasonId, setOpenReasonId] = useState<string | null>(null)
  // Close the reason modal on Escape. Outside-click is handled by the
  // overlay backdrop element directly (cleaner than a document-level
  // listener for a focused modal).
  useEffect(() => {
    if (!openReasonId) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenReasonId(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [openReasonId])

  // The full library is collapsed by default. "Your picks" sits on top
  // (always visible); everything else hides behind this one dropdown so
  // the page isn't a wall of checkboxes when the user lands on it.
  const [browseOpen, setBrowseOpen] = useState(false)
  // Which picked lift is open in the tune sheet (null = none).
  const [tuningId, setTuningId] = useState<string | null>(null)

  function tunedSummary(e: DayExercise): string | null {
    if (!e.tuned || typeof e.weightKg !== 'number') return null
    const w = e.weightKg > 0 ? `${kgToDisplay(e.weightKg, units)} ${unitLabel(units)}` : 'BW'
    return `${w} · ${e.sets}×${e.reps}`
  }

  const pickedById = useMemo(() => {
    const map = new Map<string, { entry: DayExercise; index: number }>()
    exercises.forEach((entry, index) => map.set(entry.id, { entry, index }))
    return map
  }, [exercises])

  const recommended = useMemo(() => {
    const cat = CATEGORY_GROUPS[category]
    return {
      compounds: cat.compounds,
      isolation: cat.isolation,
      abs: category !== 'rest' ? ABS_EXERCISES : [],
    }
  }, [category])

  // Top section content. Two sources depending on whether the intake
  // quiz has been completed:
  //   - intakeAnswers present → "Recommended for you" lists the picks
  //     the intake engine would add (priority extras + restriction
  //     substitutes for this day's category), regardless of whether
  //     they're currently in the day. Plus any off-category lifts the
  //     user added via search.
  //   - intakeAnswers null → legacy "Added by you" — only off-category
  //     lifts the user typed in via search.
  const topSection = useMemo(() => {
    const inGroups = new Set([
      ...recommended.compounds,
      ...recommended.isolation,
      ...recommended.abs,
    ])
    const offCategory = exercises.filter(e => !inGroups.has(e.id)).map(e => e.id)

    if (!intakeAnswers) {
      return { label: 'Added by you', ids: offCategory }
    }
    const intakeIds = recommendedAddsForPicker(category, intakeAnswers)
    // Engine-recommended off-category lifts (e.g. a back squat or
    // deadlift living on a Full Body upper-leaning day). Source these
    // from recommendedExerciseIds so they stay visible in "Recommended
    // for you" even after the user unchecks them. Otherwise unchecking
    // would make the row vanish, which feels like the recommendation
    // disappeared.
    const recOffCategory = recommendedExerciseIds
      ? Array.from(recommendedExerciseIds).filter(id => !inGroups.has(id))
      : []
    // Dedupe while preserving priority: engine recommendations first,
    // then intake-driven picker adds, then user-added off-category lifts.
    const seen = new Set<string>()
    const combined: string[] = []
    for (const id of [...recOffCategory, ...intakeIds, ...offCategory]) {
      if (seen.has(id)) continue
      seen.add(id)
      combined.push(id)
    }
    return { label: 'Recommended for you', ids: combined }
  }, [recommended, exercises, intakeAnswers, category, recommendedExerciseIds])

  // Search scans the ENTIRE exercise library — every muscle, every
  // category — so on a Chest day you can still pull in a squat, a curl,
  // anything. The only thing excluded is lifts already picked (can't add
  // twice). Capped so the dropdown stays small.
  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return [] as string[]
    const pickedSet = new Set(exercises.map(e => e.id))
    return Object.keys(EX)
      .filter(id => {
        if (pickedSet.has(id)) return false
        const def = EX[id]
        return def.name.toLowerCase().includes(q) || id.includes(q)
      })
      .slice(0, 8)
  }, [search, exercises])

  function togglePick(id: string) {
    const def = EX[id]
    if (!def) return
    const existing = pickedById.get(id)
    if (existing) {
      onChange(exercises.filter((_, i) => i !== existing.index))
    } else {
      const { sets, reps } = defaultSetsReps(def.tier, dayType)
      onChange([...exercises, { id, sets, reps }])
    }
  }

  function addFromSearch(id: string) {
    togglePick(id)
    setSearch('')
    // The added lift becomes a pick, so it appears immediately in "Your
    // picks" at the top — nothing to expand.
  }

  function handleRemovePicked(id: string) {
    onChange(exercises.filter(e => e.id !== id))
  }

  // Drag-to-reorder for the "Your picks" list. Pointer sensor with a small
  // activation distance so a tap on Tune/info/× doesn't start a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = exercises.map(x => x.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    onChange(arrayMove(exercises, from, to))
  }

  // Picked lifts in pick order — the always-visible "Your picks" group.
  // Off-category adds are picks too, so they're included.
  const pickedIds = useMemo(
    () => exercises.map(e => e.id).filter(id => EX[id]),
    [exercises],
  )

  // How many picks are "your adds" (picked but outside the engine's
  // recommended set). Drives the legend that explains the amber "+".
  const yourAddCount = recommendedExerciseIds
    ? pickedIds.filter(id => !recommendedExerciseIds.has(id)).length
    : 0

  // Everything else for this day, unpicked, recommended-first — the
  // contents of the collapsed "Browse library" dropdown. Union of the
  // recommended top section + the category groups, minus what's picked.
  const browseIds = useMemo(() => {
    const seen = new Set<string>()
    const all: string[] = []
    for (const id of [
      ...topSection.ids,
      ...recommended.compounds,
      ...recommended.isolation,
      ...recommended.abs,
    ]) {
      if (EX[id] && !seen.has(id)) { seen.add(id); all.push(id) }
    }
    const pickedSet = new Set(pickedIds)
    const unpicked = all.filter(id => !pickedSet.has(id))
    const isRec = (id: string) => !!recommendedExerciseIds?.has(id)
    return [...unpicked.filter(isRec), ...unpicked.filter(id => !isRec(id))]
  }, [topSection, recommended, pickedIds, recommendedExerciseIds])

  function renderRow(id: string) {
    const def = EX[id]
    if (!def) return null
    const picked = pickedById.get(id)
    const isPicked = !!picked
    // Recommendation labeling — only shown when the intake has run AND
    // we have a recommendation set for this day. Three states:
    //   recommended + picked   → green "RECOMMENDED" pill (matched the engine)
    //   recommended + unpicked → muted "recommended" (engine picked, you skipped)
    //   not recommended + picked → amber "YOUR ADD" pill (off-script)
    const showRecLabels = !!recommendedExerciseIds
    const isRecommended = showRecLabels && recommendedExerciseIds!.has(id)
    const labelKind: 'rec-on' | 'rec-off' | 'your-add' | null =
      !showRecLabels ? null
      : isRecommended && isPicked   ? 'rec-on'
      : isRecommended && !isPicked  ? 'rec-off'
      : !isRecommended && isPicked  ? 'your-add'
      : null

    // PICKED rows get the clean one-line layout: grip · muscle glyph · name
    // (amber "+" for a your-add) · tuned summary · info "i" · Tune button.
    // Unpicked/library rows fall through to the original tap-to-add layout.
    if (isPicked) {
      const entry = picked!.entry
      const md = exerciseMuscleDisplay(id)
      const tierClass = def.tier === 'heavy_compound' ? styles.glyphT1
        : (def.tier === 'compound' || def.tier === 'heavy_iso') ? styles.glyphT2
        : styles.glyphT3
      const isYourAdd = labelKind === 'your-add'
      const summary = tunedSummary(entry)
      return (
        <SortablePickRow
          key={id}
          id={id}
          name={def.name}
          md={md}
          tierClass={tierClass}
          isYourAdd={isYourAdd}
          summary={summary}
          hasRef={!!exerciseReferences[id]}
          tuned={entry.tuned}
          onTune={setTuningId}
          onInfo={setFormRefOpenExId}
          onRemove={handleRemovePicked}
        />
      )
    }

    // Unpicked library row. Mirrors the picked-row layout (colored muscle
    // glyph · name · info "i") so "Your picks" and "Browse library" read as
    // one family instead of clashing. The only difference is the left
    // affordance: a checkbox to add, where a picked row has a drag grip.
    // Tier and sets × reps deliberately do NOT live here anymore — tier now
    // surfaces in the form-reference card, and sets/reps are set per-lift in
    // the Tune sheet, so showing a default here would be misleading.
    const md = exerciseMuscleDisplay(id)
    const tierClass = def.tier === 'heavy_compound' ? styles.glyphT1
      : (def.tier === 'compound' || def.tier === 'heavy_iso') ? styles.glyphT2
      : styles.glyphT3
    return (
      <li
        key={id}
        className={`${styles.exRow} ${labelKind === 'rec-on' ? styles.exRowRecommended : ''} ${labelKind === 'your-add' ? styles.exRowYourAdd : ''}`}
      >
        <button
          type="button"
          className={styles.exCheck}
          onClick={() => togglePick(id)}
          aria-pressed={false}
          aria-label={`Add ${def.name}`}
        />
        <button
          type="button"
          className={styles.exRowBody}
          onClick={() => togglePick(id)}
        >
          <span className={styles.exRowMain}>
            {md && (
              <span className={`${styles.pickGlyph} ${tierClass}`} aria-hidden>
                <MuscleIcon name={md.iconKey} size={20} ariaLabel={md.primaryLabel} />
              </span>
            )}
            <span className={styles.exName}>{def.name}</span>
            {(labelKind === 'rec-on' || labelKind === 'rec-off') && (() => {
              const reason = reasons?.[id]
              const pillLabel = labelKind === 'rec-on' ? 'recommended' : 'we recommend'
              const baseClass = labelKind === 'rec-on'
                ? `${styles.exTag} ${styles.exTagRec}`
                : `${styles.exTag} ${styles.exTagRecOff}`
              if (!reason) {
                // No reason → passive pill, no popover. Shouldn't happen
                // for engine-recommended exercises since the third pass
                // emits baseline reasons, but kept as a graceful fallback.
                return <span className={baseClass}>{pillLabel}</span>
              }
              return (
                <span
                  role="button"
                  tabIndex={0}
                  className={`${baseClass} ${styles.recPill}`}
                  onClick={e => {
                    e.stopPropagation()
                    e.preventDefault()
                    setOpenReasonId(id)
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      e.stopPropagation()
                      setOpenReasonId(id)
                    }
                  }}
                  aria-label={`Why ${def.name} is recommended`}
                >
                  {pillLabel}
                </span>
              )
            })()}
            {labelKind === 'your-add' && (
              <span className={`${styles.exTag} ${styles.exTagYourAdd}`}>your add</span>
            )}
          </span>
        </button>
        {exerciseReferences[id] && (
          <button
            type="button"
            className={styles.pickInfo}
            onClick={e => { e.stopPropagation(); setFormRefOpenExId(id) }}
            aria-label={`How to do ${def.name}`}
            title="Form reference"
          >
            i
          </button>
        )}
      </li>
    )
  }

  return (
    <div className={styles.exDay}>
      <div className={styles.exDayHead}>
        <span className={styles.exDayIdx}>·{String(dayIdx + 1).padStart(2, '0')}</span>
        <span className={styles.exDayName}>{dayName}</span>
        {showDayType && (
          <span className={`${styles.exDayType} ${styles[`exDayType-${dayType}`]}`}>{dayType}</span>
        )}
      </div>

      <div className={styles.exSearchWrap}>
        <input
          type="text"
          className={styles.exSearch}
          placeholder="Search any exercise…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {searchMatches.length > 0 && (
          <div className={styles.exSearchDropdown}>
            {searchMatches.map(id => {
              const def = EX[id]
              // Match the picked / library rows: muscle glyph + name, no tier
              // pill. The "tier 2/3" jargon read as noise here and clashed
              // with the clean rows below.
              const md = exerciseMuscleDisplay(id)
              const tierClass = def.tier === 'heavy_compound' ? styles.glyphT1
                : (def.tier === 'compound' || def.tier === 'heavy_iso') ? styles.glyphT2
                : styles.glyphT3
              return (
                <button
                  key={id}
                  type="button"
                  className={styles.exSearchHit}
                  onClick={() => addFromSearch(id)}
                >
                  <span className={styles.exSearchHitMain}>
                    {md && (
                      <span className={`${styles.pickGlyph} ${tierClass}`} aria-hidden>
                        <MuscleIcon name={md.iconKey} size={20} ariaLabel={md.primaryLabel} />
                      </span>
                    )}
                    <span className={styles.exName}>{def.name}</span>
                  </span>
                  <span className={styles.exSearchHitCta}>TAP TO ADD</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Your picks — always visible. The lifts chosen for this day, with
          inline sets × reps. Empty until the user adds from the library. */}
      <section className={styles.exSection}>
        <div className={`${styles.exSectionHeader} ${styles.exSectionHeaderStatic} ${styles.exSectionHeaderOpen}`}>
          <span className={styles.exSectionLabel}>Your picks</span>
          <span className={styles.exSectionMeta}>
            <span className={styles.exSectionCount}>{pickedIds.length}</span>
          </span>
        </div>
        {yourAddCount > 0 && (
          <p className={styles.yourAddLegend}>
            <span className={styles.pickYourAdd}>+</span> you added this one. The rest are our picks for this day.
          </p>
        )}
        {pickedIds.length === 0 ? (
          <ul className={styles.exList}>
            <li className={styles.exPicksEmpty}>
              Nothing yet. Open the library below to add lifts.
            </li>
          </ul>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={pickedIds} strategy={verticalListSortingStrategy}>
              <ul className={styles.exList}>
                {pickedIds.map(id => renderRow(id))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </section>

      {/* Browse library — collapsed by default so the full list doesn't hit
          the user at once. Recommended lifts surface first when opened. */}
      <section className={styles.exSection}>
        <button
          type="button"
          className={`${styles.exSectionHeader} ${browseOpen ? styles.exSectionHeaderOpen : ''}`}
          onClick={() => setBrowseOpen(o => !o)}
          aria-expanded={browseOpen}
        >
          <span className={styles.exSectionLabel}>Browse {categoryLabel(category).toLowerCase()} lifts</span>
          <span className={styles.exSectionMeta}>
            <span className={styles.exSectionCount}>{browseIds.length}</span>
            <span className={styles.exSectionChevron} aria-hidden>›</span>
          </span>
        </button>
        {browseOpen && (
          <>
            {/* Make the scope explicit: this list is curated to the day's
                pattern, not the whole catalog. Search reaches everything. */}
            <p className={styles.browseScope}>
              Picked for your {categoryLabel(category).toLowerCase()} day. Search up top to add anything else.
            </p>
            <ul className={styles.exList}>
              {browseIds.map(id => renderRow(id))}
            </ul>
          </>
        )}
      </section>

      {formRefOpenExId && EX[formRefOpenExId] && (
        <FormReferenceSheet
          exerciseId={formRefOpenExId}
          exerciseName={EX[formRefOpenExId].name}
          tier={EX[formRefOpenExId].tier}
          onClose={() => setFormRefOpenExId(null)}
        />
      )}

      {tuningId && EX[tuningId] && (() => {
        const def = EX[tuningId]
        const entry = pickedById.get(tuningId)?.entry
        const fb = defaultSetsReps(def.tier, dayType)
        const estimate = entry?.weightKg ?? computeStartingWeight(tuningId, startingWeightKg, sex, gymLevel)
        return (
          <ExerciseSettings
            exerciseId={tuningId}
            exerciseName={def.name}
            dayType={dayType}
            dayNum={dayIdx + 1}
            currentWeight={estimate}
            currentSets={entry?.sets ?? fb.sets}
            defaultSets={fb.sets}
            currentReps={entry?.reps ?? fb.reps}
            defaultReps={fb.reps}
            currentRest={entry?.restSec ?? REST_SEC[def.tier][dayType]}
            defaultRest={REST_SEC[def.tier][dayType]}
            loggedSetCount={0}
            units={units}
            persistOnSave={false}
            hasRecommendation={true}
            onSaved={(weight, s, r, rt) => {
              let next = exercises
              if (!pickedById.has(tuningId)) next = [...exercises, { id: tuningId, sets: s, reps: r }]
              onChange(setExerciseTune(next, tuningId, { weightKg: weight, restSec: rt, sets: s, reps: r }))
              setTuningId(null)
            }}
            onClose={() => setTuningId(null)}
          />
        )
      })()}

      {/* "Why we recommend" modal — portaled to document.body so the
          blurred backdrop covers the whole viewport (the setup page has
          transformed ancestors that would otherwise trap position:fixed).
          Click backdrop, press Escape, or hit the corner × to dismiss. */}
      {openReasonId && EX[openReasonId] && reasons?.[openReasonId] && typeof document !== 'undefined' && createPortal(
        <div
          className={styles.reasonOverlay}
          onClick={() => setOpenReasonId(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className={styles.reasonModal}
            onClick={e => e.stopPropagation()}
          >
            {(() => {
              // Prefer the per-exercise muscle attribution when available
              // (bench → "Chest · Front delts · Triceps"). Falls back to
              // the day's category glyph + label ("Push") for exercises
              // not yet in EXERCISE_MUSCLE_ATTRIBUTION.
              const muscleDisplay = exerciseMuscleDisplay(openReasonId)
              return (
                <div className={`${styles.reasonCategoryBanner} ${styles[`reasonCategoryBanner-${category}`]}`}>
                  {muscleDisplay ? (
                    <>
                      <span className={styles.reasonCategoryIcon} aria-hidden>
                        <MuscleIcon name={muscleDisplay.iconKey} size={14} ariaLabel={muscleDisplay.primaryLabel} />
                      </span>
                      <span className={styles.reasonCategoryLabel}>{muscleDisplay.joinedLabel}</span>
                    </>
                  ) : (
                    <>
                      <span className={styles.reasonCategoryIcon} aria-hidden>
                        {categoryGlyph(category)}
                      </span>
                      <span className={styles.reasonCategoryLabel}>{categoryLabel(category)}</span>
                    </>
                  )}
                </div>
              )
            })()}
            <h3 className={styles.reasonLift}>
              {EX[openReasonId].name}
              {exerciseReferences[openReasonId] && (
                <span
                  role="button"
                  tabIndex={0}
                  className={styles.reasonInfoBtn}
                  onClick={() => {
                    const id = openReasonId
                    setOpenReasonId(null)
                    setFormRefOpenExId(id)
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      const id = openReasonId
                      setOpenReasonId(null)
                      setFormRefOpenExId(id)
                    }
                  }}
                  aria-label={`What is ${EX[openReasonId].name}`}
                  title="What is this exercise?"
                >
                  i
                </span>
              )}
            </h3>
            <p className={styles.reasonSentence}>
              {reasons[openReasonId].sentence}
            </p>
            {reasons[openReasonId].volumeContext && (
              <div className={styles.reasonStat}>
                <span className={styles.reasonStatRule} aria-hidden />
                <span className={styles.reasonStatText}>{reasons[openReasonId].volumeContext}</span>
                <span className={styles.reasonStatRule} aria-hidden />
              </div>
            )}
            <p className={styles.reasonSource}>
              based on {reasons[openReasonId].sourceLabel}
            </p>
            <button
              type="button"
              className={styles.reasonDismiss}
              onClick={() => setOpenReasonId(null)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import styles from './supplements.module.css'
import { SUPPLEMENT_DB, WINDOWS } from './supplements'
import InfoPopover from './InfoPopover'
import type { DbSupplement, StackItem, TakenMap, WindowKey } from './types'

interface Props {
  items: StackItem[]
  todayTaken: TakenMap
  low: string[]
  onToggleTaken: (id: string) => void
  onToggleLow: (id: string) => void
  onRemove: (id: string) => void
}

export default function StackList({
  items, todayTaken, low,
  onToggleTaken, onToggleLow, onRemove,
}: Props) {
  // Open at most one (i) at a time across the whole stack — feels more
  // focused than every row having its own popover state.
  const [openInfoFor, setOpenInfoFor] = useState<string | null>(null)

  if (items.length === 0) {
    return (
      <section className={styles.emptyCard}>
        <p className={styles.emptyText}>
          Your stack is empty. Add your first supplement below. Search any
          name and we’ll pre-fill the dose + timing.
        </p>
      </section>
    )
  }

  const now = new Date()
  const hour = now.getHours() + now.getMinutes() / 60

  return (
    <section className={styles.stackList}>
      {WINDOWS.map(win => {
        const winItems = items.filter(i => (i.window || 'anytime') === win.key)
        if (winItems.length === 0) return null

        const isPastCutoff = win.cutoffHour !== null && hour > win.cutoffHour

        return (
          <div key={win.key} className={styles.windowGroup}>
            <header className={styles.windowHead}>
              <span className={styles.windowIcon} aria-hidden>{win.icon}</span>
              <span className={styles.windowTitle}>{win.title}</span>
              <span className={styles.windowTime}>{win.time}</span>
            </header>

            <ul className={styles.windowItems}>
              {winItems.map(item => {
                const dbRow = lookupDb(item.sourceId)
                return (
                  <ItemRow
                    key={item.id}
                    item={item}
                    dbRow={dbRow}
                    isTaken={!!todayTaken[item.id]}
                    isLow={low.includes(item.id)}
                    isMissed={isPastCutoff && !todayTaken[item.id]}
                    isInfoOpen={openInfoFor === item.id}
                    onToggleInfo={() => setOpenInfoFor(prev => prev === item.id ? null : item.id)}
                    onToggleTaken={onToggleTaken}
                    onToggleLow={onToggleLow}
                    onRemove={onRemove}
                  />
                )
              })}
            </ul>
          </div>
        )
      })}
    </section>
  )
}

function lookupDb(sourceId: string | null): DbSupplement | null {
  if (!sourceId) return null
  return SUPPLEMENT_DB.find(s => s.id === sourceId) ?? null
}

interface ItemRowProps {
  item: StackItem
  dbRow: DbSupplement | null
  isTaken: boolean
  isLow: boolean
  isMissed: boolean
  isInfoOpen: boolean
  onToggleInfo: () => void
  onToggleTaken: (id: string) => void
  onToggleLow: (id: string) => void
  onRemove: (id: string) => void
}

function ItemRow({
  item, dbRow, isTaken, isLow, isMissed, isInfoOpen,
  onToggleInfo, onToggleTaken, onToggleLow, onRemove,
}: ItemRowProps) {
  const meta = [item.dose, item.note].filter(Boolean).join(' · ')

  return (
    <li
      className={[
        styles.itemRow,
        isTaken ? styles.itemRowTaken : '',
        isMissed && !isTaken ? styles.itemRowMissed : '',
      ].filter(Boolean).join(' ')}
    >
      <div className={styles.itemRowMain}>
        {/* Pill icon as a colored shape — iOS Apple Health Medications pattern. */}
        <span className={styles.itemIcon} aria-hidden>{item.icon}</span>

        <div className={styles.itemBody}>
          <div className={styles.itemNameRow}>
            <span className={styles.itemName}>{item.name}</span>
            {dbRow && (
              <button
                type="button"
                className={styles.infoBtnInline}
                onClick={onToggleInfo}
                aria-label={`Info on ${item.name}`}
                aria-pressed={isInfoOpen}
                title="What it does, when, how"
              >
                i
              </button>
            )}
          </div>
          {meta && <div className={styles.itemMeta}>{meta}</div>}
        </div>

        {/* Quiet actions — hidden until row hover so they don't compete with
         * the primary log circle. */}
        <div className={styles.itemQuietActions}>
          <button
            type="button"
            className={`${styles.lowBtn} ${isLow ? styles.lowBtnOn : ''}`}
            onClick={() => onToggleLow(item.id)}
            aria-pressed={isLow}
            title={isLow ? 'Clear running-low flag' : 'Flag as running low'}
          >
            {isLow ? '⚠' : '↓'}
          </button>

          <button
            type="button"
            className={styles.delBtn}
            onClick={() => onRemove(item.id)}
            aria-label={`Remove ${item.name} from stack`}
            title="Remove"
          >
            ×
          </button>
        </div>

        {/* Big circular log button on the right — iOS Apple Health pattern.
         * Mint when taken, with a soft glow. Primary tap target on each row. */}
        <button
          type="button"
          className={`${styles.checkBtn} ${isTaken ? styles.checkBtnOn : ''}`}
          onClick={() => onToggleTaken(item.id)}
          aria-label={isTaken ? `Untake ${item.name}` : `Mark ${item.name} taken`}
          aria-pressed={isTaken}
        >
          {isTaken ? '✓' : ''}
        </button>
      </div>

      {isInfoOpen && dbRow && (
        <div className={styles.itemInfoSlot}>
          <InfoPopover
            supplement={dbRow}
            onClose={() => onToggleInfo()}
            onAdd={() => onToggleInfo()}
            hideAdd
          />
        </div>
      )}
    </li>
  )
}

export type { WindowKey }

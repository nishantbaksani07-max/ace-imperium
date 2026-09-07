'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import styles from './peak.module.css'
import {
  DAY_END,
  fmtClockShort, hToInput, inputToH, REPEATS,
  type DayItem,
} from './dayModel'
import { loadBrandLites, resolveBlockLink, type BrandLite } from './scheduleLinks'

/**
 * Today's schedule as a clean, readable ROW list (not a time-grid). Timed
 * items sort by start and read "9–11 AM · Deep work" with a colour tab; the
 * one running now is highlighted. Duration-only tasks sit in an Unscheduled
 * strip.
 *
 * Tapping a timed row SELECTS it (outline) — tap two and the slot between them
 * is targeted by the next `gap …` command. Editing (name/time/repeat/delete)
 * lives on the selection bar's Edit button, or on tapping an unscheduled chip.
 */

export interface DayCalendarProps {
  items: DayItem[]
  now: number
  onUpdate: (id: string, patch: Partial<DayItem>) => void
  onDelete: (id: string) => void
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  onClearSelect: () => void
  gapTarget: { lo: number; hi: number } | null
}

export default function DayCalendar({
  items, now, onUpdate, onDelete, selectedIds, onToggleSelect, onClearSelect, gapTarget,
}: DayCalendarProps) {
  const [editId, setEditId] = useState<string | null>(null)
  const router = useRouter()
  // The user's brands, read once on mount — drives which rows deep-link.
  const [brands, setBrands] = useState<BrandLite[]>([])
  useEffect(() => { setBrands(loadBrandLites()) }, [])

  const timed = items
    .filter((i) => i.start != null)
    .sort((a, b) => (a.start as number) - (b.start as number))
  const unsched = items.filter((i) => i.start == null)
  const editing = items.find((i) => i.id === editId) || null

  return (
    <div className={styles.cv}>
      <div className={styles.cvHead}>
        <span className={styles.cvTitle}>Today</span>
        {timed.length > 0 && <span className={styles.cvCount}>{timed.length} scheduled</span>}
      </div>

      {items.length === 0 ? (
        <p className={styles.cvEmpty}>Nothing scheduled yet — add something above.</p>
      ) : (
        <div className={styles.cvList}>
          {timed.map((ev) => {
            const start = ev.start as number
            const end = ev.end ?? Math.min(DAY_END, start + (ev.durHours ?? 1))
            const isNow = now >= start && now < end
            const rep = ev.repeat && ev.repeat !== 'none'
            const selected = selectedIds.includes(ev.id)
            const link = resolveBlockLink(ev.name, brands)
            return (
              <div key={ev.id} className={styles.cvRowWrap}>
                <button
                  type="button"
                  className={`${styles.cvItem} ${isNow ? styles.cvItemNow : ''} ${selected ? styles.cvItemSel : ''} ${link ? styles.cvItemLinked : ''}`}
                  onClick={() => onToggleSelect(ev.id)}
                  aria-pressed={selected}
                  style={{ '--bc': ev.color } as CSSProperties}
                >
                  <span className={styles.cvItemBar} aria-hidden />
                  <span className={styles.cvItemTime}>
                    {fmtClockShort(start)}<span className={styles.cvItemDash}>–</span>{fmtClockShort(end)}
                  </span>
                  <span className={styles.cvItemName}>
                    {ev.name}{rep && <i className={styles.cvItemRep} title={`Repeats ${ev.repeat}`}>↻</i>}
                  </span>
                  {isNow && <span className={styles.cvItemNowTag}>now</span>}
                </button>
                {link && (
                  <button
                    type="button"
                    className={styles.cvOpen}
                    style={{ color: link.color }}
                    onClick={() => router.push(link.href)}
                    title={`Open ${link.label}`}
                    aria-label={`Open ${link.label}`}
                  >
                    ↗
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className={styles.cvSelBar}>
          {selectedIds.length === 1 ? (
            <>
              <span className={styles.cvSelLab}>1 selected</span>
              <button type="button" className={styles.cvSelEdit} onClick={() => setEditId(selectedIds[0])}>Edit</button>
            </>
          ) : gapTarget ? (
            <span className={styles.cvSelLab}>
              {selectedIds.length} selected · type “gap …” to fill {fmtClockShort(gapTarget.lo)}–{fmtClockShort(gapTarget.hi)}
            </span>
          ) : (
            <span className={styles.cvSelLab}>no gap between these</span>
          )}
          <button type="button" className={styles.cvSelClear} onClick={onClearSelect}>Clear</button>
        </div>
      )}

      {unsched.length > 0 && (
        <div className={styles.cvUnsched}>
          <span className={styles.cvUnLab}>Unscheduled</span>
          <div className={styles.cvChips}>
            {unsched.map((t) => (
              <button
                key={t.id}
                type="button"
                className={styles.cvChip}
                onClick={() => setEditId(t.id)}
                style={{ '--bc': t.color } as CSSProperties}
              >
                <span className={styles.cvChipBar} aria-hidden />
                {t.name}{t.durHours ? ` · ${Math.round(t.durHours * 60)}m` : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <EditPopover item={editing} onClose={() => setEditId(null)} onUpdate={onUpdate} onDelete={onDelete} />
      )}
    </div>
  )
}

function EditPopover({
  item, onClose, onUpdate, onDelete,
}: {
  item: DayItem
  onClose: () => void
  onUpdate: (id: string, patch: Partial<DayItem>) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className={styles.cvEditWrap} onClick={onClose}>
      <div className={styles.cvEdit} onClick={(e) => e.stopPropagation()} style={{ '--bc': item.color } as CSSProperties}>
        <div className={styles.cvEditHead}>
          <i className={styles.cvEditDot} aria-hidden />
          <span className={styles.cvEditTitle}>Edit</span>
          <button type="button" className={styles.cvEditX} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <label className={styles.cvFld}>
          <span className={styles.cvFldL}>Name</span>
          <input className={styles.cvIn} value={item.name} onChange={(e) => onUpdate(item.id, { name: e.target.value })} />
        </label>

        <div className={styles.cvFldRow}>
          <label className={styles.cvFld}>
            <span className={styles.cvFldL}>Start</span>
            <input
              type="time"
              className={styles.cvIn}
              value={hToInput(item.start != null ? item.start : 9)}
              onChange={(e) => onUpdate(item.id, { start: inputToH(e.target.value) })}
            />
          </label>
          <label className={styles.cvFld}>
            <span className={styles.cvFldL}>End</span>
            <input
              type="time"
              className={styles.cvIn}
              value={hToInput(item.end != null ? item.end : (item.start != null ? Math.min(DAY_END, item.start + 1) : 10))}
              onChange={(e) => onUpdate(item.id, { end: inputToH(e.target.value) })}
            />
          </label>
        </div>

        <div className={styles.cvFld}>
          <span className={styles.cvFldL}>Repeat</span>
          <div className={styles.cvRepSeg}>
            {REPEATS.map(([v, l]) => (
              <button
                key={v}
                type="button"
                className={`${styles.cvRepB} ${(item.repeat || 'none') === v ? styles.cvRepBOn : ''}`}
                onClick={() => onUpdate(item.id, { repeat: v })}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.cvEditFoot}>
          <button type="button" className={styles.cvDel} onClick={() => { onDelete(item.id); onClose() }}>Delete</button>
          <button type="button" className={styles.cvDone} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

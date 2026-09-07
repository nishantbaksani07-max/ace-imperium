'use client'

import styles from './peak.module.css'
import NowPanel from './NowPanel'
import DayCalendar from './DayCalendar'
import type { DaySchedule } from './useDaySchedule'

/**
 * "Your Day" schedule — a NOW/next panel and the vertical day calendar. State
 * lives in the shared `useDaySchedule` controller (owned by PeakModule) so this
 * surface and the energy curve drive the same items — pure presentation over
 * that controller. (The natural-language quick-add console now lives under the
 * curve in PeakModule, below the TODAY'S PLAN strip.)
 */

interface Props {
  schedule: DaySchedule
}

export default function YourDaySchedule({ schedule }: Props) {
  const { items, now, handleUpdate, handleDelete, selectedIds, toggleSelect, clearSelect, gapTarget } = schedule
  return (
    <section className={styles.yourDay}>
      <div className={styles.cBody}>
        <NowPanel items={items} now={now} />
        <DayCalendar
          items={items}
          now={now}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onClearSelect={clearSelect}
          gapTarget={gapTarget}
        />
      </div>
    </section>
  )
}

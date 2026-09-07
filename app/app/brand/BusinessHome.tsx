'use client'

import { useEffect, useState } from 'react'
import styles from './brand.module.css'
import type { Brand } from './types'
import type { BrandActions } from './state'

/**
 * Business side of a brand — rebuilt from scratch.
 *
 * Design rule for everything that lands here: it must be GENERIC and work for
 * ANY brand / use case. No hardcoded data, no creator-specific assumptions —
 * whatever we add has to replicate cleanly for every user.
 *
 * Step 1 (this card): "What is this business?" — the anchor every other Business
 * section builds on. Three plain fields, saved straight to brand state:
 *   • one-liner  → brand.blurb
 *   • what you sell → brand.offer
 *   • who it's for  → brand.customer
 * Saves on blur; nothing here is required (a clean slate is valid).
 */

type Field = 'blurb' | 'offer' | 'customer'

const FIELDS: { key: Field; label: string; placeholder: string; lines: number }[] = [
  { key: 'blurb', label: 'One-liner', placeholder: 'What this business is, in one line.', lines: 1 },
  { key: 'offer', label: 'What you sell', placeholder: 'Your offer(s) — the products, services, or work people pay for.', lines: 2 },
  { key: 'customer', label: "Who it's for", placeholder: 'Your customer — who you serve and the problem you solve for them.', lines: 2 },
]

export default function BusinessHome({ brand, actions }: { brand: Brand; actions: BrandActions }) {
  // Local draft so typing is smooth; commit to brand state on blur.
  const [draft, setDraft] = useState<Record<Field, string>>({
    blurb: brand.blurb ?? '',
    offer: brand.offer ?? '',
    customer: brand.customer ?? '',
  })

  // Resync when switching to a different brand (or when state hydrates from
  // Supabase) — but don't clobber a field the user is mid-edit on.
  useEffect(() => {
    setDraft({ blurb: brand.blurb ?? '', offer: brand.offer ?? '', customer: brand.customer ?? '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand.id])

  function commit(key: Field) {
    const next = draft[key].trim()
    if (next === (brand[key] ?? '')) return
    actions.updateBrand(brand.id, { [key]: next })
  }

  const filled = (['blurb', 'offer', 'customer'] as Field[]).filter((k) => draft[k].trim()).length

  return (
    <div className={styles.brandHome}>
      <section className={styles.bizCard}>
        <div className={styles.bizCardHead}>
          <span className={styles.bizCardEyebrow}>✦ What is this business?</span>
          <span className={styles.bizCardStep}>{filled}/3</span>
        </div>
        <p className={styles.bizCardLead}>The anchor everything else on this tab builds on.</p>

        <div className={styles.bizFields}>
          {FIELDS.map((f) => (
            <label key={f.key} className={styles.bizField}>
              <span className={styles.bizFieldLabel}>{f.label}</span>
              {f.lines === 1 ? (
                <input
                  className={styles.bizInput}
                  value={draft[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  onBlur={() => commit(f.key)}
                />
              ) : (
                <textarea
                  className={styles.bizTextarea}
                  rows={f.lines}
                  value={draft[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  onBlur={() => commit(f.key)}
                />
              )}
            </label>
          ))}
        </div>
      </section>
    </div>
  )
}

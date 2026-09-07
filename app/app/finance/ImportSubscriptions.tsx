'use client'

import { useEffect, useRef, useState } from 'react'
import type { Currency, SubPeriod } from './types'
import { type ExchangeRates, type FinanceActions, convertBetween } from './state'
import { useDialogFocus } from './useDialogFocus'
import styles from './finance.module.css'

interface ExtractedSub {
  name: string
  amount: number
  period: SubPeriod
  renewal_date: string | null
}

interface ExtractedResult {
  currency: Currency
  subscriptions: ExtractedSub[]
}

interface Props {
  open: boolean
  onClose: () => void
  actions: FinanceActions
  currentCurrency: Currency
  rates: ExchangeRates
}

type Stage = 'upload' | 'loading' | 'preview' | 'error'
const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,image/gif'

const VALID_PERIODS: SubPeriod[] = ['monthly', 'yearly', 'weekly']

/**
 * Subscription importer. One screenshot of a subscriptions page (Apple,
 * Google Play, Netflix billing, bank recurring charges, etc.) → list of
 * recurring services. User unchecks anything they don't want and tweaks
 * names / periods inline before importing.
 */
export default function ImportSubscriptions({ open, onClose, actions, currentCurrency, rates }: Props) {
  const [stage, setStage] = useState<Stage>('upload')
  const [extracted, setExtracted] = useState<ExtractedResult | null>(null)
  // Editable drafts per row so users can fix names/amounts inline.
  const [drafts, setDrafts] = useState<ExtractedSub[]>([])
  // Raw string mirror of each amount so the user can type decimals / clear the
  // field naturally; draft.amount stays the parsed number used on import.
  const [amountText, setAmountText] = useState<string[]>([])
  const [picked, setPicked] = useState<boolean[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useDialogFocus(open, panelRef)

  useEffect(() => {
    if (!open) {
      setStage('upload')
      setExtracted(null)
      setDrafts([])
      setAmountText([])
      setPicked([])
      setError(null)
      setDragging(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  async function handleFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      setError('That image is over 5 MB. Try a smaller screenshot or compress it.')
      setStage('error')
      return
    }
    setStage('loading')
    setError(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/finance/import-subscriptions', { method: 'POST', body: fd })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) {
        setError(data?.error || 'Could not read this image. Try a clearer screenshot.')
        setStage('error')
        return
      }
      const ccy = (data.currency as Currency) || currentCurrency
      const rawSubs = Array.isArray(data.subscriptions) ? (data.subscriptions as ExtractedSub[]) : []
      const subs = rawSubs
        .filter(
          s =>
            s &&
            typeof s.name === 'string' &&
            s.name.trim() &&
            typeof s.amount === 'number' &&
            isFinite(s.amount) &&
            s.amount > 0,
        )
        .map(s => ({
          name: s.name.trim(),
          // Convert to current currency for editing comfort.
          amount: ccy === currentCurrency
            ? s.amount
            : Math.round(convertBetween(s.amount, ccy, currentCurrency, rates) * 100) / 100,
          period: VALID_PERIODS.includes(s.period) ? s.period : 'monthly',
          renewal_date: s.renewal_date || null,
        }))
      if (!subs.length) {
        setError('No subscriptions detected. Try a clearer screenshot of a subs / billing page.')
        setStage('error')
        return
      }
      setExtracted({ currency: ccy, subscriptions: subs })
      setDrafts(subs)
      setAmountText(subs.map(s => String(s.amount)))
      setPicked(subs.map(() => true))
      setStage('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
      setStage('error')
    }
  }

  function handleImport() {
    if (!extracted) return
    drafts.forEach((d, i) => {
      if (!picked[i]) return
      if (!d.name.trim() || !isFinite(d.amount) || d.amount <= 0) return
      actions.addSubscription({
        name: d.name.trim(),
        displayAmount: d.amount,
        period: d.period,
        renewal: d.renewal_date,
      })
    })
    onClose()
  }

  function updateDraft(i: number, patch: Partial<ExtractedSub>) {
    setDrafts(prev => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)))
  }

  if (!open) return null

  const selectedCount = picked.filter(Boolean).length

  return (
    <div className={styles.importOverlay} role="dialog" aria-modal="true" aria-labelledby="import-subscriptions-title" onClick={onClose}>
      <div className={styles.importPanel} ref={panelRef} tabIndex={-1} onClick={e => e.stopPropagation()}>
        <header className={styles.importHead}>
          <div>
            <div className={styles.importEyebrow}>Import subscriptions</div>
            <h2 className={styles.importTitle} id="import-subscriptions-title">
              Move every sub over in <em>seconds</em>
            </h2>
          </div>
          <button type="button" className={styles.importClose} onClick={onClose} aria-label="Close">×</button>
        </header>

        {stage === 'upload' && (
          <>
            <p className={styles.importDesc}>
              Screenshot your Apple / Google Play / Netflix billing page, your bank&rsquo;s recurring charges list, or any subs dashboard. Vitality pulls each one with cost + cycle ready for review.
            </p>
            <label
              className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ''}`}
              role="button"
              tabIndex={0}
              aria-label="Upload a subscriptions screenshot"
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault()
                setDragging(false)
                const f = e.dataTransfer.files?.[0]
                if (f) handleFile(f)
              }}
              onClick={() => fileRef.current?.click()}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() } }}
            >
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_TYPES}
                hidden
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                  e.target.value = ''
                }}
              />
              <div className={styles.dropIcon} aria-hidden>↑</div>
              <div className={styles.dropTitle}>Drop a screenshot</div>
              <div className={styles.dropSub}>or click to choose · PNG, JPEG, WebP up to 5MB</div>
            </label>
            <p className={styles.importPriv}>
              Read once on the server, never stored. Your image isn&rsquo;t saved or used for training.
            </p>
          </>
        )}

        {stage === 'loading' && (
          <div className={styles.importLoading}>
            <div className={styles.importSpinner} aria-hidden />
            <div className={styles.importLoadingTitle}>Reading your subscriptions</div>
            <div className={styles.importLoadingSub}>this usually takes 4 to 8 seconds</div>
          </div>
        )}

        {stage === 'error' && (
          <div className={styles.importError}>
            <div className={styles.importErrorTitle}>Couldn&rsquo;t extract</div>
            <div className={styles.importErrorMsg}>{error}</div>
            <button type="button" className={styles.importSecondary} onClick={() => { setStage('upload'); setError(null) }}>
              try another
            </button>
          </div>
        )}

        {stage === 'preview' && extracted && (
          <>
            <div className={styles.importPreviewHead}>
              <span>
                Detected <strong>{drafts.length}</strong> subscription{drafts.length === 1 ? '' : 's'}
                {extracted.currency !== currentCurrency && (
                  <> · <span className={styles.importPreviewCcy}>{extracted.currency}</span></>
                )}
              </span>
              {extracted.currency !== currentCurrency && (
                <span className={styles.importWarn}>
                  Converted to {currentCurrency} at live rates
                </span>
              )}
            </div>
            <ul className={styles.importList}>
              {drafts.map((d, i) => (
                <li key={i} className={`${styles.importSubRow} ${picked[i] ? '' : styles.importRowOff}`}>
                  <input
                    type="checkbox"
                    checked={picked[i]}
                    onChange={() => setPicked(p => p.map((v, j) => (i === j ? !v : v)))}
                    className={styles.importCheck}
                    aria-label={`Include ${d.name}`}
                  />
                  <input
                    type="text"
                    value={d.name}
                    onChange={e => updateDraft(i, { name: e.target.value })}
                    className={`${styles.quickAddInput} ${styles.subRowName}`}
                    aria-label={`Name for subscription ${i + 1}`}
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={amountText[i] ?? ''}
                    onChange={e => {
                      const text = e.target.value
                      setAmountText(prev => prev.map((t, j) => (j === i ? text : t)))
                      const v = parseFloat(text)
                      updateDraft(i, { amount: Number.isFinite(v) ? v : 0 })
                    }}
                    className={`${styles.quickAddInput} ${styles.subRowAmt}`}
                    aria-label={`Amount for subscription ${i + 1}`}
                  />
                  <select
                    value={d.period}
                    onChange={e => updateDraft(i, { period: e.target.value as SubPeriod })}
                    className={`${styles.quickAddInput} ${styles.subRowPeriod}`}
                    aria-label={`Billing period for subscription ${i + 1}`}
                  >
                    <option value="monthly">/ mo</option>
                    <option value="yearly">/ yr</option>
                    <option value="weekly">/ wk</option>
                  </select>
                </li>
              ))}
            </ul>
            <div className={styles.importActions}>
              <button type="button" className={styles.importSecondary} onClick={() => { setStage('upload'); setExtracted(null); setDrafts([]); setAmountText([]); setPicked([]) }}>
                upload another
              </button>
              <button
                type="button"
                className={styles.importPrimary}
                onClick={handleImport}
                disabled={selectedCount === 0}
              >
                Add {selectedCount} subscription{selectedCount === 1 ? '' : 's'} →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

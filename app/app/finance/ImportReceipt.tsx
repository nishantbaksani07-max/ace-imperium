'use client'

import { useEffect, useRef, useState } from 'react'
import type { Currency, FinanceState } from './types'
import { type ExchangeRates, type FinanceActions, convertBetween } from './state'
import { useDialogFocus } from './useDialogFocus'
import styles from './finance.module.css'

interface ExtractedReceipt {
  merchant: string
  total: number
  currency: Currency
  date: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  state: FinanceState
  actions: FinanceActions
  currentCurrency: Currency
  rates: ExchangeRates
}

type Stage = 'upload' | 'loading' | 'preview' | 'error'
const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,image/gif'

/**
 * Receipt importer. Drop a receipt image, the AI extracts merchant +
 * total + (optional) date, the user picks an account, and we create
 * one already-deducted order ("Bought today" semantics).
 */
export default function ImportReceipt({ open, onClose, state, actions, currentCurrency, rates }: Props) {
  const [stage, setStage] = useState<Stage>('upload')
  const [extracted, setExtracted] = useState<ExtractedReceipt | null>(null)
  const [merchantDraft, setMerchantDraft] = useState('')
  const [totalDraft, setTotalDraft] = useState('')
  const [fromAccountId, setFromAccountId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useDialogFocus(open, panelRef)

  useEffect(() => {
    if (!open) {
      setStage('upload')
      setExtracted(null)
      setMerchantDraft('')
      setTotalDraft('')
      setFromAccountId('')
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
      const res = await fetch('/api/finance/import-receipt', { method: 'POST', body: fd })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) {
        setError(data?.error || 'Could not read this receipt. Try a clearer photo.')
        setStage('error')
        return
      }
      const merchant = typeof data.merchant === 'string' ? data.merchant.trim() : ''
      const total = typeof data.total === 'number' && isFinite(data.total) && data.total > 0 ? data.total : 0
      if (!merchant || total <= 0) {
        setError('No purchase detected. Make sure the receipt shows a merchant and a total.')
        setStage('error')
        return
      }
      const ccy = (data.currency as Currency) || currentCurrency
      // Display amount in the dashboard's currency for the editable field.
      const displayTotal = ccy === currentCurrency
        ? total
        : convertBetween(total, ccy, currentCurrency, rates)
      setExtracted({ merchant, total, currency: ccy, date: data.date ?? null })
      setMerchantDraft(merchant)
      setTotalDraft(String(Math.round(displayTotal * 100) / 100))
      setStage('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
      setStage('error')
    }
  }

  function handleImport() {
    if (!extracted) return
    const cost = parseFloat(totalDraft)
    if (!merchantDraft.trim() || !isFinite(cost) || cost <= 0) return
    if (!fromAccountId) return
    actions.addOrder({
      name: merchantDraft.trim(),
      displayAmount: cost,
      fromAccountId,
      date: null,
      immediate: true,
    })
    onClose()
  }

  if (!open) return null

  const canImport = merchantDraft.trim() !== '' && parseFloat(totalDraft) > 0 && fromAccountId !== ''

  return (
    <div className={styles.importOverlay} role="dialog" aria-modal="true" aria-labelledby="import-receipt-title" onClick={onClose}>
      <div className={styles.importPanel} ref={panelRef} tabIndex={-1} onClick={e => e.stopPropagation()}>
        <header className={styles.importHead}>
          <div>
            <div className={styles.importEyebrow}>Import receipt</div>
            <h2 className={styles.importTitle} id="import-receipt-title">
              Log a purchase <em>instantly</em>
            </h2>
          </div>
          <button type="button" className={styles.importClose} onClick={onClose} aria-label="Close">×</button>
        </header>

        {stage === 'upload' && (
          <>
            <p className={styles.importDesc}>
              Snap a paper receipt, email confirmation, or order screenshot. Vitality reads it and creates an order, already deducted from the account you pick.
            </p>
            <label
              className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ''}`}
              role="button"
              tabIndex={0}
              aria-label="Upload a receipt image"
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
              <div className={styles.dropTitle}>Drop a receipt</div>
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
            <div className={styles.importLoadingTitle}>Reading your receipt</div>
            <div className={styles.importLoadingSub}>this usually takes 3 to 6 seconds</div>
          </div>
        )}

        {stage === 'error' && (
          <div className={styles.importError}>
            <div className={styles.importErrorTitle}>Couldn&rsquo;t read</div>
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
                Detected purchase{' '}
                {extracted.currency !== currentCurrency && (
                  <>· <span className={styles.importPreviewCcy}>{extracted.currency}</span></>
                )}
              </span>
              {extracted.currency !== currentCurrency && (
                <span className={styles.importWarn}>
                  Converted to {currentCurrency} at live rates
                </span>
              )}
            </div>
            <div className={styles.receiptFields}>
              <label className={styles.receiptField}>
                <span className={styles.receiptFieldLabel}>Merchant</span>
                <input
                  type="text"
                  className={styles.quickAddInput}
                  value={merchantDraft}
                  onChange={e => setMerchantDraft(e.target.value)}
                />
              </label>
              <label className={styles.receiptField}>
                <span className={styles.receiptFieldLabel}>Cost · {currentCurrency}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  className={styles.quickAddInput}
                  value={totalDraft}
                  onChange={e => setTotalDraft(e.target.value)}
                />
              </label>
              <label className={styles.receiptField}>
                <span className={styles.receiptFieldLabel}>Paid from <span className={styles.receiptRequired}>·required</span></span>
                <select
                  className={`${styles.quickAddInput} ${!fromAccountId ? styles.quickAddInputAlert : ''}`}
                  value={fromAccountId}
                  onChange={e => setFromAccountId(e.target.value)}
                >
                  <option value="">Pick an account…</option>
                  {state.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
              {extracted.date && (
                <div className={styles.receiptMeta}>
                  Receipt date: <span>{extracted.date}</span>
                </div>
              )}
            </div>
            <div className={styles.importActions}>
              <button type="button" className={styles.importSecondary} onClick={() => { setStage('upload'); setExtracted(null) }}>
                upload another
              </button>
              <button
                type="button"
                className={styles.importPrimary}
                onClick={handleImport}
                disabled={!canImport}
              >
                − Log purchase
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

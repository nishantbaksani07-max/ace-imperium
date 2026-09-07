'use client'

import { useEffect, useRef, useState } from 'react'
import type { AccountType, Currency } from './types'
import { type ExchangeRates, type FinanceActions, convertBetween } from './state'
import { useDialogFocus } from './useDialogFocus'
import styles from './finance.module.css'

interface ExtractedAccount { type: AccountType; name: string; amount: number }
interface ExtractedResult { currency: Currency; accounts: ExtractedAccount[] }

interface Props {
  open: boolean
  onClose: () => void
  actions: FinanceActions
  currentCurrency: Currency
  rates: ExchangeRates
}

type Stage = 'upload' | 'loading' | 'preview' | 'error'

const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,image/gif'

export default function ImportStatement({ open, onClose, actions, currentCurrency, rates }: Props) {
  const [stage, setStage] = useState<Stage>('upload')
  const [extracted, setExtracted] = useState<ExtractedResult | null>(null)
  const [picked, setPicked] = useState<boolean[]>([])
  const [skipped, setSkipped] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useDialogFocus(open, panelRef)

  useEffect(() => {
    if (!open) {
      setStage('upload')
      setExtracted(null)
      setPicked([])
      setSkipped(0)
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
      const res = await fetch('/api/finance/import-statement', { method: 'POST', body: fd })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) {
        setError(data?.error || 'Could not read this image. Try a clearer screenshot.')
        setStage('error')
        return
      }
      const rawAccts = Array.isArray(data.accounts) ? (data.accounts as ExtractedAccount[]) : []
      const named = rawAccts.filter(
        a => a && typeof a.name === 'string' && a.name.trim() && typeof a.amount === 'number' && isFinite(a.amount),
      )
      const accts = named.filter(a => a.amount > 0)
      // Negative/credit balances (liabilities) aren't tracked yet — surface the
      // count instead of dropping them silently.
      const skippedCount = named.filter(a => a.amount < 0).length
      if (!accts.length) {
        setError('No balances detected. Try a screenshot that clearly shows account names + amounts.')
        setStage('error')
        return
      }
      setExtracted({
        currency: (data.currency as Currency) || currentCurrency,
        accounts: accts,
      })
      setPicked(accts.map(() => true))
      setSkipped(skippedCount)
      setStage('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
      setStage('error')
    }
  }

  function handleImport() {
    if (!extracted) return
    extracted.accounts.forEach((a, i) => {
      if (!picked[i]) return
      const displayAmount = extracted.currency === currentCurrency
        ? a.amount
        : convertBetween(a.amount, extracted.currency, currentCurrency, rates)
      actions.addAccount(a.type, a.name.trim(), Math.round(displayAmount * 100) / 100)
    })
    onClose()
  }

  if (!open) return null

  const selectedCount = picked.filter(Boolean).length

  return (
    <div className={styles.importOverlay} role="dialog" aria-modal="true" aria-labelledby="import-statement-title" onClick={onClose}>
      <div className={styles.importPanel} ref={panelRef} tabIndex={-1} onClick={e => e.stopPropagation()}>
        <header className={styles.importHead}>
          <div>
            <div className={styles.importEyebrow}>Import from screenshot</div>
            <h2 className={styles.importTitle} id="import-statement-title">
              Bring statements in <em>instantly</em>
            </h2>
          </div>
          <button type="button" className={styles.importClose} onClick={onClose} aria-label="Close">×</button>
        </header>

        {stage === 'upload' && (
          <>
            <p className={styles.importDesc}>
              Drop a bank statement, portfolio screenshot, or any finance dashboard. Vitality reads the balances and stages them for review.
            </p>
            <label
              className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ''}`}
              role="button"
              tabIndex={0}
              aria-label="Upload a statement screenshot"
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
              Read once on the server, never stored. Your image isn&rsquo;t saved to disk or used for training.
            </p>
          </>
        )}

        {stage === 'loading' && (
          <div className={styles.importLoading}>
            <div className={styles.importSpinner} aria-hidden />
            <div className={styles.importLoadingTitle}>Reading your statement</div>
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
                Detected <strong>{extracted.accounts.length}</strong> account{extracted.accounts.length === 1 ? '' : 's'} ·{' '}
                <span className={styles.importPreviewCcy}>{extracted.currency}</span>
              </span>
              {extracted.currency !== currentCurrency && (
                <span className={styles.importWarn}>
                  Converting to {currentCurrency} at live rates on import
                </span>
              )}
              {skipped > 0 && (
                <span className={styles.importWarn}>
                  {skipped} negative/credit balance{skipped === 1 ? '' : 's'} skipped — liabilities aren&rsquo;t tracked yet
                </span>
              )}
            </div>
            <ul className={styles.importList}>
              {extracted.accounts.map((a, i) => (
                <li key={i} className={`${styles.importRow} ${picked[i] ? '' : styles.importRowOff}`}>
                  <input
                    type="checkbox"
                    checked={picked[i]}
                    onChange={() => setPicked(p => p.map((v, j) => (i === j ? !v : v)))}
                    className={styles.importCheck}
                    aria-label={`Include ${a.name}`}
                  />
                  <div className={styles.importRowMain}>
                    <div className={styles.importRowName}>{a.name}</div>
                    <div className={styles.importRowType}>{a.type}</div>
                  </div>
                  <div className={styles.importRowAmt}>
                    {extracted.currency}{' '}
                    {a.amount.toLocaleString('en-US', {
                      minimumFractionDigits: Math.abs(a.amount % 1) > 0.005 ? 2 : 0,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </li>
              ))}
            </ul>
            <div className={styles.importActions}>
              <button type="button" className={styles.importSecondary} onClick={() => { setStage('upload'); setExtracted(null) }}>
                upload another
              </button>
              <button
                type="button"
                className={styles.importPrimary}
                onClick={handleImport}
                disabled={selectedCount === 0}
              >
                Add {selectedCount} to net worth →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

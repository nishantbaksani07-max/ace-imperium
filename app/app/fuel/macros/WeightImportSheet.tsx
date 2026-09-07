'use client'

// Fuel · "Bring your history" — the weight-import sheet. Three ways in: Paste
// (client-side regex parser, free + instant), Screenshot (Claude vision), and
// File (.csv / .json). All three land on the same parsed-preview → confirm,
// then saveWeights (fill-gaps-only, never clobbers an existing weigh-in). The
// payoff: a new user's trend — and the maintenance coach — start with history
// instead of from scratch.

import { useEffect, useRef, useState } from 'react'

import { resizeAndEncodeImage } from './image'
import { saveWeights } from './actions'
import { parseWeighInsText, kgFromValue, type RawWeighIn, type WeightUnit } from '@/lib/nutrition/parseWeighIns'
import type { Units } from '@/lib/units'
import styles from './weightImport.module.css'

type TabId = 'paste' | 'shot' | 'file'

const KG_MIN = 25
const KG_MAX = 320

// Each row is a DIFFERENT accepted format — labelled so it's obvious you can
// paste any style, not one rigid layout. Tapping appends the example.
const FORMATS: { tag: string; eg: string }[] = [
  { tag: 'Date + weight', eg: '2026-06-01  75.4' },
  { tag: 'Written date', eg: 'Jun 8, 75.0' },
  { tag: 'Short date', eg: '6/15/26  74.6' },
  { tag: 'Just numbers', eg: '74.5' },
]

function fmtDay(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function WeightImportSheet({
  units,
  onClose,
  onImported,
}: {
  units: Units
  onClose: () => void
  onImported: (entries: { dayKey: string; kg: number }[], saved: number) => void
}) {
  const [tab, setTab] = useState<TabId>('paste')
  const [unit, setUnit] = useState<WeightUnit>(units === 'imperial' ? 'lb' : 'kg')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<RawWeighIn[] | null>(null)
  const [skipped, setSkipped] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const imgRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function reset() { setRows(null); setSkipped([]); setError(null) }

  function readPaste() {
    reset()
    const res = parseWeighInsText(text, { unitHint: unit })
    setUnit(res.unit)
    setSkipped(res.skipped)
    if (res.rows.length === 0) {
      setError("Couldn't find weigh-ins in that. Check the format, or let Vee read it.")
      return
    }
    setRows(res.rows)
  }

  // AI fallback for messy text the regex couldn't crack.
  async function readPasteWithAI() {
    if (!text.trim()) return
    setBusy(true); reset()
    try {
      const r = await fetch('/api/nutrition/import-weights', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Could not read that.'); return }
      applyAi(data)
    } catch { setError('Connection failed. Try again.') } finally { setBusy(false) }
  }

  async function readImage(file: File) {
    setBusy(true); reset()
    try {
      const enc = await resizeAndEncodeImage(file, 1600, 0.9)
      const r = await fetch('/api/nutrition/import-weights', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: enc.base64, mediaType: enc.mediaType }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Could not read that screenshot.'); return }
      applyAi(data)
    } catch { setError('Could not read that screenshot. Try a clearer one.') } finally { setBusy(false) }
  }

  function applyAi(data: { unit?: string; weighIns?: { date: string; value: number }[] }) {
    const u: WeightUnit = data.unit === 'lb' ? 'lb' : 'kg'
    const got: RawWeighIn[] = (data.weighIns || []).map((w) => ({ dayKey: w.date, value: w.value }))
    setUnit(u)
    if (got.length === 0) { setError("Vee couldn't find any weigh-ins in that."); return }
    setRows(got)
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); reset()
    try {
      const content = await file.text()
      const res = parseWeighInsText(content, { unitHint: unit })
      setUnit(res.unit)
      setSkipped(res.skipped)
      if (res.rows.length === 0) { setError("Couldn't read weigh-ins from that file."); return }
      setRows(res.rows)
    } catch { setError('Could not read that file.') } finally { setBusy(false) }
  }

  function removeRow(i: number) {
    setRows((prev) => (prev ? prev.filter((_, idx) => idx !== i) : prev))
  }

  async function confirm() {
    if (!rows || rows.length === 0) return
    const entries = rows
      .map((r) => ({ dayKey: r.dayKey, kg: Math.round(kgFromValue(r.value, unit) * 10) / 10 }))
      .filter((e) => e.kg >= KG_MIN && e.kg <= KG_MAX)
    if (entries.length === 0) { setError('Those weights look off for the chosen unit — try the other one.'); return }
    setSaving(true)
    const res = await saveWeights(entries)
    setSaving(false)
    if (!res.ok) { setError(res.error || 'Could not save. Try again.'); return }
    onImported(entries, res.data?.saved ?? entries.length)
  }

  const count = rows?.length ?? 0

  return (
    <div className={styles.scrim} onClick={onClose} role="dialog" aria-modal="true" aria-label="Import weight history">
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.grab} />
        <button className={styles.x} onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 6 18 18M18 6 6 18" /></svg>
        </button>
        <h2 className={styles.h1}>Bring your weight history</h2>
        <p className={styles.sub}>Don&apos;t start from scratch. Pull your past weigh-ins from WHOOP, Apple Health, a scale app, a spreadsheet — anywhere.</p>

        <div className={styles.tabs} role="tablist">
          <button className={`${styles.tab} ${tab === 'paste' ? styles.on : ''}`} onClick={() => { setTab('paste'); reset() }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" /></svg>Paste
          </button>
          <button className={`${styles.tab} ${tab === 'shot' ? styles.on : ''}`} onClick={() => { setTab('shot'); reset() }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h4l2-3h6l2 3h4v13H3z" /><circle cx="12" cy="13" r="3.5" /></svg>Screenshot
          </button>
          <button className={`${styles.tab} ${tab === 'file' ? styles.on : ''}`} onClick={() => { setTab('file'); reset() }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M13 2v7h7" /></svg>File
          </button>
        </div>

        {tab === 'paste' && (
          <div className={styles.pane}>
            <textarea
              className={styles.ta}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'Paste your weigh-ins here — one per line.'}
            />
            <div className={styles.fmtsLbl}>Works with any of these — tap one to try it</div>
            <div className={styles.fmts}>
              {FORMATS.map((f) => (
                <button
                  key={f.tag}
                  type="button"
                  className={styles.fmtRow}
                  onClick={() => setText((t) => (t.trim() ? t.replace(/\s*$/, '') + '\n' : '') + f.eg)}
                >
                  <span className={styles.fmtTag}>{f.tag}</span>
                  <code className={styles.fmtEg}>{f.eg}</code>
                  <span className={styles.fmtPlus} aria-hidden>+</span>
                </button>
              ))}
            </div>
            <button className={styles.cta} onClick={readPaste} disabled={!text.trim() || busy}>Read my weigh-ins</button>
          </div>
        )}

        {tab === 'shot' && (
          <div className={styles.pane}>
            <input ref={imgRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) readImage(f) }} />
            <button className={styles.drop} onClick={() => imgRef.current?.click()} disabled={busy}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h4l2-3h6l2 3h4v13H3z" /><circle cx="12" cy="13" r="3.5" /></svg>
              <span className={styles.dropT}>{busy ? 'Vee is reading…' : 'Tap to choose a screenshot'}</span>
              <span className={styles.dropS}>WHOOP · Apple Health · Withings · Renpho · any scale app</span>
            </button>
            <div className={styles.aiTag}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" /></svg>
              Vee reads the image and pulls out every date + weight
            </div>
          </div>
        )}

        {tab === 'file' && (
          <div className={styles.pane}>
            <input ref={fileRef} type="file" accept=".csv,.json,.txt,text/csv,application/json" hidden onChange={onFile} />
            <button className={styles.drop} onClick={() => fileRef.current?.click()} disabled={busy}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M13 2v7h7" /></svg>
              <span className={styles.dropT}>{busy ? 'Reading…' : 'Upload a .csv or .json export'}</span>
              <span className={styles.dropS}>A spreadsheet · a scale-app backup · an Apple Health export</span>
            </button>
          </div>
        )}

        <div className={styles.unitRow}>
          These are in
          <div className={styles.uTog}>
            <button className={unit === 'kg' ? styles.uOn : ''} onClick={() => setUnit('kg')}>kg</button>
            <button className={unit === 'lb' ? styles.uOn : ''} onClick={() => setUnit('lb')}>lb</button>
          </div>
        </div>

        {error && (
          <div className={styles.err}>
            {error}
            {tab === 'paste' && text.trim() && (
              <button className={styles.aiLink} onClick={readPasteWithAI} disabled={busy}>Ask Vee to read it →</button>
            )}
          </div>
        )}

        {rows && count > 0 && (
          <div className={styles.result}>
            <div className={styles.rHead}>
              <div className={styles.rCount}><b>{count}</b> weigh-in{count === 1 ? '' : 's'} found</div>
              <div className={styles.rNote}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M20 6 9 17l-5-5" /></svg>
                only fills gaps
              </div>
            </div>
            <div className={styles.rows}>
              {rows.map((r, i) => (
                <div key={`${r.dayKey}-${i}`} className={styles.rrow}>
                  <span className={styles.dt}>{fmtDay(r.dayKey)}</span>
                  <span className={styles.wt}>{r.value.toFixed(1)}<small>{unit}</small></span>
                  <button className={styles.rm} onClick={() => removeRow(i)} aria-label="Remove">×</button>
                </div>
              ))}
            </div>
            {skipped.length > 0 && (
              <div className={styles.skip}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
                {skipped.length} line{skipped.length === 1 ? '' : 's'} skipped (no date or weight)
              </div>
            )}
            <button className={styles.add} onClick={confirm} disabled={saving}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M5 12h14M12 5v14" /></svg>
              {saving ? 'Adding…' : `Add ${count} to my history`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

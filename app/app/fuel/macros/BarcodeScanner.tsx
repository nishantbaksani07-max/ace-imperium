'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './macros.module.css'
import { buildBarcodeMeal } from './build'
import type { SaveMealInput } from './actions'
import type { OffMatch } from '@/lib/nutrition/types'

// BarcodeDetector is a browser API not yet in the TS DOM lib.
// We declare a minimal interface and access it via a cast; no ts-ignore needed.
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike
interface WindowWithBarcodeDetector {
  BarcodeDetector: BarcodeDetectorCtor & {
    getSupportedFormats(): Promise<string[]>
  }
}

const DESIRED_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39']

function isBarcodeDetectorSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window
}

export default function BarcodeScanner({
  dayKey,
  onClose,
  onLog,
}: {
  dayKey: string
  onClose: () => void
  onLog: (input: SaveMealInput) => void | Promise<void>
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)

  const supported = isBarcodeDetectorSupported()

  type Phase =
    | 'scanning'
    | 'looking_up'
    | 'result'
    | 'error'
    | 'not_found'
    | 'no_camera'
    | 'pro_required'

  const [phase, setPhase] = useState<Phase>(supported ? 'scanning' : 'error')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [match, setMatch] = useState<OffMatch | null>(null)
  const [grams, setGrams] = useState('100')
  const gramsInputRef = useRef<HTMLInputElement>(null)

  function stopCamera() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }

  function handleClose() {
    stopCamera()
    onClose()
  }

  useEffect(() => {
    if (!supported || phase !== 'scanning') return

    let cancelled = false

    async function start() {
      try {
        // Determine supported formats
        let formats = DESIRED_FORMATS
        try {
          const allFormats = await (window as unknown as WindowWithBarcodeDetector).BarcodeDetector.getSupportedFormats()
          if (allFormats && allFormats.length > 0) {
            const intersected = DESIRED_FORMATS.filter((f) => allFormats.includes(f))
            if (intersected.length > 0) formats = intersected
          }
        } catch {
          // fall through — use the desired list
        }

        if (cancelled) return

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        streamRef.current = stream

        const video = videoRef.current
        if (!video) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        video.srcObject = stream
        await video.play()

        const Ctor = (window as unknown as WindowWithBarcodeDetector).BarcodeDetector
        const detector = new Ctor({ formats })

        let lastTick = 0

        const tick = (ts: number) => {
          if (cancelled) return
          if (ts - lastTick >= 250) {
            lastTick = ts
            detector
              .detect(video!)
              .then((codes) => {
                if (cancelled) return
                if (codes.length > 0) {
                  cancelled = true
                  stopCamera()
                  handleScanned(codes[0].rawValue)
                }
              })
              .catch(() => {
                // per-frame error — keep looping
              })
          }
          rafRef.current = requestAnimationFrame(tick)
        }

        rafRef.current = requestAnimationFrame(tick)
      } catch (err) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('notallowed')) {
          setPhase('no_camera')
        } else {
          setErrorMsg('Could not start camera. Try Add food instead.')
          setPhase('error')
        }
      }
    }

    start()

    return () => {
      cancelled = true
      stopCamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, phase])

  // Autofocus the grams input when the result appears — caret only, never
  // select()/highlight (the blue selection block is not on-brand).
  useEffect(() => {
    if (phase === 'result' && gramsInputRef.current) {
      gramsInputRef.current.focus()
    }
  }, [phase])

  async function handleScanned(barcode: string) {
    setPhase('looking_up')
    try {
      const res = await fetch('/api/nutrition/off-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode }),
      })

      if (res.status === 402) {
        setPhase('pro_required')
        return
      }

      if (!res.ok) {
        setErrorMsg('Lookup failed. Try again.')
        setPhase('error')
        return
      }

      const data: { match: OffMatch | null } = await res.json()

      if (!data.match) {
        setPhase('not_found')
        return
      }

      setMatch(data.match)
      setGrams('100')
      setPhase('result')
    } catch {
      setErrorMsg('Lookup failed. Try again.')
      setPhase('error')
    }
  }

  function handleLog() {
    if (!match) return
    const g = Number(grams) || 0
    if (!g || g <= 0) return
    stopCamera()
    onLog(buildBarcodeMeal(match, g, dayKey))
  }

  function resetToScanning() {
    setMatch(null)
    setErrorMsg('')
    setPhase('scanning')
  }

  return (
    <div className={styles.modalScrim} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h2 className={styles.modalTitle}>
            <em>Scan barcode</em>
          </h2>
          <button className={styles.modalClose} onClick={handleClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Unsupported browser */}
        {!supported && (
          <div className={styles.scannerMsg}>
            <p>Barcode scanning needs iOS Safari 17+ or Chrome on Android. Use Add food instead.</p>
            <button className={styles.ghost} onClick={handleClose}>
              Close
            </button>
          </div>
        )}

        {/* Camera view */}
        {supported && (phase === 'scanning' || phase === 'looking_up') && (
          <>
            <video
              ref={videoRef}
              className={styles.scannerVideo}
              autoPlay
              muted
              playsInline
            />
            <p className={styles.scannerMsg}>
              {phase === 'looking_up' ? 'Looking up product…' : 'Point camera at a barcode'}
            </p>
          </>
        )}

        {/* Camera denied */}
        {phase === 'no_camera' && (
          <div className={styles.scannerMsg}>
            <p>Camera access denied. Allow camera in your browser settings, or use Add food.</p>
            <button className={styles.ghost} onClick={handleClose}>
              Close
            </button>
          </div>
        )}

        {/* Pro required */}
        {phase === 'pro_required' && (
          <div className={styles.scannerMsg}>
            <p>Barcode scanning is a Pro feature.</p>
            <button className={styles.ghost} onClick={handleClose}>
              Close
            </button>
          </div>
        )}

        {/* Not found */}
        {phase === 'not_found' && (
          <div className={styles.scannerMsg}>
            <p>Not found in Open Food Facts. Try Add food by name.</p>
            <div className={styles.scannerActions}>
              <button className={styles.ghost} onClick={resetToScanning}>
                Scan another
              </button>
              <button className={styles.ghost} onClick={handleClose}>
                Close
              </button>
            </div>
          </div>
        )}

        {/* Generic error */}
        {phase === 'error' && (
          <div className={styles.scannerMsg}>
            <p>{errorMsg || 'Something went wrong.'}</p>
            <div className={styles.scannerActions}>
              <button className={styles.ghost} onClick={resetToScanning}>
                Scan another
              </button>
              <button className={styles.ghost} onClick={handleClose}>
                Close
              </button>
            </div>
          </div>
        )}

        {/* Result */}
        {phase === 'result' && match && (
          <div className={styles.scanResult}>
            {match.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={match.thumbnail} alt={match.name} className={styles.scanThumb} />
            )}
            <p className={styles.scanResultName}>{match.name || 'Scanned product'}</p>
            <p className={styles.scanResultKcal}>{Math.round(match.per100.kcal)} kcal per 100g</p>

            <label className={styles.gramsField}>
              <span>Grams eaten</span>
              <input
                ref={gramsInputRef}
                className={styles.input}
                type="number"
                inputMode="numeric"
                value={grams}
                min="1"
                onChange={(e) => setGrams(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleLog() }}
              />
            </label>

            <div className={styles.scannerActions}>
              <button className={styles.snap} onClick={handleLog} disabled={!(Number(grams) > 0)}>
                Log it
              </button>
              <button className={styles.ghost} onClick={resetToScanning}>
                Scan another
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

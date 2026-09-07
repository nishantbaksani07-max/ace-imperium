'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  value: number
  onCommit: (n: number) => void
  className?: string
  min?: number
  max?: number
  step?: number
  placeholder?: string
  'aria-label'?: string
  'aria-describedby'?: string
}

/**
 * Strips a single leading "0" when more digits follow (so "0300" becomes
 * "300" mid-typing). Preserves "0", "0.5", etc.
 */
function trimLeadingZero(raw: string): string {
  if (raw.length > 1 && raw.startsWith('0') && raw[1] !== '.') {
    return raw.replace(/^0+/, '') || '0'
  }
  return raw
}

/**
 * Controlled number input that survives the user clearing the field
 * mid-edit without snapping back to 0 (and without leaving a stale "0"
 * prefix when typing into a zero default). Commits parseable values to
 * the parent on every keystroke so live previews stay in sync; empty
 * or unparseable input is held locally and reverted on blur.
 */
export default function NumberInput({ value, onCommit, ...rest }: Props) {
  const [draft, setDraft] = useState(() => String(value))
  // Tracks the last value we wrote to the parent so we can distinguish
  // our own updates from an external change (e.g. resetAll, syncing
  // from a server prop) and only resync the draft for the latter.
  const committedRef = useRef(value)

  useEffect(() => {
    if (value === committedRef.current) return
    setDraft(String(value))
    committedRef.current = value
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = trimLeadingZero(e.target.value)
    setDraft(raw)
    if (raw === '') return
    const parsed = parseFloat(raw)
    if (Number.isFinite(parsed)) {
      committedRef.current = parsed
      onCommit(parsed)
    }
  }

  function handleBlur() {
    if (draft === '' || !Number.isFinite(parseFloat(draft))) {
      setDraft(String(value))
    }
  }

  return (
    <input
      type="number"
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
      {...rest}
    />
  )
}

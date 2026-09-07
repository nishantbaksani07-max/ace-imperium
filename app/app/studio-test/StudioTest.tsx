'use client'

import { useState } from 'react'
import styles from './studio-test.module.css'

type Kind = 'transcript' | 'notes' | 'idea'

interface Chapter {
  t: string
  label: string
}

interface Package {
  titles: string[]
  description: string
  tags: string[]
  hashtags: string[]
  chapters: Chapter[]
  thumbnailWords: string
  thumbnailPrompt: string
}

const KINDS: { value: Kind; label: string; hint: string }[] = [
  { value: 'transcript', label: 'Transcript', hint: 'the full spoken words of the video' },
  { value: 'notes', label: 'Notes', hint: 'rough bullet points or an outline' },
  { value: 'idea', label: 'Idea', hint: 'a one-line concept for the video' },
]

// Maps the endpoint's error codes to plain, user-facing copy. Never surfaces a
// raw stack or an upstream body.
function messageForError(status: number, code: string): string {
  if (status === 401) return 'Your session expired. Refresh the page and sign in again.'
  if (code === 'daily_limit_reached') return 'Daily limit reached (25 packages). Try again tomorrow.'
  if (code === 'input_too_large') return 'That is too long. Trim it to about 24,000 characters and try again.'
  if (code === 'invalid_input') return 'Paste something first, then Generate.'
  if (code === 'upstream_error') return 'The AI had a hiccup. Give it another go in a moment.'
  if (code === 'usage_check_failed') return 'Could not check your usage. Try again in a moment.'
  return 'Something went wrong. Try again in a moment.'
}

export default function StudioTest() {
  const [kind, setKind] = useState<Kind>('transcript')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pkg, setPkg] = useState<Package | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const canGenerate = input.trim().length > 0 && !loading

  async function generate() {
    if (!canGenerate) return
    setLoading(true)
    setError(null)
    setPkg(null)
    try {
      const res = await fetch('/api/studio/package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: input.trim(), kind }),
      })
      let data: Record<string, unknown> = {}
      try {
        data = await res.json()
      } catch {
        // keep data empty; handled below
      }
      if (!res.ok) {
        setError(messageForError(res.status, typeof data.error === 'string' ? data.error : ''))
        return
      }
      setPkg(data as unknown as Package)
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      window.setTimeout(() => setCopied((c) => (c === label ? null : c)), 1400)
    } catch {
      // clipboard blocked; silently no-op (the text is still visible to copy by hand)
    }
  }

  const activeKind = KINDS.find((k) => k.value === kind)!

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>Studio · internal AI test</p>
        <h1 className={styles.title}>Package a video</h1>
        <p className={styles.sub}>
          Paste a transcript, notes, or a one-line idea. Generate a ready-to-upload YouTube package
          and judge the quality. Each run costs about 1.5 cents. Capped at 25 a day.
        </p>
      </header>

      <div className={styles.controls}>
        <div className={styles.kinds} role="radiogroup" aria-label="Material kind">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={kind === k.value}
              className={`${styles.kind} ${kind === k.value ? styles.kindActive : ''}`}
              onClick={() => setKind(k.value)}
            >
              {k.label}
            </button>
          ))}
        </div>
        <p className={styles.kindHint}>{activeKind.hint}</p>

        <textarea
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            kind === 'idea'
              ? 'e.g. A 10-minute guide to building your first workout split'
              : 'Paste your material here...'
          }
          rows={10}
        />

        <div className={styles.actions}>
          <span className={styles.count}>{input.trim().length.toLocaleString()} chars</span>
          <button type="button" className={styles.generate} onClick={generate} disabled={!canGenerate}>
            {loading ? 'Packaging…' : 'Generate package'}
          </button>
        </div>

        {error && <p className={styles.error}>{error}</p>}
      </div>

      {pkg && (
        <div className={styles.result}>
          <Section title="Titles" onCopy={() => copy('Titles', pkg.titles.join('\n'))} copied={copied === 'Titles'}>
            <ol className={styles.titles}>
              {pkg.titles.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
          </Section>

          <Section title="Description" onCopy={() => copy('Description', pkg.description)} copied={copied === 'Description'}>
            <pre className={styles.desc}>{pkg.description}</pre>
          </Section>

          <Section title="Chapters" onCopy={() => copy('Chapters', pkg.chapters.map((c) => `${c.t} ${c.label}`).join('\n'))} copied={copied === 'Chapters'}>
            <ul className={styles.chapters}>
              {pkg.chapters.map((c, i) => (
                <li key={i}>
                  <span className={styles.chapterT}>{c.t}</span>
                  <span>{c.label}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Tags" onCopy={() => copy('Tags', pkg.tags.join(', '))} copied={copied === 'Tags'}>
            <div className={styles.chips}>
              {pkg.tags.map((t, i) => (
                <span key={i} className={styles.chip}>
                  {t}
                </span>
              ))}
            </div>
          </Section>

          <Section title="Hashtags" onCopy={() => copy('Hashtags', pkg.hashtags.join(' '))} copied={copied === 'Hashtags'}>
            <div className={styles.chips}>
              {pkg.hashtags.map((t, i) => (
                <span key={i} className={`${styles.chip} ${styles.chipMint}`}>
                  {t}
                </span>
              ))}
            </div>
          </Section>

          <Section title="Thumbnail words" onCopy={() => copy('Thumbnail words', pkg.thumbnailWords)} copied={copied === 'Thumbnail words'}>
            <p className={styles.thumbWords}>{pkg.thumbnailWords}</p>
          </Section>

          <Section title="Thumbnail prompt" onCopy={() => copy('Thumbnail prompt', pkg.thumbnailPrompt)} copied={copied === 'Thumbnail prompt'}>
            <pre className={styles.desc}>{pkg.thumbnailPrompt}</pre>
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  onCopy,
  copied,
  children,
}: {
  title: string
  onCopy: () => void
  copied: boolean
  children: React.ReactNode
}) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{title}</h2>
        <button type="button" className={styles.copy} onClick={onCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {children}
    </section>
  )
}

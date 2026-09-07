'use client'

import { useMemo, type Ref } from 'react'
import { parseInput, fmtAmPm, fmtDuration, type ParsedToken } from './parser'
import { EVENT_TYPES, hexToRgb, accentFor, type RecoveryTone } from './curve'

interface Props {
  value: string
  onChange: (next: string) => void
  onCommit: (tokens: ParsedToken[]) => void
  placeholder?: string
  recoveryTone?: RecoveryTone
  compact?: boolean
  showHints?: boolean
  inputRef?: Ref<HTMLInputElement>
}

export default function Composer({
  value, onChange, onCommit, placeholder = 'add to today…',
  recoveryTone = 'green', compact = false, showHints = true, inputRef,
}: Props) {
  const accent = accentFor(recoveryTone)
  const accentRGB = hexToRgb(accent)
  const tokens = useMemo(() => parseInput(value), [value])
  const hasText = value.trim().length > 0

  return (
    <div style={{
      width: '100%',
      borderRadius: compact ? 16 : 20,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(91,234,168,0.18)',
      padding: compact ? 12 : 16,
      backdropFilter: 'blur(12px)',
      boxShadow: '0 12px 30px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
    }}>
      {/* Parsed preview */}
      {tokens.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12,
          paddingBottom: 12, borderBottom: '1px dashed rgba(91,234,168,0.14)',
        }}>
          <span style={{
            fontFamily: "'Instrument Serif', serif", fontSize: 13, fontWeight: 600,
            letterSpacing: '0.18em', color: `rgba(${accentRGB},0.9)`,
            textTransform: 'uppercase', alignSelf: 'center', marginRight: 4,
          }}>reads as →</span>
          {tokens.map((tok, i) => <ParseChip key={i} tok={tok} accent={accent} />)}
        </div>
      )}

      {/* Input row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          fontFamily: "'Instrument Serif', serif", fontSize: 14, fontWeight: 600,
          color: accent, flexShrink: 0,
        }}>›</span>
        <input
          ref={inputRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onCommit(tokens) } }}
          placeholder={placeholder}
          style={{
            flex: 1, background: 'transparent', border: 0, outline: 0,
            color: '#fff', fontFamily: "'Instrument Serif', serif",
            fontSize: compact ? 15 : 16, fontWeight: 500, letterSpacing: '-0.005em',
          }} />
        <span style={{
          fontFamily: "'Instrument Serif', serif", fontSize: 13, fontWeight: 600,
          letterSpacing: '0.18em', color: hasText ? accent : 'rgba(255,255,255,0.5)',
          textTransform: 'uppercase', flexShrink: 0,
        }}>
          ⏎ add
        </span>
      </div>

      {/* Format hint */}
      {showHints && (
        <div style={{
          marginTop: 12, paddingTop: 12,
          borderTop: '1px dashed rgba(255,255,255,0.07)',
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            fontFamily: "'Instrument Serif', serif", fontSize: 13, fontWeight: 600,
            letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)',
          }}>format</span>
          <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.78)' }}>
            task &nbsp;·&nbsp; time &nbsp;·&nbsp; <span style={{ color: accent }}>hard / mid / easy</span>
          </span>
          <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 12.5, fontWeight: 500, color: 'rgba(255,255,255,0.55)', fontStyle: 'italic' }}>
            — e.g. <span style={{ color: 'rgba(255,255,255,0.85)' }}>&quot;class 1145 to 4pm hard&quot;</span>. 24-hour like 1530 works too.
          </span>
        </div>
      )}
    </div>
  )
}

function chipStyle(tone: string, fillAlpha: number, borderStyle: 'solid' | 'dashed' | 'dotted' = 'solid'): React.CSSProperties {
  const rgb = hexToRgb(tone)
  return {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '6px 11px', borderRadius: 10,
    background: `rgba(${rgb},${fillAlpha})`,
    border: `1px ${borderStyle} rgba(${rgb},0.45)`,
    fontFamily: "'Instrument Serif', serif", fontSize: 13,
  }
}

const titleStyle: React.CSSProperties = { color: '#fff', fontWeight: 600, fontSize: 14, letterSpacing: '-0.005em' }

function diffStyle(diff: string, accent: string): React.CSSProperties {
  const col = diff === 'hard' ? accent : diff === 'easy' ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.82)'
  return {
    fontFamily: "'Instrument Serif', serif", fontSize: 13, fontWeight: 600,
    letterSpacing: '0.12em', textTransform: 'uppercase', color: col,
  }
}

const timeStyle: React.CSSProperties = {
  fontFamily: "'Instrument Serif', serif", fontSize: 13, fontWeight: 600,
  letterSpacing: '0.04em', color: 'rgba(255,255,255,0.82)',
}

function ParseChip({ tok, accent }: { tok: ParsedToken; accent: string }) {
  if (tok.kind === 'event') {
    const meta = EVENT_TYPES[tok.type] ?? EVENT_TYPES.default
    return (
      <span style={chipStyle(meta.tone, 0.14, 'solid')}>
        <span style={{ color: meta.tone, fontSize: 12 }}>{meta.glyph}</span>
        <span style={titleStyle}>{tok.title}</span>
        {tok.difficulty && <span style={diffStyle(tok.difficulty, accent)}>{tok.difficulty}</span>}
        <span style={timeStyle}>{fmtAmPm(tok.startHour)}–{fmtAmPm(tok.endHour)}</span>
      </span>
    )
  }
  if (tok.kind === 'task') {
    const tone = tok.difficulty === 'hard' ? accent
               : tok.difficulty === 'easy' ? '#A7B7C2' : '#cfd6dd'
    return (
      <span style={chipStyle(tone, 0.1, 'dashed')}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: tone }} />
        <span style={titleStyle}>{tok.title}</span>
        <span style={diffStyle(tok.difficulty, accent)}>{tok.difficulty}</span>
        <span style={timeStyle}>{fmtDuration(tok.durationHours)}</span>
      </span>
    )
  }
  return (
    <span style={chipStyle('#8a9aa7', 0.07, 'dotted')}>
      <span style={titleStyle}>{tok.title}</span>
      <span style={timeStyle}>needs a time or difficulty</span>
    </span>
  )
}

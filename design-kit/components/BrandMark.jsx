/**
 * BrandMark — the mint glyph chip, optionally paired with a wordmark.
 *   <BrandMark />                       // ◆ chip only
 *   <BrandMark glyph="A" />
 *   <BrandMark glyph="A" word="Acme" /> // chip + wordmark
 */
import React from 'react'

export default function BrandMark({ glyph = '◆', word, className = '', ...rest }) {
  return (
    <span className={`dk-row dk-row-3 ${className}`} {...rest}>
      <span className="dk-brand-mark">{glyph}</span>
      {word ? <span className="dk-brand-wordmark">{word}</span> : null}
    </span>
  )
}

/**
 * Badge / status pill.
 *   <Badge>Default</Badge>
 *   <Badge tone="mint" dot>Live</Badge>
 *   <Badge tone="amber">Beta</Badge>
 */
import React from 'react'

const toneClass = {
  default: '',
  mint: 'dk-badge-mint',
  amber: 'dk-badge-amber',
  red: 'dk-badge-red',
}

export default function Badge({ tone = 'default', dot = false, className = '', children, ...rest }) {
  const cls = ['dk-badge', toneClass[tone] || '', className].filter(Boolean).join(' ')
  return (
    <span className={cls} {...rest}>
      {dot ? <span className="dk-badge-dot" /> : null}
      {children}
    </span>
  )
}

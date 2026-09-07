import React from 'react'

export type BadgeTone = 'accent' | 'amber' | 'red' | 'neutral'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  /** Show a leading status dot. */
  dot?: boolean
}

/**
 * Badge — pill status chip in one of four tones (accent / amber / red /
 * neutral). Optional leading dot for "live"/status reads.
 */
export default function Badge({
  tone = 'accent',
  dot = false,
  className = '',
  children,
  ...rest
}: BadgeProps) {
  return (
    <span className={`dk-badge dk-badge--${tone} ${className}`} {...rest}>
      {dot && <span className="dk-badge__dot" />}
      {children}
    </span>
  )
}

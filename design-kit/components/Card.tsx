import React from 'react'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Brighter translucent fill. */
  elevated?: boolean
  /** Adds hover glow + pointer cursor (use when the whole card is clickable). */
  interactive?: boolean
  /** Small mono uppercase kicker above the title. */
  eyebrow?: string
  /** Serif-italic title rendered in the header. */
  title?: string
}

/**
 * Card — the translucent bordered surface the whole system is built on.
 * Optional eyebrow + serif-italic title header; children are the body.
 */
export default function Card({
  elevated = false,
  interactive = false,
  eyebrow,
  title,
  className = '',
  children,
  ...rest
}: CardProps) {
  const cls = [
    'dk-card',
    elevated ? 'dk-card--elevated' : '',
    interactive ? 'dk-card--interactive' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={cls} {...rest}>
      {(eyebrow || title) && (
        <div className="dk-card__header">
          {eyebrow && <div className="dk-card__eyebrow">{eyebrow}</div>}
          {title && <div className="dk-card__title">{title}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

/**
 * Card — bordered surface on the black canvas.
 *   <Card>…</Card>
 *   <Card elevated hover>…</Card>
 *
 * CardTitle / CardBody are optional convenience pieces.
 */
import React from 'react'

export default function Card({
  as: Tag = 'div',
  elevated = false,
  hover = false,
  className = '',
  children,
  ...rest
}) {
  const cls = [
    'dk-card',
    elevated ? 'dk-card-elevated' : '',
    hover ? 'dk-card-hover' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  )
}

export function CardTitle({ children, className = '', ...rest }) {
  return (
    <h3 className={`dk-heading-sm ${className}`} {...rest}>
      {children}
    </h3>
  )
}

export function CardBody({ children, className = '', ...rest }) {
  return (
    <div className={`dk-text-muted-strong dk-text-sm ${className}`} {...rest}>
      {children}
    </div>
  )
}

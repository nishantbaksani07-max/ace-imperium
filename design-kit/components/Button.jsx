/**
 * Button — primary / ghost / link / danger, with sizes and a full-width block.
 * Pure presentational; pass `onClick`, `href`, `disabled`, etc. as needed.
 *
 *   <Button>Save</Button>
 *   <Button variant="ghost" size="lg">Cancel</Button>
 *   <Button variant="link">Forgot password?</Button>
 *   <Button as="a" href="/pricing">See pricing</Button>
 */
import React from 'react'

const variantClass = {
  primary: 'dk-btn-primary',
  ghost: 'dk-btn-ghost',
  link: 'dk-btn-link',
  danger: 'dk-btn-danger',
}

const sizeClass = {
  sm: 'dk-btn-sm',
  md: '',
  lg: 'dk-btn-lg',
}

export default function Button({
  as: Tag = 'button',
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
  children,
  ...rest
}) {
  const cls = [
    'dk-btn',
    variantClass[variant] || variantClass.primary,
    sizeClass[size] || '',
    block ? 'dk-btn-block' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  )
}

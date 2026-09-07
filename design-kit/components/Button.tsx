import React from 'react'

export type ButtonVariant = 'primary' | 'ghost' | 'pill' | 'link'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** Stretch to fill its container. */
  block?: boolean
}

/**
 * Button — primary (mint fill), ghost (bordered), pill (mono uppercase,
 * used for back/nav chips), and link variants. Plain <button>, so all
 * native props (onClick, disabled, type…) pass straight through.
 */
export default function Button({
  variant = 'primary',
  block = false,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const cls = [
    'dk-btn',
    `dk-btn--${variant}`,
    block ? 'dk-btn--block' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  )
}

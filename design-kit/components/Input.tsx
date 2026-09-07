import React from 'react'

interface BaseFieldProps {
  /** Uppercase label rendered above the control. */
  label?: string
  /** Error message rendered below in red. */
  error?: string
}

export interface InputProps
  extends BaseFieldProps,
    React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Input — labeled text field with the kit's focus ring (mint border +
 * faint mint wash). Wrap-free: pass any native <input> prop.
 */
export function Input({ label, error, className = '', id, ...rest }: InputProps) {
  const fieldId = id || rest.name
  return (
    <div className="dk-field">
      {label && <label className="dk-field__label" htmlFor={fieldId}>{label}</label>}
      <input id={fieldId} className={`dk-input ${className}`} {...rest} />
      {error && <span className="dk-field__error">{error}</span>}
    </div>
  )
}

export interface TextareaProps
  extends BaseFieldProps,
    React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

/** Textarea — same styling as Input, vertically resizable. */
export function Textarea({ label, error, className = '', id, ...rest }: TextareaProps) {
  const fieldId = id || rest.name
  return (
    <div className="dk-field">
      {label && <label className="dk-field__label" htmlFor={fieldId}>{label}</label>}
      <textarea id={fieldId} className={`dk-textarea ${className}`} {...rest} />
      {error && <span className="dk-field__error">{error}</span>}
    </div>
  )
}

export default Input

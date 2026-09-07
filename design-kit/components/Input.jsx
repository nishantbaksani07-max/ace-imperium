/**
 * Form primitives — Field (label + control wrapper), Input, Textarea, Label.
 *
 *   <Field label="Email" htmlFor="email">
 *     <Input id="email" type="email" placeholder="you@example.com" />
 *   </Field>
 *
 *   <Field label="Notes" error="Required">
 *     <Textarea placeholder="Say something…" />
 *   </Field>
 */
import React from 'react'

export function Label({ children, className = '', ...rest }) {
  return (
    <label className={`dk-label ${className}`} {...rest}>
      {children}
    </label>
  )
}

export function Input({ className = '', ...rest }) {
  return <input className={`dk-input ${className}`} {...rest} />
}

export function Textarea({ className = '', ...rest }) {
  return <textarea className={`dk-textarea ${className}`} {...rest} />
}

export function Field({ label, htmlFor, error, children, className = '' }) {
  return (
    <div className={`dk-field ${className}`}>
      {label ? <Label htmlFor={htmlFor}>{label}</Label> : null}
      {children}
      {error ? <span className="dk-text-error">{error}</span> : null}
    </div>
  )
}

export default Field

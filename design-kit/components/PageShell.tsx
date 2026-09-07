import React from 'react'

export interface PageShellProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Cap the inner content width (px). Defaults to 1180. */
  maxWidth?: number
}

/**
 * PageShell — the full-bleed page canvas: black background, ambient mint
 * glow that slowly drifts, and a centered max-width column with vertical
 * rhythm between children. Wrap a page's content in this.
 */
export default function PageShell({
  maxWidth = 1180,
  className = '',
  children,
  ...rest
}: PageShellProps) {
  return (
    <div className={`dk-shell ${className}`} {...rest}>
      <div className="dk-shell__inner" style={{ maxWidth }}>
        {children}
      </div>
    </div>
  )
}

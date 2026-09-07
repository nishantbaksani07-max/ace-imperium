/**
 * DashboardShell — the full page chrome: black canvas with a slow ambient mint
 * glow, a centered max-width column, and an editorial italic greeting header.
 * Drop a PosterGrid (or anything) inside.
 *
 *   <DashboardShell greeting="Good evening," accent="Alex" date="Tuesday · June 9">
 *     <PosterGrid posters={…} />
 *   </DashboardShell>
 *
 * Pass `action` to render something in the top-right (e.g. a settings button).
 */
import React from 'react'

export default function DashboardShell({
  greeting,
  accent,
  date,
  action,
  children,
}) {
  return (
    <div className="dk-page">
      {action ? (
        <div style={{ position: 'absolute', top: 'var(--space-6)', right: 'var(--space-6)', zIndex: 10 }}>
          {action}
        </div>
      ) : null}

      <div className="dk-shell">
        {(greeting || date) && (
          <header className="dk-greeting">
            {greeting && (
              <h1 className="dk-greeting-title">
                {greeting}{accent ? <> <span className="dk-greeting-accent">{accent}</span></> : null}
              </h1>
            )}
            {date && <span className="dk-greeting-date">{date}</span>}
          </header>
        )}
        {children}
      </div>
    </div>
  )
}

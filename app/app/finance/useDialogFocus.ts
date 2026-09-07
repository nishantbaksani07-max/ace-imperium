'use client'

import { useEffect, type RefObject } from 'react'

/**
 * Modal focus management shared by the finance import dialogs.
 *
 * On open: remember what was focused, move focus into the panel, and trap Tab
 * within it. On close: restore focus to the element that opened the dialog.
 * The panel element should carry tabIndex={-1} so it can receive focus when it
 * has no focusable children yet.
 */
export function useDialogFocus(open: boolean, panelRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const panel = panelRef.current

    const focusables = (): HTMLElement[] =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter(el => el.offsetParent !== null)
        : []

    ;(focusables()[0] ?? panel)?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panel) return
      const els = focusables()
      if (!els.length) return
      const firstEl = els[0]
      const lastEl = els[els.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [open, panelRef])
}

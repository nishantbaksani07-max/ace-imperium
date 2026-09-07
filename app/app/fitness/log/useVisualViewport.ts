'use client'

import { useEffect, useState } from 'react'

/** The visible band above the on-screen keyboard. */
export interface ViewportBand {
  height: number
  offsetTop: number
}

/**
 * Track window.visualViewport so a bottom/centered modal can be pinned to the
 * band of screen that's actually visible above the iOS keyboard. On iOS the
 * keyboard does NOT shrink the layout viewport, so any vh-sized sheet spills
 * behind the keyboard; binding a backdrop's height/top to this fixes it.
 *
 * Returns null until measured (SSR / no visualViewport) — callers fall back to
 * a CSS default (e.g. 100dvh) in that case.
 */
export function useVisualViewport(): ViewportBand | null {
  const [band, setBand] = useState<ViewportBand | null>(null)
  useEffect(() => {
    const view = window.visualViewport
    if (!view) return
    // rAF-throttled: with the iOS keyboard open, visualViewport fires scroll
    // events every frame — one setState per frame max, and none at all when
    // the measured band hasn't actually changed.
    let rafId = 0
    const update = () => {
      rafId = 0
      setBand((prev) =>
        prev && prev.height === view.height && prev.offsetTop === view.offsetTop
          ? prev
          : { height: view.height, offsetTop: view.offsetTop },
      )
    }
    const schedule = () => {
      if (!rafId) rafId = requestAnimationFrame(update)
    }
    update()
    view.addEventListener('resize', schedule)
    view.addEventListener('scroll', schedule)
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      view.removeEventListener('resize', schedule)
      view.removeEventListener('scroll', schedule)
    }
  }, [])
  return band
}

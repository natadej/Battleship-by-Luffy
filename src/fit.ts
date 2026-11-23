import { type RefObject, useLayoutEffect } from 'react'

export const MIN_CELL = 14
export const MAX_CELL = 72

/** Largest whole size in [lo, hi] that `fits`, assuming bigger sizes fit less; `lo` if none do. */
export function largestFitting(lo: number, hi: number, fits: (n: number) => boolean): number {
  if (fits(hi)) return hi
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (fits(mid)) lo = mid
    else hi = mid
  }
  return lo
}

/**
 * Sizes the board squares (`--fit-cell` on the app) to the biggest that fills the screen without scrolling.
 * If the smallest squares still don't fit (a short phone on the result screen), the whole screen is zoomed down.
 */
export function useFitCell(ref: RefObject<HTMLElement | null>, key: string) {
  useLayoutEffect(() => {
    const app = ref.current
    if (!app) return
    const root = document.documentElement
    let frame = 0

    const fits = (cell: number) => {
      app.style.setProperty('--fit-cell', `${cell}px`)
      const vh = window.innerHeight
      return root.scrollWidth <= root.clientWidth && root.scrollHeight <= vh
    }
    const fit = () => {
      frame = 0
      app.dataset.fit = ''
      app.style.removeProperty('--app-zoom')
      if (fits(largestFitting(MIN_CELL, MAX_CELL, fits))) return
      const zoom = Math.min(window.innerHeight / root.scrollHeight, root.clientWidth / root.scrollWidth)
      app.style.setProperty('--app-zoom', String(Math.floor(zoom * 100) / 100))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(fit)
    }

    fit()
    window.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    const observer = new ResizeObserver(schedule)
    for (const child of app.children) if (!child.classList.contains('boards')) observer.observe(child)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
      observer.disconnect()
    }
  }, [ref, key])
}

/** Zooms a dialog down so all of it fits on the screen, instead of scrolling inside it. */
export function useFitZoom(ref: RefObject<HTMLElement | null>, key?: unknown) {
  useLayoutEffect(() => {
    const box = ref.current
    if (!box) return
    let frame = 0
    const fit = () => {
      frame = 0
      box.style.removeProperty('--dialog-zoom')
      const pad = box.parentElement ? parseFloat(getComputedStyle(box.parentElement).paddingTop) * 2 : 0
      const room = window.innerHeight - pad
      const need = box.getBoundingClientRect().height
      if (need > room) box.style.setProperty('--dialog-zoom', String(Math.floor((room / need) * 100) / 100))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(fit)
    }
    fit()
    window.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
    }
  }, [ref, key])
}

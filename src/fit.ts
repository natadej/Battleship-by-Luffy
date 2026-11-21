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
 * After a battle only the boards need to fit, since the score form above them scrolls.
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
      if (root.scrollWidth > root.clientWidth) return false
      if (app.classList.contains('phase-over')) return (app.querySelector('.boards')?.getBoundingClientRect().height ?? 0) <= vh
      return root.scrollHeight <= vh
    }
    const fit = () => {
      frame = 0
      app.dataset.fit = ''
      fits(largestFitting(MIN_CELL, MAX_CELL, fits))
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

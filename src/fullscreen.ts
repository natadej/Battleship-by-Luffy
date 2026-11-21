/** Full screen with Safari's webkit-prefixed fallback (older iPads and Macs). iPhone Safari has neither. */
type WebkitDocument = Document & { webkitFullscreenElement?: Element | null }
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }

export const canFullscreen = () => {
  const el = document.documentElement as WebkitElement
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function'
}

export const isFullscreen = () => !!(document.fullscreenElement ?? (document as WebkitDocument).webkitFullscreenElement)

/** Already full screen from the home-screen icon. */
export const isInstalled = () =>
  matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export async function requestFullscreen() {
  const el = document.documentElement as WebkitElement
  if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' })
  else await el.webkitRequestFullscreen?.()
}

export function onFullscreenChange(fn: () => void) {
  document.addEventListener('fullscreenchange', fn)
  document.addEventListener('webkitfullscreenchange', fn)
  return () => {
    document.removeEventListener('fullscreenchange', fn)
    document.removeEventListener('webkitfullscreenchange', fn)
  }
}

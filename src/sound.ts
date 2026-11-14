// Sound effects synthesised with the Web Audio API, so no audio assets are needed.

const MUTE_KEY = 'battleship-muted'
let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null
let muted = typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1'

/** Time between firing and impact; matches the shell-drop animation in App.css. */
export const IMPACT_DELAY_S = 0.22

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (!noise) {
    noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  return noise
}

function envelope(ac: AudioContext, start: number, peak: number, duration: number): GainNode {
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(peak, start + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  g.connect(ac.destination)
  return g
}

/** Call from a user gesture so browsers allow audio for later (AI) shots. */
export function unlockAudio() {
  audio()
}

export const isMuted = () => muted

export function setMuted(value: boolean) {
  muted = value
  localStorage.setItem(MUTE_KEY, value ? '1' : '0')
}

export function playExplosion(big = false) {
  const ac = audio()
  if (!ac || muted) return
  const t = ac.currentTime + IMPACT_DELAY_S
  const dur = big ? 1.6 : 0.9

  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac)
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(2400, t)
  lp.frequency.exponentialRampToValueAtTime(120, t + dur)
  src.connect(lp).connect(envelope(ac, t, big ? 0.9 : 0.7, dur))
  src.start(t)
  src.stop(t + dur)

  const boom = ac.createOscillator()
  boom.type = 'sine'
  boom.frequency.setValueAtTime(150, t)
  boom.frequency.exponentialRampToValueAtTime(38, t + 0.5)
  boom.connect(envelope(ac, t, 0.9, big ? 0.9 : 0.6))
  boom.start(t)
  boom.stop(t + 1)
}

export function playSplash() {
  const ac = audio()
  if (!ac || muted) return
  const t = ac.currentTime + IMPACT_DELAY_S

  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac)
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1200
  bp.Q.value = 0.7
  src.connect(bp).connect(envelope(ac, t, 0.25, 0.35))
  src.start(t)
  src.stop(t + 0.4)

  // Water-drop "bloop": a sine whose pitch sweeps up quickly, plus a smaller second drop.
  for (const [offset, from, to, peak] of [
    [0.02, 380, 1300, 0.45],
    [0.16, 700, 1900, 0.2],
  ] as const) {
    const osc = ac.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(from, t + offset)
    osc.frequency.exponentialRampToValueAtTime(to, t + offset + 0.09)
    osc.connect(envelope(ac, t + offset, peak, 0.16))
    osc.start(t + offset)
    osc.stop(t + offset + 0.2)
  }
}

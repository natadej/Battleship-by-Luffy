// Sound effects synthesised with the Web Audio API, so no audio assets are needed.

const MUTE_KEY = 'battleship-muted'
let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null
let master: AudioNode | null = null
let muted = typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1'

/** Small lead so the sound lines up with the impact animation starting on the next frame. */
export const IMPACT_DELAY_S = 0.02

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Everything plays through a compressor with make-up gain, so effects hit hard without clipping. */
function out(ac: AudioContext): AudioNode {
  if (!master) {
    const comp = ac.createDynamicsCompressor()
    comp.threshold.value = -20
    comp.knee.value = 6
    comp.ratio.value = 5
    comp.attack.value = 0.003
    comp.release.value = 0.25
    const gain = ac.createGain()
    gain.gain.value = 1.8
    comp.connect(gain).connect(ac.destination)
    master = comp
  }
  return master
}

/** Soft clipper that adds grit to low booms. */
function drive(ac: AudioContext, amount: number): WaveShaperNode {
  const ws = ac.createWaveShaper()
  const curve = new Float32Array(1024)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = Math.tanh(x * amount)
  }
  ws.curve = curve
  ws.connect(out(ac))
  return ws
}

/** Sub-bass thump: a sine that drops in pitch, pushed through the clipper. */
function thump(ac: AudioContext, t: number, from: number, to: number, dur: number, peak: number) {
  const o = ac.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(from, t)
  o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.6)
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(drive(ac, 3))
  o.start(t)
  o.stop(t + dur + 0.05)
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
  g.connect(out(ac))
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
  thump(ac, t, 90, 28, big ? 1.4 : 0.9, 1)
  noiseBurst(ac, t, 0.08, 'highpass', 2500, 0.6)
  if (big) for (const d of [0.25, 0.5]) thump(ac, t + d, 70, 25, 0.8, 0.6)
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

/** Rocket launch: a short cannon thump followed by a rising whoosh. */
export function playLaunch() {
  const ac = audio()
  if (!ac || muted) return
  const t = ac.currentTime

  const kick = ac.createOscillator()
  kick.type = 'triangle'
  kick.frequency.setValueAtTime(110, t)
  kick.frequency.exponentialRampToValueAtTime(45, t + 0.18)
  kick.connect(envelope(ac, t, 0.6, 0.25))
  kick.start(t)
  kick.stop(t + 0.3)
  noiseBurst(ac, t, 0.12, 'lowpass', 900, 0.7)

  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac)
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 3
  bp.frequency.setValueAtTime(300, t)
  bp.frequency.exponentialRampToValueAtTime(2200, t + 0.9)
  src.connect(bp).connect(envelope(ac, t + 0.05, 0.22, 1))
  src.start(t)
  src.stop(t + 1.1)
}

// Air battle: short effects. Callers rate-limit them.

function noiseBurst(ac: AudioContext, t: number, dur: number, type: BiquadFilterType, freq: number, peak: number) {
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac)
  const f = ac.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  src.connect(f).connect(envelope(ac, t, peak, dur))
  src.start(t, Math.random())
  src.stop(t + dur + 0.05)
  return f
}

/** Machine-gun rattle. */
export function playMachineGun(rounds = 7) {
  const ac = audio()
  if (!ac || muted) return
  for (let i = 0; i < rounds; i++) {
    const t = ac.currentTime + i * 0.065
    noiseBurst(ac, t, 0.05, 'bandpass', 1400, 0.35)
    thump(ac, t, 160, 60, 0.07, 0.45)
  }
}

/** Missile or rocket leaving the rail. */
export function playMissile() {
  const ac = audio()
  if (!ac || muted) return
  const t = ac.currentTime
  const f = noiseBurst(ac, t, 0.7, 'bandpass', 600, 0.3)
  f.frequency.exponentialRampToValueAtTime(2600, t + 0.7)
  thump(ac, t, 120, 40, 0.3, 0.6)
}

/** Jet fly-by: a roar that rises and falls in pitch. */
export function playJet() {
  const ac = audio()
  if (!ac || muted) return
  const t = ac.currentTime
  const f = noiseBurst(ac, t, 2.2, 'bandpass', 500, 0.3)
  f.Q.value = 1.5
  f.frequency.setValueAtTime(500, t)
  f.frequency.exponentialRampToValueAtTime(1800, t + 0.9)
  f.frequency.exponentialRampToValueAtTime(350, t + 2.2)
}

/** Helicopter rotor chop. */
export function playHelicopter() {
  const ac = audio()
  if (!ac || muted) return
  for (let i = 0; i < 14; i++) noiseBurst(ac, ac.currentTime + i * 0.085, 0.06, 'lowpass', 260, i < 3 ? 0.15 * (i + 1) : 0.5)
}

/** B-2 formation: a deep, detuned engine drone. */
export function playBomber() {
  const ac = audio()
  if (!ac || muted) return
  const t = ac.currentTime
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.2, t + 1)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 4)
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 320
  lp.connect(g).connect(out(ac))
  for (const hz of [55, 58.5, 110]) {
    const o = ac.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = hz
    o.connect(lp)
    o.start(t)
    o.stop(t + 4.1)
  }
}

/** Air-raid siren: two rising and falling wails. */
export function playSiren() {
  const ac = audio()
  if (!ac || muted) return
  const t = ac.currentTime
  const o = ac.createOscillator()
  o.type = 'triangle'
  o.frequency.setValueAtTime(420, t)
  o.frequency.linearRampToValueAtTime(880, t + 0.5)
  o.frequency.linearRampToValueAtTime(420, t + 1)
  o.frequency.linearRampToValueAtTime(880, t + 1.5)
  o.frequency.linearRampToValueAtTime(420, t + 2)
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.2)
  g.gain.setValueAtTime(0.12, t + 1.7)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2)
  o.connect(g).connect(out(ac))
  o.start(t)
  o.stop(t + 2.05)
}

/** Small mid-air explosion: flak or an aircraft going down. */
export function playPop() {
  const ac = audio()
  if (!ac || muted) return
  const t = ac.currentTime
  const f = noiseBurst(ac, t, 0.6, 'lowpass', 1800, 0.6)
  f.frequency.exponentialRampToValueAtTime(150, t + 0.6)
  thump(ac, t, 100, 30, 0.6, 0.8)
}

/** Aircraft shot down: a falling whine, then a huge double explosion. */
export function playKill() {
  const ac = audio()
  if (!ac || muted) return
  const t = ac.currentTime
  const o = ac.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(1400, t)
  o.frequency.exponentialRampToValueAtTime(180, t + 0.9)
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 2200
  o.connect(lp).connect(envelope(ac, t, 0.18, 0.95))
  o.start(t)
  o.stop(t + 1)
  thump(ac, t, 120, 30, 1.6, 1)
  noiseBurst(ac, t, 0.1, 'highpass', 2000, 0.7)
  const roar = noiseBurst(ac, t, 2, 'lowpass', 3000, 0.9)
  roar.frequency.exponentialRampToValueAtTime(100, t + 2)
  const t2 = t + 0.9
  thump(ac, t2, 90, 24, 1.8, 1)
  const roar2 = noiseBurst(ac, t2, 1.8, 'lowpass', 2400, 0.8)
  roar2.frequency.exponentialRampToValueAtTime(90, t2 + 1.8)
}

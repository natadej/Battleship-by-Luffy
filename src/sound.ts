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

/** A heavy shell hitting the sea: a deep impact, a roaring wash of water, then falling spray. */
export function playSplash() {
  const ac = audio()
  if (!ac || muted) return
  const t = ac.currentTime + IMPACT_DELAY_S
  thump(ac, t, 85, 32, 0.7, 0.9)
  noiseBurst(ac, t, 0.06, 'lowpass', 1200, 0.7)
  const wash = noiseBurst(ac, t + 0.02, 1.3, 'lowpass', 2600, 0.75)
  wash.frequency.exponentialRampToValueAtTime(260, t + 1.3)
  const spray = noiseBurst(ac, t + 0.15, 0.9, 'bandpass', 3200, 0.3)
  spray.Q.value = 0.6
  spray.frequency.exponentialRampToValueAtTime(900, t + 1.05)
  for (let i = 0; i < 6; i++) noiseBurst(ac, t + 0.45 + Math.random() * 0.6, 0.05, 'highpass', 2500, 0.08)
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

// Noise helper shared by the effects.

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

/** Machine-gun burst: per round a sharp muzzle crack, a chesty body and a low kick, with slight
 * timing and pitch jitter, then a short rumbling echo. */
export function playMachineGun(rounds = 5) {
  const ac = audio()
  if (!ac || muted) return
  const t0 = ac.currentTime
  for (let i = 0; i < rounds; i++) {
    const t = t0 + i * 0.09 + Math.random() * 0.012
    const crack = noiseBurst(ac, t, 0.025, 'highpass', 2800 + Math.random() * 800, 0.55)
    crack.Q.value = 0.8
    noiseBurst(ac, t, 0.09, 'bandpass', 700 + Math.random() * 200, 0.5)
    thump(ac, t, 140 + Math.random() * 30, 55, 0.1, 0.6)
  }
  const tail = noiseBurst(ac, t0 + rounds * 0.09, 0.6, 'lowpass', 500, 0.25)
  tail.frequency.exponentialRampToValueAtTime(120, t0 + rounds * 0.09 + 0.6)
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

/** B-52 bombers: a deep, detuned engine drone. */
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

/** Nuclear blast: a crack, a ground-shaking sub-bass boom and a long rolling roar. */
export function playNuke() {
  const ac = audio()
  if (!ac || muted) return
  const t = ac.currentTime + IMPACT_DELAY_S
  noiseBurst(ac, t, 0.15, 'highpass', 1800, 0.9)
  thump(ac, t, 70, 16, 3, 1)
  thump(ac, t + 0.35, 50, 14, 2.5, 0.8)
  const roar = noiseBurst(ac, t, 3.8, 'lowpass', 3500, 1)
  roar.frequency.exponentialRampToValueAtTime(50, t + 3.8)
}

/** Reward chime: a bright rising arpeggio with a shimmer on top. */
export function playReward() {
  const ac = audio()
  if (!ac || muted) return
  const t = ac.currentTime
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51]
  notes.forEach((hz, i) => {
    const at = t + i * 0.08
    for (const [type, mult, peak] of [['triangle', 1, 0.32], ['sine', 2, 0.1]] as const) {
      const o = ac.createOscillator()
      o.type = type
      o.frequency.value = hz * mult
      o.connect(envelope(ac, at, peak, i === notes.length - 1 ? 1.1 : 0.45))
      o.start(at)
      o.stop(at + 1.2)
    }
  })
}

/** A wrench clank and a rivet ping, for a garage block upgrade. */
export function playClank() {
  const ac = audio()
  if (!ac || muted) return
  const t = ac.currentTime
  ;[
    [420, 0, 0.25],
    [1250, 0.09, 0.18],
  ].forEach(([hz, dt, peak]) => {
    const o = ac.createOscillator()
    o.type = 'square'
    o.frequency.setValueAtTime(hz, t + dt)
    o.frequency.exponentialRampToValueAtTime(hz * 0.7, t + dt + 0.15)
    o.connect(envelope(ac, t + dt, peak, 0.18))
    o.start(t + dt)
    o.stop(t + dt + 0.25)
  })
}

/** The shared context, for the background music. */
export const audioContext = () => audio()

/** Radio squelch: a crackle and a click when the radio opens, a two-tone "roger" beep when it closes. */
export function playRadio(open: boolean, urgent = false) {
  const ac = audio()
  if (!ac || muted) return
  const t = ac.currentTime
  // An urgent call opens on a low two-hit alarm pulse, to raise the pulse before she speaks.
  if (open && urgent)
    [0, 0.14].forEach((dt) => {
      const o = ac.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(180, t + dt)
      o.frequency.exponentialRampToValueAtTime(90, t + dt + 0.12)
      o.connect(envelope(ac, t + dt, 0.12, 0.13))
      o.start(t + dt)
      o.stop(t + dt + 0.15)
    })
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac)
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1800
  bp.Q.value = 1.5
  src.connect(bp).connect(envelope(ac, t, 0.08, open ? 0.18 : 0.12))
  src.start(t, Math.random())
  src.stop(t + 0.25)
  ;(open ? [1200] : [1000, 1400]).forEach((f, i) => {
    const at = t + (open ? 0.02 : 0.08 + i * 0.07)
    const o = ac.createOscillator()
    o.type = 'square'
    o.frequency.value = f
    o.connect(envelope(ac, at, 0.05, 0.06))
    o.start(at)
    o.stop(at + 0.1)
  })
}

/** A cute rising "boop" for each step of the guide. */
export function playBoop() {
  const ac = audio()
  if (!ac || muted) return
  const t = ac.currentTime
  const o = ac.createOscillator()
  o.type = 'triangle'
  o.frequency.setValueAtTime(660, t)
  o.frequency.exponentialRampToValueAtTime(1320, t + 0.12)
  o.connect(envelope(ac, t, 0.18, 0.22))
  o.start(t)
  o.stop(t + 0.3)
}

/** A short clock tick for the last seconds of a Blitz shot; `last` is the higher, final beep. */
export function playTick(last = false) {
  const ac = audio()
  if (!ac || muted) return
  const t = ac.currentTime
  const o = ac.createOscillator()
  o.type = 'square'
  o.frequency.value = last ? 1320 : 880
  o.connect(envelope(ac, t, 0.12, last ? 0.25 : 0.08))
  o.start(t)
  o.stop(t + 0.3)
}

/** Healing: a heartbeat thump, then a rising shimmer of bells, as the hurt ship comes back to life. */
export function playRevive() {
  const ac = audio()
  if (!ac || muted) return
  const t = ac.currentTime + IMPACT_DELAY_S
  thump(ac, t, 90, 50, 0.25, 0.5)
  thump(ac, t + 0.22, 90, 50, 0.25, 0.4)
  ;[523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => {
    const at = t + 0.45 + i * 0.09
    const o = ac.createOscillator()
    o.type = 'triangle'
    o.frequency.value = f
    o.connect(envelope(ac, at, 0.2, i === 5 ? 1.2 : 0.5))
    o.start(at)
    o.stop(at + 1.3)
  })
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac)
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 4
  bp.frequency.setValueAtTime(600, t + 0.4)
  bp.frequency.exponentialRampToValueAtTime(6000, t + 1.4)
  src.connect(bp).connect(envelope(ac, t + 0.4, 0.12, 1.1))
  src.start(t + 0.4)
  src.stop(t + 1.6)
}

/**
 * Relocating a healed ship: a looping radio-wave warble (a wobbling tone and tuning static).
 * Returns a function that stops it.
 */
export function startWarp(): () => void {
  const ac = audio()
  if (!ac || muted) return () => {}
  const t = ac.currentTime
  const bus = ac.createGain()
  bus.gain.setValueAtTime(0.0001, t)
  bus.gain.exponentialRampToValueAtTime(0.09, t + 0.3)
  bus.connect(out(ac))

  const tone = ac.createOscillator()
  tone.type = 'sine'
  tone.frequency.value = 520
  const wobble = ac.createOscillator()
  wobble.frequency.value = 5
  const wobbleDepth = ac.createGain()
  wobbleDepth.gain.value = 160
  wobble.connect(wobbleDepth).connect(tone.frequency)
  const sweep = ac.createOscillator()
  sweep.frequency.value = 0.35
  const sweepDepth = ac.createGain()
  sweepDepth.gain.value = 260
  sweep.connect(sweepDepth).connect(tone.frequency)
  const toneGain = ac.createGain()
  toneGain.gain.value = 0.5
  tone.connect(toneGain).connect(bus)

  const hiss = ac.createBufferSource()
  hiss.buffer = noiseBuffer(ac)
  hiss.loop = true
  const tune = ac.createBiquadFilter()
  tune.type = 'bandpass'
  tune.Q.value = 6
  tune.frequency.value = 1500
  const tuneLfo = ac.createOscillator()
  tuneLfo.frequency.value = 0.8
  const tuneDepth = ac.createGain()
  tuneDepth.gain.value = 900
  tuneLfo.connect(tuneDepth).connect(tune.frequency)
  const hissGain = ac.createGain()
  hissGain.gain.value = 0.6
  hiss.connect(tune).connect(hissGain).connect(bus)

  const sources = [tone, wobble, sweep, hiss, tuneLfo]
  for (const s of sources) s.start(t)
  return () => {
    const now = ac.currentTime
    bus.gain.cancelScheduledValues(now)
    bus.gain.setTargetAtTime(0.0001, now, 0.05)
    for (const s of sources) s.stop(now + 0.3)
    setTimeout(() => bus.disconnect(), 400)
  }
}

/** The healed ship arrives at its new spot: a falling warp zap and a bright two-note chime. */
export function playWarpDone() {
  const ac = audio()
  if (!ac || muted) return
  const t = ac.currentTime + IMPACT_DELAY_S
  const zap = ac.createOscillator()
  zap.type = 'sawtooth'
  zap.frequency.setValueAtTime(2400, t)
  zap.frequency.exponentialRampToValueAtTime(180, t + 0.35)
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 3000
  zap.connect(lp).connect(envelope(ac, t, 0.15, 0.4))
  zap.start(t)
  zap.stop(t + 0.45)
  ;[987.77, 1318.5].forEach((f, i) => {
    const at = t + 0.3 + i * 0.12
    const o = ac.createOscillator()
    o.type = 'square'
    o.frequency.value = f
    o.connect(envelope(ac, at, 0.1, 0.5))
    o.start(at)
    o.stop(at + 0.6)
  })
}

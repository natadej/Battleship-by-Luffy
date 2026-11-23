import { audioContext, isMuted } from './sound'

/**
 * Looping 90s-style war-zone marches made with oscillators: a filtered sawtooth "brass" lead,
 * a galloping bass, and military snare drums with rolls.
 */
export type Theme = 'battle' | 'boss'

interface Song {
  bpm: number
  lead: string
  bass: string
  /** k = kick, s = snare, r = snare roll, t = low tom, h = hi-hat, - = rest; one character per 16th note. */
  drums: string
  /** Brightness of the brass lead (lowpass cut-off, Hz). */
  brass: number
}

const gallop = (root: string) => {
  const [n, o] = [root.slice(0, -1), Number(root.slice(-1))]
  const lo = `${n}${o}`
  const hi = `${n}${o + 1}`
  return `${lo} - ${lo} ${lo} ${hi} - ${lo} ${lo} ${lo} - ${lo} ${lo} ${hi} - ${lo} ${lo} `
}

// One token per 16th note: a note like C5 or F#3, '-' for a rest, '~' to hold the note before.
export const SONGS: Record<Theme, Song> = {
  // A heroic march in D minor: a bugle-call fanfare over a galloping bass and a marching snare.
  battle: {
    bpm: 116,
    lead:
      'D5 ~ ~ - D5 - D5 - F5 ~ ~ - A5 ~ ~ - ' +
      'G5 ~ ~ - F5 - E5 - F5 ~ ~ ~ D5 ~ ~ - ' +
      'D5 ~ ~ - D5 - D5 - F5 ~ ~ - A5 ~ C6 ~ ' +
      'D6 ~ ~ ~ C6 ~ A5 ~ G5 ~ E5 ~ D5 ~ ~ - ' +
      'A4 ~ ~ - A4 - A4 - A#4 ~ ~ - A4 ~ ~ - ' +
      'G4 ~ ~ - G4 - A4 - A#4 ~ C5 ~ D5 ~ ~ - ' +
      'A4 ~ ~ - A4 - A4 - A#4 ~ ~ - C5 ~ ~ - ' +
      'D5 ~ ~ ~ E5 ~ ~ ~ F5 ~ ~ ~ E5 ~ ~ - ',
    bass: ['D2', 'A#1', 'D2', 'C2', 'A1', 'G1', 'A#1', 'A1'].map(gallop).join(''),
    drums: 'k-ssk-s-k-ssr-s-k-ssk-s-k-s-rrrr',
    brass: 1600,
  },
  // The boss: faster and darker, E minor with a creeping half-step menace and pounding toms.
  boss: {
    bpm: 148,
    lead:
      'E5 - E5 - F5 - E5 - D#5 - E5 - G5 ~ F5 - ' +
      'E5 ~ ~ - B4 ~ ~ - C5 ~ B4 - A#4 ~ B4 - ' +
      'E5 - E5 - F5 - E5 - D#5 - E5 - A5 ~ G5 - ' +
      'F5 ~ E5 ~ D#5 ~ E5 ~ B5 ~ ~ ~ ~ - - - ',
    bass: ['E2', 'C2', 'E2', 'B1'].map(gallop).join(''),
    drums: 'k-tsk-tsktk-r-tsk-tsk-tsk-trtrrr',
    brass: 2200,
  },
}

const NOTE = /^([A-G])(#?)(\d)$/
const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

export function noteFreq(note: string): number | null {
  const m = NOTE.exec(note)
  if (!m) return null
  const midi = 12 * (Number(m[3]) + 1) + SEMI[m[1]] + (m[2] ? 1 : 0)
  return 440 * 2 ** ((midi - 69) / 12)
}

/** Notes with their length in steps; rests and holds are null. */
export function parseLine(line: string): ({ freq: number; steps: number } | null)[] {
  const tokens = line.trim().split(/\s+/)
  return tokens.map((t, i) => {
    const freq = noteFreq(t)
    if (freq === null) return null
    let steps = 1
    while (tokens[i + steps] === '~') steps++
    return { freq, steps }
  })
}

let playing: { theme: Theme; timer: ReturnType<typeof setInterval>; gain: GainNode } | null = null

export function startMusic(theme: Theme) {
  if (playing?.theme === theme) return
  stopMusic()
  const ac = audioContext()
  if (!ac || isMuted()) return
  const song = SONGS[theme]
  const lead = parseLine(song.lead)
  const bass = parseLine(song.bass)
  const step = 60 / song.bpm / 4
  const gain = ac.createGain()
  gain.gain.value = 0.4
  gain.connect(ac.destination)
  const brass = ac.createBiquadFilter()
  brass.type = 'lowpass'
  brass.frequency.value = song.brass
  brass.Q.value = 2
  brass.connect(gain)
  const noise = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

  const tone = (type: OscillatorType, freq: number, t: number, dur: number, peak: number, to: AudioNode = gain) => {
    const osc = ac.createOscillator()
    const env = ac.createGain()
    osc.type = type
    osc.frequency.value = freq
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(peak, t + 0.02)
    env.gain.setValueAtTime(peak, t + dur * 0.7)
    env.gain.linearRampToValueAtTime(0, t + dur)
    osc.connect(env).connect(to)
    osc.start(t)
    osc.stop(t + dur)
  }
  const snare = (t: number, peak: number) => {
    const src = ac.createBufferSource()
    const filter = ac.createBiquadFilter()
    const env = ac.createGain()
    src.buffer = noise
    filter.type = 'bandpass'
    filter.frequency.value = 2200
    env.gain.setValueAtTime(peak, t)
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
    src.connect(filter).connect(env).connect(gain)
    src.start(t)
    src.stop(t + 0.1)
  }
  const boom = (t: number, from: number, to: number, peak: number) => {
    const osc = ac.createOscillator()
    const env = ac.createGain()
    osc.frequency.setValueAtTime(from, t)
    osc.frequency.exponentialRampToValueAtTime(to, t + 0.15)
    env.gain.setValueAtTime(peak, t)
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
    osc.connect(env).connect(gain)
    osc.start(t)
    osc.stop(t + 0.22)
  }
  const drum = (kind: string, t: number) => {
    if (kind === 'k') boom(t, 120, 40, 0.4)
    else if (kind === 't') boom(t, 190, 80, 0.3)
    else if (kind === 's') snare(t, 0.22)
    else if (kind === 'r') {
      snare(t, 0.12)
      snare(t + step / 2, 0.16)
    } else if (kind === 'h') {
      const src = ac.createBufferSource()
      const filter = ac.createBiquadFilter()
      const env = ac.createGain()
      src.buffer = noise
      filter.type = 'highpass'
      filter.frequency.value = 7000
      env.gain.setValueAtTime(0.05, t)
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.04)
      src.connect(filter).connect(env).connect(gain)
      src.start(t)
      src.stop(t + 0.04)
    }
  }

  let n = 0
  let next = ac.currentTime + 0.05
  const timer = setInterval(() => {
    while (next < ac.currentTime + 0.12) {
      const l = lead[n % lead.length]
      const b = bass[n % bass.length]
      if (l) {
        tone('sawtooth', l.freq, next, l.steps * step * 0.95, 0.05, brass)
        tone('square', l.freq / 2, next, l.steps * step * 0.95, 0.015, brass)
      }
      if (b) tone('triangle', b.freq, next, b.steps * step * 0.8, 0.14)
      drum(song.drums[n % song.drums.length], next)
      n++
      next += step
    }
  }, 25)
  playing = { theme, timer, gain }
}

export function stopMusic() {
  if (!playing) return
  const { timer, gain } = playing
  clearInterval(timer)
  const ac = gain.context
  gain.gain.setTargetAtTime(0, ac.currentTime, 0.05)
  setTimeout(() => gain.disconnect(), 400)
  playing = null
}

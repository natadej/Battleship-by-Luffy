import { audioContext, isMuted } from './sound'

/** Looping 90s-style chiptune made with oscillators: a square-wave lead, triangle bass and noise drums. */
export type Theme = 'battle' | 'boss'

interface Song {
  bpm: number
  lead: string
  bass: string
  /** k = kick, s = snare, h = hi-hat, - = rest; one character per 16th note. */
  drums: string
}

// One token per 16th note: a note like C5 or F#3, '-' for a rest, '~' to hold the note before.
export const SONGS: Record<Theme, Song> = {
  battle: {
    bpm: 132,
    lead:
      'E5 - G5 - C6 - G5 - A5 ~ G5 - E5 - D5 - ' +
      'C5 - E5 - G5 - A5 G5 F5 - E5 ~ ~ - D5 - ' +
      'E5 - G5 - C6 - D6 - E6 ~ D6 - C6 - A5 - ' +
      'G5 - E5 - F5 - D5 - C5 ~ ~ ~ - - - - ',
    bass: 'C3 - C4 - G2 - G3 - A2 - A3 - F2 - G2 - ',
    drums: 'k-h-s-h-k-k-s-h-',
  },
  boss: {
    bpm: 168,
    lead:
      'A4 - A4 C5 - A4 D5 - A4 E5 - D5 C5 - B4 - ' +
      'A4 - A4 C5 - A4 D5 - E5 F5 E5 D5 C5 - E5 - ' +
      'F5 - F5 E5 - D5 E5 - G5 - F5 E5 D5 - C5 - ' +
      'B4 - B4 C5 - D5 E5 ~ ~ ~ G#5 ~ A5 ~ - - ',
    bass: 'A2 A2 A3 A2 A2 A2 A3 A2 F2 F2 F3 F2 G2 G2 G#2 G2 ',
    drums: 'k-hhs-hhk-khs-hs',
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
  gain.gain.value = 0.55
  gain.connect(ac.destination)
  const noise = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

  const tone = (type: OscillatorType, freq: number, t: number, dur: number, peak: number) => {
    const osc = ac.createOscillator()
    const env = ac.createGain()
    osc.type = type
    osc.frequency.value = freq
    env.gain.setValueAtTime(peak, t)
    env.gain.setValueAtTime(peak, t + dur * 0.7)
    env.gain.linearRampToValueAtTime(0, t + dur)
    osc.connect(env).connect(gain)
    osc.start(t)
    osc.stop(t + dur)
  }
  const drum = (kind: string, t: number) => {
    if (kind === 'k') {
      const osc = ac.createOscillator()
      const env = ac.createGain()
      osc.frequency.setValueAtTime(140, t)
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.12)
      env.gain.setValueAtTime(0.35, t)
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
      osc.connect(env).connect(gain)
      osc.start(t)
      osc.stop(t + 0.15)
    } else if (kind === 's' || kind === 'h') {
      const src = ac.createBufferSource()
      const filter = ac.createBiquadFilter()
      const env = ac.createGain()
      src.buffer = noise
      filter.type = kind === 's' ? 'bandpass' : 'highpass'
      filter.frequency.value = kind === 's' ? 1800 : 7000
      const len = kind === 's' ? 0.12 : 0.04
      env.gain.setValueAtTime(kind === 's' ? 0.25 : 0.08, t)
      env.gain.exponentialRampToValueAtTime(0.001, t + len)
      src.connect(filter).connect(env).connect(gain)
      src.start(t)
      src.stop(t + len)
    }
  }

  let n = 0
  let next = ac.currentTime + 0.05
  const timer = setInterval(() => {
    while (next < ac.currentTime + 0.12) {
      const l = lead[n % lead.length]
      const b = bass[n % bass.length]
      if (l) tone('square', l.freq, next, l.steps * step * 0.95, 0.045)
      if (b) tone('triangle', b.freq, next, b.steps * step * 0.9, 0.12)
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

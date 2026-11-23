// The radio officer: short battlefield call-outs read by the device's own speech voice, framed by radio squelch.
import { isMuted, playRadio } from './sound'
import { duckMusic } from './music'

const KEY = 'battleship-voice'
let on = typeof localStorage === 'undefined' || localStorage.getItem(KEY) !== '0'
let voice: SpeechSynthesisVoice | null | undefined

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window
export const isVoiceOn = () => on

export function setVoiceOn(value: boolean) {
  on = value
  localStorage.setItem(KEY, value ? '1' : '0')
  if (!value) hush()
}

/** A deep English voice if the device has one, so it sounds like a soldier on the radio. */
function pickVoice(): SpeechSynthesisVoice | null {
  const all = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang))
  if (!all.length) return null
  const deep = /\b(male|daniel|fred|alex|aaron|arthur|david|george|guy|james|mark|oliver|rishi|tom)\b/i
  return all.find((v) => deep.test(v.name) && !/female/i.test(v.name)) ?? all.find((v) => /en-(US|GB)/i.test(v.lang)) ?? all[0]
}

/**
 * Speaks one line. A normal line is skipped if the radio is busy, so call-outs never pile up;
 * an urgent one (the guide, a ship sinking) cuts in.
 */
export function say(text: string, urgent = false) {
  if (!on || isMuted() || !canSpeak()) return
  const ss = window.speechSynthesis
  if (ss.speaking || ss.pending) {
    if (!urgent) return
    ss.cancel()
  }
  if (voice === undefined || !voice) voice = pickVoice()
  const u = new SpeechSynthesisUtterance(text)
  if (voice) u.voice = voice
  u.lang = voice?.lang ?? 'en-US'
  u.pitch = 0.6
  u.rate = 1.05
  const done = () => {
    duckMusic(false)
    playRadio(false)
  }
  u.onend = done
  u.onerror = () => duckMusic(false)
  playRadio(true)
  duckMusic(true)
  ss.speak(u)
}

export function hush() {
  if (!canSpeak()) return
  window.speechSynthesis.cancel()
  duckMusic(false)
}

/** One of several lines, so repeated call-outs don't sound canned. */
export const pick = <T,>(lines: T[], rng: () => number = Math.random): T => lines[Math.floor(rng() * lines.length)]

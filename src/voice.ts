// The radio officer, a fired-up female voice: short battlefield call-outs read by the device's own speech voice, framed by radio squelch.
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

/** Female English voices on Apple, Android, Windows and Chrome, best-sounding first. */
const FEMALE = /\b(female|samantha|ava|allison|susan|zoe|victoria|karen|moira|tessa|fiona|serena|kate|aria|jenny|libby|sonia|natasha|zira|hazel|catherine)\b/i

/** A female English voice if the device has one; natural or enhanced ones first, then any English voice. */
export function pickVoice(voices: SpeechSynthesisVoice[] = speechSynthesis.getVoices()): SpeechSynthesisVoice | null {
  const all = voices.filter((v) => /^en/i.test(v.lang))
  if (!all.length) return null
  const female = all.filter((v) => FEMALE.test(v.name) && !/\bmale\b/i.test(v.name.replace(/female/i, '')))
  const best = (vs: SpeechSynthesisVoice[]) => vs.find((v) => /natural|enhanced|premium|neural|google/i.test(v.name)) ?? vs[0]
  return best(female) ?? best(all.filter((v) => /en-(US|GB|AU)/i.test(v.lang))) ?? all[0]
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
  // A little faster and brighter than normal speech, urgent lines more so: an officer under fire.
  u.pitch = urgent ? 1.2 : 1.1
  u.rate = urgent ? 1.18 : 1.1
  const done = () => {
    duckMusic(false)
    playRadio(false)
  }
  u.onend = done
  u.onerror = () => duckMusic(false)
  playRadio(true, urgent)
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

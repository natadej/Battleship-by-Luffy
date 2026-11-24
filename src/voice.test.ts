import { describe, expect, it } from 'vitest'
import { pickVoice } from './voice'

const v = (name: string, lang = 'en-US') => ({ name, lang }) as SpeechSynthesisVoice

describe('radio voice', () => {
  it('prefers a natural female English voice, then any female one, then any English one', () => {
    expect(pickVoice([v('Daniel', 'en-GB'), v('Samantha'), v('Microsoft Aria Online (Natural)'), v('Amélie', 'fr-FR')])?.name).toBe('Microsoft Aria Online (Natural)')
    expect(pickVoice([v('Google UK English Male', 'en-GB'), v('Karen', 'en-AU')])?.name).toBe('Karen')
    expect(pickVoice([v('Fred'), v('Thomas', 'fr-FR')])?.name).toBe('Fred')
    expect(pickVoice([v('Thomas', 'fr-FR')])).toBeNull()
  })
})

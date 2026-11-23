// Which first-time tours the player has already seen.

export type Tour = 'placement' | 'battle'

const KEY = 'battleship-guide'

export function seenTours(): Tour[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Tour[]
  } catch {
    return []
  }
}

export function markSeen(tour: Tour) {
  const seen = seenTours()
  if (seen.includes(tour)) return
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen, tour]))
  } catch {
    // Storage full or blocked: the tour just shows again next time.
  }
}

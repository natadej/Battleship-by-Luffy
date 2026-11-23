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
  if (!seen.includes(tour)) localStorage.setItem(KEY, JSON.stringify([...seen, tour]))
}

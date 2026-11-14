# Devin-Battleship

A 10×10 Battleship game in React + TypeScript (Vite), with a Hunt & Target AI opponent.

```bash
npm install
npm run dev     # play at http://localhost:5173
npm test        # unit tests (Vitest)
npm run build   # type-check + production build
```

## Features

- **Fleet placement** — the 5 standard ships (Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2). Pick a ship, hover for a green/red placement preview, click to place, press <kbd>R</kbd> to rotate. Click a placed ship to pick it back up. Or hit **Randomize**.
- **Enemy board** — ships hidden; click to fire. Hits (✕), misses (•), and sunk ships are marked. The last shot on each board is outlined.
- **Hunt & Target AI** — the badge on your board shows which mode the AI is in.
- Fleet status, battle log, win/lose detection, play again.

## Hunt & Target AI (`src/game/ai.ts`)

The AI only sees what a human opponent would: miss / hit / "you sank my X".

- **Hunt:** fire at a random unknown cell. It restricts itself to a checkerboard pattern — the smallest ship is length 2, so every ship must cover at least one cell of each colour. This halves the search space without ever skipping a ship.
- **Target:** after a hit, fire at the unknown N/S/E/W neighbours. Once two hits line up, the orientation is known, so it only extends along that line (both ends).
- **Sunk:** when a ship is announced sunk, its hits are retired. Any other unresolved hits (e.g. an adjacent ship hit while chasing the first) keep the AI in Target mode; otherwise it returns to Hunt.

Measured over 300 simulated games (`npm test`): **~51 shots** to win on average vs **~95** for purely random guessing.

## Structure

```
src/game/board.ts   board model, placement, firing (pure functions)
src/game/ai.ts      Hunt & Target AI (pure functions)
src/game/game.ts    game reducer: phases, turns, win detection
src/components/     Grid and FleetStatus UI
src/App.tsx         wiring, placement UX, AI turn timing
```

Game logic is framework-free and immutable, so it's unit-tested directly without rendering React.

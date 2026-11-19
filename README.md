# Devin-Battleship

A 10×10 Battleship game in React + TypeScript (Vite), with a Hunt & Target AI opponent, five difficulty levels and a local leaderboard.

```bash
npm install
npm run dev     # play at http://localhost:5173
npm test        # unit tests (Vitest)
npm run build   # type-check + production build
```

## Features

- **Fleet placement** — the 5 standard ships (Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2). Drag a ship from the list (or drag a placed ship) onto the board, with a green/red preview. Tap a placed ship to rotate it in place; **Rotate** / <kbd>R</kbd> sets the orientation for new ships. Or hit **Randomize**. Works with mouse and touch.
- **Artillery** — every shot takes ~2.5 s: the attacker's cannon slides round the edge of its board, aims, and fires a rocket in an arc onto the target, then the explosion / splash plays.
- **Five levels** — pick the enemy level before the battle (see below).
- **Probability shade** — optional orange glow on enemy waters where a ship is most likely, computed only from shots fired so far (never from hidden positions). Turning it on at any point in a battle halves that game's score.
- **Score & leaderboard** — score = (accuracy × 1000 + 500 if you win) × level, halved if the shade was used. Save it under your name; the top 20 are ranked by score, then accuracy, in this browser's `localStorage`.
- **Phones** — landscape layout with both boards side by side; portrait shows a "turn your phone" screen (Android can go fullscreen and lock landscape).
- **Enemy board** — ships hidden; click to fire. Hits (✕), misses (•), and sunk ships are marked. The last shot on each board is outlined.
- **Hunt & Target AI** — the badge on your board shows which mode the AI is in.
- Fleet status, battle log, win/lose detection, play again.

## Hunt & Target AI (`src/game/ai.ts`)

The AI only sees what a human opponent would: miss / hit / "you sank my X".

- **Hunt:** fire at a random unknown cell. It restricts itself to a checkerboard pattern — the smallest ship is length 2, so every ship must cover at least one cell of each colour. This halves the search space without ever skipping a ship.
- **Target:** after a hit, fire at the unknown N/S/E/W neighbours. Once two hits line up, the orientation is known, so it only extends along that line (both ends).
- **Sunk:** when a ship is announced sunk, its hits are retired. Any other unresolved hits (e.g. an adjacent ship hit while chasing the first) keep the AI in Target mode; otherwise it returns to Hunt.

### Levels

| Level | Strategy | Avg shots to win* |
|---|---|---|
| 1 Recruit | Random | ~95 |
| 2 Sailor | Random hunt, tries neighbours after a hit | ~62 |
| 3 Officer | Hunt & Target (follows the line of hits) | ~62 |
| 4 Captain | Hunt & Target + checkerboard hunt | ~52 |
| 5 Admiral | Probability density: scores every cell by how many ways the remaining ships could cover it (placements through open hits weighted heavily) and fires at the max | ~45 |

\*300 simulated games each; `src/game/ai.test.ts` checks that each level is at least as strong as the one below.

## Structure

```
src/game/board.ts   board model, placement, firing (pure functions)
src/game/ai.ts           AI levels 1–5 (pure functions)
src/game/probability.ts  ship-placement probability map (level 5 + shade)
src/game/score.ts        accuracy and score
src/game/game.ts         game reducer: phases, turns, win detection
src/artillery.ts         cannon + rocket animation (Web Animations API)
src/leaderboard.ts       device leaderboard + upload queue for the global board
src/components/          Grid, Cannon, FleetStatus, Leaderboard UI
src/App.tsx              wiring, drag & drop, turn timing
```

Game logic is framework-free and immutable, so it's unit-tested directly without rendering React.

## Global leaderboard (`worker/`)

A Cloudflare Worker (`battleship-api`) with a D1 database stores the world scores:

- `GET /scores?limit=20` returns the top scores.
- `POST /scores` adds one. The server checks every field, cleans the name, ignores repeated ids (so retries are safe) and allows 6 posts a minute per IP.

The game always saves to the device first, then uploads. Scores saved offline wait in a queue and upload on the next start or when the device reconnects.

The build reads the API address from `VITE_LEADERBOARD_URL`: put it in `.env.local` for local builds, and in the repo's Actions secret of the same name for GitHub Pages. Without it, the game shows the device leaderboard only.

Deploy (needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment):

```sh
cd worker
cp wrangler.example.toml wrangler.toml   # fill in the D1 database id and your Pages origin
npx wrangler@4 d1 execute battleship-leaderboard --remote --file schema.sql
npx wrangler@4 deploy
```


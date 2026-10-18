# Carom

Carom is a top-down paddle duel that runs entirely in the browser. Two paddles
face each other across a dark field. The ball bounces between them, off the top
and bottom walls, and off two fixed pillars in the middle of the court. You
score when the ball gets past the far edge behind your opponent. First to 11
wins, by two clear points.

Spin is the twist. If your paddle is moving when it strikes the ball, the ball
curls in that direction afterward, and the pillars turn every rally into a
bank-shot puzzle. Play **Solo** against a CPU opponent, or **Versus** against a
friend on the same keyboard.

Everything is drawn in code on a canvas, and every sound is synthesized. There
is no backend and nothing is fetched at runtime.

## Install

Requires Node.js 20.19 or later (the showcase capture script needs Node.js 24).

```sh
npm ci
```

## Run in development

```sh
npm run dev
```

Then open the URL Vite prints (by default <http://localhost:5173>).

## Production build

```sh
npm run build
```

This type-checks and writes a self-contained static site to `dist/`, with
`index.html` at its root. Serve that directory from any static file host, or
preview it locally with `npm run preview`.

## Controls

| Action                    | Keys                          |
| ------------------------- | ----------------------------- |
| Player one up / down      | `W` / `S`                     |
| Player two up / down      | `↑` / `↓`                     |
| Menu up / down            | `W` / `S` or `↑` / `↓`        |
| Confirm                   | `Enter` or `Space`            |
| Back                      | `Esc`                         |
| Pause / resume            | `P` or `Esc`                  |
| Mute / unmute             | `M`                           |
| Debug overlay             | `` ` `` (backtick)            |

In **Solo**, both pairs of movement keys move your (left) paddle. In
**Versus**, player one uses `W`/`S` and player two uses the arrow keys.

Menus also work with a mouse or touch: tap or click an item to choose it. On a
touchscreen, a slider appears along each side of the screen to move the
paddles.

### Playing tips

- Hit the ball near the end of your paddle to send it out at a steep angle.
- Move your paddle as the ball arrives to put spin on it. Moving down curls the
  ball clockwise and moving up curls it the other way. Spin fades over about a
  second but carries through every bounce.
- Bank shots off the amber pillars to get around your opponent.

## Development

| Command             | Checks                                       |
| ------------------- | -------------------------------------------- |
| `npm run typecheck` | `tsc --noEmit`                               |
| `npm run lint`      | ESLint                                       |
| `npm run format`    | Prettier, in check mode                      |
| `npm test`          | Vitest unit tests over `src/`, with coverage |

The game lives in `src/`, built on the Simple 2D engine (documented under
`engine/`). The specification is under `specs/`.

- `game.ts`: the state and debug-surface types, and the `game` object.
- `update.ts`: one frame's transition (input, menus, paddles, serve, scoring).
- `physics.ts`: paddle integration and the sub-stepped ball flight.
- `ai.ts`: the Solo opponent.
- `menus.ts`: menu items and their hit regions.
- `render.ts`: all drawing.
- `debug.ts`: the debug and automation surface, and overlay diagnostics.
- `state.ts`: building the title state, parking the ball, starting a match.

The store-page showcase lives in `showcase/`. `node scripts/showcase.ts`
recaptures its screenshots and its replay.

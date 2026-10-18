// Showcase staging, loaded into a browser page by `scripts/showcase.ts` through
// the Vite dev server. It stands a second engine up over a canvas of its own,
// on a constant clock, so a scene can be posed through the debug surface and
// stepped frame by frame. It is tooling only and is not part of the build.

import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Engine } from "@clockwyrks/simple-2d";
import {
  FIELD_H,
  FIELD_W,
  LAYOUT,
  PADDLE_SPEED,
  P1_X1,
} from "../src/constants";
import { BACKGROUND, game } from "../src/game";
import type { CaromDebugApi, CaromState } from "../src/game";

type CaromEngine = Engine<CaromState, CaromDebugApi>;

export async function boot(): Promise<CaromEngine> {
  for (const old of document.querySelectorAll("canvas")) old.remove();
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100vw;height:100vh";
  document.body.append(canvas);
  const engine = createEngine({
    canvas,
    width: FIELD_W,
    height: FIELD_H,
    game,
    background: BACKGROUND,
    layout: LAYOUT,
    clock: new ConstantClock(1000 / 60),
  });
  await engine.initialize();
  return engine;
}

/**
 * Player one's stand-in: it lines its paddle up so the ball strikes off-center,
 * then swings through the contact to put spin on the return.
 */
function steerLeft(engine: CaromEngine, swing: number): void {
  const s = engine.state;
  const ball = s.ball;
  const paddle = s.paddles.left;
  let vy = 0;
  if (ball !== null && !ball.held && ball.vx < 0) {
    const eta = (ball.x - P1_X1) / -ball.vx;
    const aim = ball.y + ball.vy * Math.min(eta, 0.25) - swing * 22;
    vy = eta < 0.12 ? swing * PADDLE_SPEED : (aim - paddle.cy) * 9;
  }
  vy = Math.max(-PADDLE_SPEED, Math.min(PADDLE_SPEED, vy));
  engine.apply((st) => engine.debug.setPaddleVy(st, "left", vy));
}

/** Steps `frames` frames of Solo play with the stand-in on the left. */
export async function play(
  engine: CaromEngine,
  frames: number,
  swing: number,
): Promise<void> {
  engine.apply((s) => engine.debug.setPaddleDriven(s, "left", true));
  for (let i = 0; i < frames; i++) {
    steerLeft(engine, swing);
    await engine.advance(1);
  }
}

declare global {
  interface Window {
    carom: { boot: typeof boot; play: typeof play };
  }
}

window.carom = { boot, play };

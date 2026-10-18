// The render-free simulation core: paddle integration and the ball's flight,
// sub-stepped against the frame's delta time (specs/playfield.md,
// specs/balls.md). Nothing here reads input, plays sound, or draws.

import type { DeepReadonly } from "ts-essentials";
import {
  BALL_R,
  FIELD_H,
  MAX_BOUNCE_ANGLE,
  MAX_SUBSTEP,
  OBSTACLES,
  P1_X0,
  P1_X1,
  P2_X0,
  P2_X1,
  PADDLE_HALF,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
} from "./constants";
import type { Rect } from "./constants";
import type { BallState, ObstacleState, PaddleState } from "./game";

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Moves a paddle at `vy` for `dt` seconds, clamped to the field. The returned
 * `vy` is the velocity the paddle actually travelled at, so a paddle pinned
 * against a bound reports `0`.
 */
export function integratePaddle(
  paddle: DeepReadonly<PaddleState>,
  vy: number,
  dt: number,
): PaddleState {
  const next = clamp(paddle.cy + vy * dt, PADDLE_MIN_CY, PADDLE_MAX_CY);
  const unclamped = paddle.cy + vy * dt;
  const actualVy = next !== unclamped && dt > 0 ? (next - paddle.cy) / dt : vy;
  return { ...paddle, cy: next, vy: actualVy };
}

/** A paddle's collision rectangle. */
export function paddleRect(side: "left" | "right", cy: number): Rect {
  const [x0, x1] = side === "left" ? [P1_X0, P1_X1] : [P2_X0, P2_X1];
  return { x0, y0: cy - PADDLE_HALF, x1, y1: cy + PADDLE_HALF };
}

export type Face = "left" | "right" | "top" | "bottom";

/** The ball's mutable working copy inside one frame's sub-steps. */
interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
}

/**
 * Resolves the ball against an axis-aligned rectangle: places it `BALL_R` off
 * the struck face and reverses the normal velocity if it points into that face.
 * Returns the struck face, or `null` when the ball does not overlap.
 */
function resolveRect(body: Body, rect: Rect): Face | null {
  const left = body.x - (rect.x0 - BALL_R);
  const right = rect.x1 + BALL_R - body.x;
  const top = body.y - (rect.y0 - BALL_R);
  const bottom = rect.y1 + BALL_R - body.y;
  if (left <= 0 || right <= 0 || top <= 0 || bottom <= 0) return null;

  const depth = Math.min(left, right, top, bottom);
  const face: Face =
    depth === left
      ? "left"
      : depth === right
        ? "right"
        : depth === top
          ? "top"
          : "bottom";

  switch (face) {
    case "left":
      body.x = rect.x0 - BALL_R;
      if (body.vx > 0) body.vx = -body.vx;
      break;
    case "right":
      body.x = rect.x1 + BALL_R;
      if (body.vx < 0) body.vx = -body.vx;
      break;
    case "top":
      body.y = rect.y0 - BALL_R;
      if (body.vy > 0) body.vy = -body.vy;
      break;
    case "bottom":
      body.y = rect.y1 + BALL_R;
      if (body.vy < 0) body.vy = -body.vy;
      break;
  }
  return face;
}

/** The top and bottom walls. Returns whether the ball reflected. */
function resolveWalls(body: Body): boolean {
  if (body.y - BALL_R < 0 && body.vy < 0) {
    body.y = BALL_R;
    body.vy = -body.vy;
    return true;
  }
  if (body.y + BALL_R > FIELD_H && body.vy > 0) {
    body.y = FIELD_H - BALL_R;
    body.vy = -body.vy;
    return true;
  }
  return false;
}

/**
 * The paddle bounce: the outgoing angle from the contact offset, the speed-up,
 * the spin the paddle's motion adds, and placement off the front face.
 */
function paddleBounce(
  body: Body,
  side: "left" | "right",
  paddle: DeepReadonly<PaddleState>,
): void {
  const offset = clamp((body.y - paddle.cy) / PADDLE_HALF, -1, 1);
  const theta = offset * MAX_BOUNCE_ANGLE;
  const speed = Math.min(Math.hypot(body.vx, body.vy) * SPEED_MULT, SPEED_CAP);
  const dir = side === "left" ? 1 : -1;
  body.vx = dir * speed * Math.cos(theta);
  body.vy = speed * Math.sin(theta);
  body.spin = clamp(
    body.spin + paddle.vy * SPIN_FROM_PADDLE,
    -SPIN_CLAMP,
    SPIN_CLAMP,
  );
  body.x = side === "left" ? P1_X1 + BALL_R : P2_X0 - BALL_R;
}

/** What a frame's flight ran into, each raised at most once per frame. */
export interface Contacts {
  paddle: boolean;
  wall: boolean;
  obstacle: boolean;
}

/** One sub-step: spin, decay, advance, then every collision in order. */
function subStep(
  body: Body,
  h: number,
  paddles: DeepReadonly<{ left: PaddleState; right: PaddleState }>,
  obstacles: readonly DeepReadonly<ObstacleState>[],
  contacts: Contacts,
): void {
  const speed = Math.hypot(body.vx, body.vy);
  if (speed > 0) {
    const angle = (body.spin / speed) * h;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const vx = body.vx * cos - body.vy * sin;
    body.vy = body.vx * sin + body.vy * cos;
    body.vx = vx;
  }
  body.spin *= Math.pow(0.5, h / SPIN_HALFLIFE);
  body.x += body.vx * h;
  body.y += body.vy * h;

  if (resolveWalls(body)) contacts.wall = true;

  for (const side of ["left", "right"] as const) {
    const paddle = paddles[side];
    const face = resolveRect(body, paddleRect(side, paddle.cy));
    if (face === "left" || face === "right") {
      paddleBounce(body, side, paddle);
      contacts.paddle = true;
    } else if (face !== null) {
      contacts.wall = true;
    }
  }

  // Obstacle A before obstacle B, whichever order they were spawned in.
  for (const [index, rect] of OBSTACLES.entries()) {
    if (!obstacles.some((o) => o.index === index)) continue;
    if (resolveRect(body, rect) !== null) contacts.obstacle = true;
  }
}

/** How many sub-steps a frame of `dt` seconds at `speed` is cut into. */
export function subStepCount(speed: number, dt: number): number {
  return Math.max(1, Math.ceil((speed * dt) / MAX_SUBSTEP));
}

/**
 * Advances a flying ball by `dt` seconds against the paddles and the obstacles
 * present, returning the ball it leaves and what it touched.
 */
export function stepBall(
  ball: DeepReadonly<BallState>,
  paddles: DeepReadonly<{ left: PaddleState; right: PaddleState }>,
  obstacles: readonly DeepReadonly<ObstacleState>[],
  dt: number,
): { ball: BallState; contacts: Contacts } {
  const body: Body = {
    x: ball.x,
    y: ball.y,
    vx: ball.vx,
    vy: ball.vy,
    spin: ball.spin,
  };
  const contacts: Contacts = { paddle: false, wall: false, obstacle: false };
  const n = subStepCount(Math.hypot(ball.vx, ball.vy), dt);
  const h = dt / n;
  for (let i = 0; i < n; i++) subStep(body, h, paddles, obstacles, contacts);
  return { ball: { ...ball, ...body }, contacts };
}

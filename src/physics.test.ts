import { describe, expect, it } from "vitest";
import {
  BALL_R,
  FIELD_H,
  MAX_BOUNCE_ANGLE,
  OBSTACLE_CENTERS,
  OBSTACLES,
  P1_X1,
  P2_X0,
  PADDLE_HALF,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
} from "./constants";
import type { BallState, ObstacleState, PaddleState } from "./game";
import {
  clamp,
  integratePaddle,
  paddleRect,
  stepBall,
  subStepCount,
} from "./physics";

const paddle = (cy: number, vy = 0): PaddleState => ({
  cy,
  vy,
  driven: false,
  drivenVy: 0,
});

const ball = (fields: Partial<BallState>): BallState => ({
  x: 640,
  y: 360,
  vx: 0,
  vy: 0,
  spin: 0,
  held: false,
  holdTimer: 0,
  serveSign: 1,
  trail: [],
  ...fields,
});

const noPaddles = { left: paddle(-1000), right: paddle(-1000) };
const allObstacles: ObstacleState[] = OBSTACLE_CENTERS.map((c, index) => ({
  index,
  cx: c.x,
  cy: c.y,
}));

describe("paddle integration", () => {
  it("moves at the velocity it is given", () => {
    const next = integratePaddle(paddle(300), 720, 0.1);
    expect(next.cy).toBeCloseTo(372);
    expect(next.vy).toBe(720);
  });

  it("clamps at the bounds and reports the velocity actually travelled", () => {
    const top = integratePaddle(paddle(60), -720, 0.1);
    expect(top.cy).toBe(PADDLE_MIN_CY);
    expect(top.vy).toBeCloseTo(-50);
    const pinned = integratePaddle(paddle(PADDLE_MAX_CY), 720, 1 / 60);
    expect(pinned.cy).toBe(PADDLE_MAX_CY);
    expect(pinned.vy).toBe(0);
  });

  it("keeps the velocity when dt is zero", () => {
    const next = integratePaddle(paddle(PADDLE_MAX_CY), 720, 0);
    expect(next.cy).toBe(PADDLE_MAX_CY);
    expect(next.vy).toBe(720);
  });

  it("clamps values into range", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
  });
});

describe("sub-steps", () => {
  it("cuts a frame so no sub-step travels more than MAX_SUBSTEP", () => {
    expect(subStepCount(0, 1 / 60)).toBe(1);
    expect(subStepCount(520, 1 / 60)).toBe(3);
    expect(subStepCount(980, 0.1)).toBe(25);
  });
});

describe("walls", () => {
  it("reflects off the top wall keeping speed and spin", () => {
    const { ball: b, contacts } = stepBall(
      ball({ y: BALL_R + 1, vx: 100, vy: -300, spin: 0 }),
      noPaddles,
      [],
      0.02,
    );
    expect(b.vy).toBeGreaterThan(0);
    expect(b.y).toBeGreaterThanOrEqual(BALL_R);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(Math.hypot(100, 300));
    expect(contacts.wall).toBe(true);
  });

  it("reflects off the bottom wall", () => {
    const { ball: b, contacts } = stepBall(
      ball({ y: FIELD_H - BALL_R - 1, vx: 0, vy: 300 }),
      noPaddles,
      [],
      0.02,
    );
    expect(b.vy).toBe(-300);
    expect(b.y).toBeLessThanOrEqual(FIELD_H - BALL_R);
    expect(contacts.wall).toBe(true);
  });
});

describe("paddle bounce", () => {
  it("sends a center hit straight back, faster", () => {
    const { ball: b, contacts } = stepBall(
      ball({ x: P1_X1 + BALL_R + 2, y: 360, vx: -500, vy: 0 }),
      { left: paddle(360), right: paddle(-1000) },
      [],
      1 / 60,
    );
    expect(contacts.paddle).toBe(true);
    expect(b.vx).toBeGreaterThan(0);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(500 * SPEED_MULT);
    expect(b.vy).toBeCloseTo(0);
  });

  it("angles an edge hit at MAX_BOUNCE_ANGLE and places the ball off the face", () => {
    const { ball: b } = stepBall(
      ball({ x: P2_X0 - BALL_R - 1, y: 360 + PADDLE_HALF, vx: 400, vy: 0 }),
      { left: paddle(-1000), right: paddle(360) },
      [],
      0.004,
    );
    expect(b.vx).toBeLessThan(0);
    expect(Math.atan2(b.vy, -b.vx)).toBeCloseTo(MAX_BOUNCE_ANGLE);
    expect(b.x).toBeLessThanOrEqual(P2_X0 - BALL_R);
  });

  it("adds spin from the paddle's motion, clamped, and caps the speed", () => {
    const { ball: b } = stepBall(
      ball({ x: P1_X1 + BALL_R + 1, y: 360, vx: -975, vy: 0, spin: 0 }),
      { left: paddle(360, 720), right: paddle(-1000) },
      [],
      0.002,
    );
    expect(b.spin).toBeCloseTo(720 * SPIN_FROM_PADDLE, 0);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(SPEED_CAP);

    const { ball: c } = stepBall(
      ball({ x: P1_X1 + BALL_R + 1, y: 360, vx: -500, spin: 800 }),
      { left: paddle(360, 720), right: paddle(-1000) },
      [],
      0.004,
    );
    expect(c.spin).toBeLessThanOrEqual(SPIN_CLAMP);
    expect(c.spin).toBeGreaterThan(SPIN_CLAMP - 5);
  });

  it("treats the end cap like a wall", () => {
    const rect = paddleRect("left", 360);
    const { ball: b, contacts } = stepBall(
      ball({ x: 56, y: rect.y0 - BALL_R + 1, vx: 0, vy: 200 }),
      { left: paddle(360), right: paddle(-1000) },
      [],
      0.001,
    );
    expect(contacts.paddle).toBe(false);
    expect(contacts.wall).toBe(true);
    expect(b.vy).toBe(-200);
    expect(b.y).toBe(rect.y0 - BALL_R);
  });
});

describe("obstacles", () => {
  it("bounce the ball off their faces without changing speed or spin", () => {
    const a = OBSTACLES[0];
    const { ball: b, contacts } = stepBall(
      ball({ x: a.x0 - BALL_R - 1, y: 220, vx: 600, vy: 50, spin: 100 }),
      noPaddles,
      allObstacles,
      0.005,
    );
    expect(contacts.obstacle).toBe(true);
    expect(b.vx).toBeLessThan(0);
    expect(b.x).toBeLessThanOrEqual(a.x0 - BALL_R);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(Math.hypot(600, 50));
  });

  it("are ignored when absent", () => {
    const a = OBSTACLES[0];
    const { contacts } = stepBall(
      ball({ x: a.x0 - BALL_R - 1, y: 220, vx: 600 }),
      noPaddles,
      [allObstacles[1]],
      0.005,
    );
    expect(contacts.obstacle).toBe(false);
  });

  it("resolve top and bottom faces", () => {
    const b2 = OBSTACLES[1];
    const top = stepBall(
      ball({ x: 790, y: b2.y0 - BALL_R - 1, vx: 0, vy: 300 }),
      noPaddles,
      allObstacles,
      0.01,
    ).ball;
    expect(top.vy).toBe(-300);
    const bottom = stepBall(
      ball({ x: 790, y: b2.y1 + BALL_R + 1, vx: 0, vy: -300 }),
      noPaddles,
      allObstacles,
      0.01,
    ).ball;
    expect(bottom.vy).toBe(300);
  });

  it("resolve the right face", () => {
    const a = OBSTACLES[0];
    const { ball: b } = stepBall(
      ball({ x: a.x1 + BALL_R + 1, y: 220, vx: -400, vy: 0 }),
      noPaddles,
      allObstacles,
      0.01,
    );
    expect(b.vx).toBe(400);
    expect(b.x).toBe(a.x1 + BALL_R);
  });
});

describe("spin", () => {
  it("curves the flight clockwise for positive spin and decays", () => {
    const { ball: b } = stepBall(
      ball({ vx: 500, vy: 0, spin: 600 }),
      noPaddles,
      [],
      0.2,
    );
    expect(b.vy).toBeGreaterThan(0);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(500);
    expect(b.spin).toBeCloseTo(600 * Math.pow(0.5, 0.2 / 0.8));
  });

  it("curves counter-clockwise for negative spin", () => {
    const { ball: b } = stepBall(
      ball({ vx: -500, vy: 0, spin: -600 }),
      noPaddles,
      [],
      0.2,
    );
    expect(b.vy).toBeGreaterThan(0);
  });

  it("leaves a still ball still", () => {
    const { ball: b } = stepBall(ball({ spin: 300 }), noPaddles, [], 0.1);
    expect(b.x).toBe(640);
    expect(b.vx).toBe(0);
  });
});

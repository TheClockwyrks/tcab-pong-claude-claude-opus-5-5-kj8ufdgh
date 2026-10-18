import { describe, expect, it } from "vitest";
import { AI_REACT, AI_SPEED } from "./constants";
import type { BallState } from "./game";
import { aiVelocity } from "./ai";

const on = { tracking: true, movement: true };
const ball = (fields: Partial<BallState>): BallState => ({
  x: 900,
  y: 200,
  vx: 400,
  vy: 100,
  spin: 0,
  held: false,
  holdTimer: 0,
  serveSign: 1,
  trail: [],
  ...fields,
});

describe("the AI", () => {
  it("chases a ball coming its way, leading by its reaction lag", () => {
    const target = 200 - 100 * AI_REACT;
    const vy = aiVelocity(360, ball({}), "playing", on, 1 / 60);
    expect(vy).toBe(-AI_SPEED);
    const near = aiVelocity(target + 30, ball({}), "playing", on, 0.1);
    expect(near).toBeCloseTo(-300);
  });

  it("stops inside the deadzone", () => {
    expect(aiVelocity(195, ball({ vy: 0 }), "playing", on, 1 / 60)).toBe(0);
  });

  it("returns home when the ball travels away", () => {
    const vy = aiVelocity(200, ball({ vx: -400 }), "playing", on, 1 / 60);
    expect(vy).toBe(AI_SPEED);
    expect(aiVelocity(370, ball({ vx: -400 }), "playing", on, 1 / 60)).toBe(0);
  });

  it("returns home outside of play and with no ball", () => {
    expect(aiVelocity(200, ball({}), "countdown", on, 1 / 60)).toBe(AI_SPEED);
    expect(aiVelocity(200, null, "playing", on, 1 / 60)).toBe(AI_SPEED);
  });

  it("honors its tracking and movement gates", () => {
    const blind = { tracking: false, movement: true };
    expect(aiVelocity(200, ball({}), "playing", blind, 1 / 60)).toBe(AI_SPEED);
    const frozen = { tracking: true, movement: false };
    expect(aiVelocity(200, ball({}), "playing", frozen, 1 / 60)).toBe(0);
  });
});

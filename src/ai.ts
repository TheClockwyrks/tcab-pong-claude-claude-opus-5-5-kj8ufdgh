// The Solo opponent (specs/modes/single-player.md). It holds no state of its
// own: each frame it reads the ball and its own paddle and picks a velocity.

import type { DeepReadonly } from "ts-essentials";
import {
  AI_DEADZONE,
  AI_HOME_DEADZONE,
  AI_HOME_Y,
  AI_REACT,
  AI_SPEED,
} from "./constants";
import type { AiState, BallState, Screen } from "./game";

/** The vertical velocity the AI sets its paddle to for this frame. */
export function aiVelocity(
  cy: number,
  ball: DeepReadonly<BallState> | null,
  screen: Screen,
  ai: DeepReadonly<AiState>,
  dt: number,
): number {
  if (!ai.movement) return 0;

  let target = AI_HOME_Y;
  let deadzone = AI_HOME_DEADZONE;
  if (ai.tracking && screen === "playing" && ball !== null && ball.vx > 0) {
    target = ball.y - ball.vy * AI_REACT;
    deadzone = AI_DEADZONE;
  }

  const diff = target - cy;
  if (Math.abs(diff) <= deadzone) return 0;
  return Math.sign(diff) * Math.min(AI_SPEED, Math.abs(diff) / dt);
}

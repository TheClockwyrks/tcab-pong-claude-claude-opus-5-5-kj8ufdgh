// Building whole states: the title screen, a parked ball, the obstacles, and
// the two transitions every menu shares — starting a match and returning to the
// title (specs/state.md, specs/ui.md, specs/balls.md).

import type { DeepReadonly } from "ts-essentials";
import { FIELD_CX, FIELD_CY, HOLD_TIME, OBSTACLE_CENTERS } from "./constants";
import type {
  BallState,
  CaromState,
  Mode,
  ObstacleState,
  PaddleState,
} from "./game";

/** A fresh serve sign, `1` and `-1` equally likely. */
export function drawServeSign(): 1 | -1 {
  return Math.random() < 0.5 ? 1 : -1;
}

/** The ball parked at its home point, waiting out a full hold. */
export function parkedBall(): BallState {
  return {
    x: FIELD_CX,
    y: FIELD_CY,
    vx: 0,
    vy: 0,
    spin: 0,
    held: true,
    holdTimer: HOLD_TIME,
    serveSign: drawServeSign(),
    trail: [],
  };
}

/** Obstacle `index` at its fixed center. */
export function obstacleAt(index: number): ObstacleState {
  const center = OBSTACLE_CENTERS[index];
  return { index, cx: center.x, cy: center.y };
}

/** A paddle at rest at the vertical center, played by its own side. */
function restingPaddle(): PaddleState {
  return { cy: FIELD_CY, vy: 0, driven: false, drivenVy: 0 };
}

/** The state the game opens on, holding the given copy of the mute bit. */
export function titleState(muted: boolean): CaromState {
  return {
    screen: "title",
    mode: "solo",
    menuIndex: 0,
    titleIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    paddles: { left: restingPaddle(), right: restingPaddle() },
    ai: { tracking: true, movement: true },
    receiver: "left",
    ball: parkedBall(),
    obstacles: OBSTACLE_CENTERS.map((_, index) => obstacleAt(index)),
    simTime: 0,
    muted,
    presses: [],
  };
}

/**
 * The next state with every member of `state` copied as is. The declared types
 * are readonly throughout, so the read-only view is already a valid state.
 */
export function thaw(state: DeepReadonly<CaromState>): CaromState {
  return { ...state };
}

/** Starts a match in `mode`, as every menu that starts one does. */
export function startMatch(
  state: DeepReadonly<CaromState>,
  mode: Mode,
): CaromState {
  const { left, right } = state.paddles;
  return {
    ...thaw(state),
    mode,
    screen: "countdown",
    resumeScreen: "playing",
    menuIndex: 0,
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: parkedBall(),
    paddles: {
      left: { ...left, cy: FIELD_CY, vy: 0 },
      right: { ...right, cy: FIELD_CY, vy: 0 },
    },
    presses: [],
  };
}

/**
 * Returns to the title: every declared field back at its title-screen value
 * except `titleIndex`, `simTime` and `muted`, with `menuIndex` restored from
 * `titleIndex`.
 */
export function returnToTitle(state: DeepReadonly<CaromState>): CaromState {
  return {
    ...titleState(state.muted),
    titleIndex: state.titleIndex,
    menuIndex: state.titleIndex,
    simTime: state.simTime,
  };
}

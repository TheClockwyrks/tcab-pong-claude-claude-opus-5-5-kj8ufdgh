// One frame's transition: the mute bit, the input the starting screen reads,
// then the advancement of the screen that input left the game on
// (specs/ui.md, specs/balls.md).

import type { PointerSample, UpdateApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import {
  BALL_R,
  CUES,
  FIELD_W,
  PADDLE_SPEED,
  SERVE_ANGLE,
  SERVE_SPEED,
  TRAIL_TIME,
  WIN_LEAD,
  WIN_SCORE,
} from "./constants";
import type {
  BallState,
  CaromState,
  MenuPress,
  PaddleState,
  Screen,
  Side,
  TrailSample,
} from "./game";
import { aiVelocity } from "./ai";
import { itemAt, menuItems, wrapIndex } from "./menus";
import { integratePaddle, stepBall } from "./physics";
import { parkedBall, returnToTitle, startMatch, thaw } from "./state";

type View = DeepReadonly<CaromState>;

/** The held movement of both paddles' human players, each `-1`, `0` or `1`. */
interface Axes {
  readonly left: number;
  readonly right: number;
}

const STILL: Axes = { left: 0, right: 0 };

export function updateGame(
  state: View,
  api: UpdateApi,
  dt: number,
): CaromState {
  // The state's copy of the mute bit is what a pose writes, so the runtime is
  // brought into line with it before the `mute` action toggles it.
  if (api.audio.muted() !== state.muted) api.audio.setMuted(state.muted);
  if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());

  const began = state.screen;
  let next: CaromState = {
    ...thaw(state),
    simTime: state.simTime + dt,
    muted: api.audio.muted(),
  };

  next = readScreenInput(next, api);

  const axes =
    began === "countdown" || began === "playing"
      ? readAxes(next.mode, api)
      : STILL;
  return advance(next, api, dt, axes);
}

// ---- Input -------------------------------------------------------------------

function readAxes(mode: CaromState["mode"], api: UpdateApi): Axes {
  const held = (name: string) => (api.input.value(name) > 0 ? 1 : 0);
  if (mode === "solo") {
    const up = Math.max(held("p1-up"), held("p2-up"));
    const down = Math.max(held("p1-down"), held("p2-down"));
    return { left: down - up, right: 0 };
  }
  return {
    left: held("p1-down") - held("p1-up"),
    right: held("p2-down") - held("p2-up"),
  };
}

/** The menu's movement and confirm edges, read once each for this frame. */
function menuEdges(api: UpdateApi): { step: number; confirm: boolean } {
  const up = api.input.pressed("p1-up") || api.input.pressed("p2-up");
  const down = api.input.pressed("p1-down") || api.input.pressed("p2-down");
  const confirm = api.input.pressed("confirm");
  return { step: up ? -1 : down ? 1 : 0, confirm };
}

function readScreenInput(state: CaromState, api: UpdateApi): CaromState {
  switch (state.screen) {
    case "countdown":
    case "playing":
      if (api.input.pressed("pause")) {
        return {
          ...state,
          resumeScreen: state.screen,
          screen: "paused",
          menuIndex: 0,
          presses: [],
        };
      }
      return state.presses.length > 0 ? { ...state, presses: [] } : state;

    case "paused": {
      const pause = api.input.pressed("pause");
      const back = api.input.pressed("back");
      if (pause || back) return resume(state);
      return readMenu(state, api);
    }

    case "howto":
    case "matchover":
      if (api.input.pressed("back")) return returnToTitle(state);
      return readMenu(state, api);

    case "title":
      return readMenu(state, api);
  }
}

function resume(state: CaromState): CaromState {
  return { ...state, screen: state.resumeScreen, presses: [] };
}

/** The keyboard's menu edges, then the pointer and touch contacts. */
function readMenu(state: CaromState, api: UpdateApi): CaromState {
  const count = menuItems(state.screen).length;
  const { step, confirm } = menuEdges(api);
  if (step !== 0) {
    const moved = {
      ...state,
      menuIndex: wrapIndex(state.menuIndex, step, count),
    };
    return readPointers(moved, api.input.pointerSamples());
  }
  if (confirm) return confirmItem(state, state.menuIndex);
  return readPointers(state, api.input.pointerSamples());
}

function isPressButton(sample: PointerSample): boolean {
  return sample.button === "primary" || sample.button === null;
}

/**
 * Applies this frame's pointer samples in arrival order: landing on or moving
 * onto an item selects it, and a press and release inside one item confirms it.
 */
function readPointers(
  state: CaromState,
  samples: readonly PointerSample[],
): CaromState {
  let current = state;
  for (const sample of samples) {
    const screen = current.screen;
    const item = itemAt(screen, sample.x, sample.y);
    if (item >= 0) current = { ...current, menuIndex: item };

    const others = current.presses.filter((p) => p.id !== sample.id);
    if (sample.type === "down" && isPressButton(sample)) {
      const press: MenuPress = { id: sample.id, screen, item };
      current = { ...current, presses: [...others, press] };
    } else if (sample.type === "up") {
      const press = current.presses.find((p) => p.id === sample.id);
      current = { ...current, presses: others };
      if (
        press !== undefined &&
        isPressButton(sample) &&
        press.screen === screen &&
        press.item >= 0 &&
        press.item === item
      ) {
        // The confirm moves the game to another screen, which takes its first
        // input on the next update.
        return confirmItem(current, item);
      }
    }
  }
  return current;
}

/** Confirms item `index` of the menu the current screen shows. */
function confirmItem(state: CaromState, index: number): CaromState {
  const menuIndex = index;
  switch (state.screen) {
    case "title":
      if (index === 0) return startMatch({ ...state, titleIndex: 0 }, "solo");
      if (index === 1) {
        return startMatch({ ...state, titleIndex: 1 }, "versus");
      }
      if (index === 2) {
        return {
          ...state,
          titleIndex: 2,
          screen: "howto",
          menuIndex: 0,
          presses: [],
        };
      }
      return { ...state, menuIndex };
    case "howto":
      return returnToTitle(state);
    case "paused":
      if (index === 0) return resume({ ...state, menuIndex });
      if (index === 1) return startMatch(state, state.mode);
      if (index === 2) return returnToTitle(state);
      return state;
    case "matchover":
      if (index === 0) return startMatch(state, state.mode);
      if (index === 1) return returnToTitle(state);
      return state;
    default:
      return state;
  }
}

// ---- Advancement ---------------------------------------------------------------

function advance(
  state: CaromState,
  api: UpdateApi,
  dt: number,
  axes: Axes,
): CaromState {
  if (state.screen !== "countdown" && state.screen !== "playing") return state;

  const paddles = movePaddles(state, dt, axes);
  let next: CaromState = { ...state, paddles };
  const ball = next.ball;
  if (ball === null) return next;

  if (ball.held) {
    next = countDown(next, ball, dt);
  } else if (next.screen === "playing") {
    const flight = stepBall(ball, paddles, next.obstacles, dt);
    if (flight.contacts.paddle) api.audio.play(CUES.paddleHit);
    if (flight.contacts.wall) api.audio.play(CUES.wallBounce);
    if (flight.contacts.obstacle) api.audio.play(CUES.obstacleBounce);
    next = withTrailSample({ ...next, ball: flight.ball });
    return score(next, api);
  }
  return withTrailSample(next);
}

function movePaddles(
  state: CaromState,
  dt: number,
  axes: Axes,
): CaromState["paddles"] {
  const velocity = (side: Side, paddle: PaddleState): number => {
    if (paddle.driven) return paddle.drivenVy;
    if (side === "right" && state.mode === "solo") {
      return aiVelocity(paddle.cy, state.ball, state.screen, state.ai, dt);
    }
    return axes[side] * PADDLE_SPEED;
  };
  const { left, right } = state.paddles;
  return {
    left: integratePaddle(left, velocity("left", left), dt),
    right: integratePaddle(right, velocity("right", right), dt),
  };
}

/** A waiting ball's hold counts down, and the serve leaves when it runs out. */
function countDown(state: CaromState, ball: BallState, dt: number): CaromState {
  const holdTimer = ball.holdTimer - dt;
  if (holdTimer > 0) return { ...state, ball: { ...ball, holdTimer } };

  const dir = state.receiver === "left" ? -1 : 1;
  return {
    ...state,
    screen: "playing",
    ball: {
      ...ball,
      holdTimer: 0,
      held: false,
      trail: [],
      vx: dir * SERVE_SPEED * Math.cos(SERVE_ANGLE),
      vy: ball.serveSign * SERVE_SPEED * Math.sin(SERVE_ANGLE),
    },
  };
}

/** Appends the ball's position to its trail and drops the stale samples. */
function withTrailSample(state: CaromState): CaromState {
  const ball = state.ball;
  if (ball === null) return state;
  const sample: TrailSample = { x: ball.x, y: ball.y, t: state.simTime };
  const trail = [...ball.trail, sample].filter(
    (s) => state.simTime - s.t <= TRAIL_TIME,
  );
  return { ...state, ball: { ...ball, trail } };
}

/** Whether `a` has won against `b` under the win rule. */
export function hasWon(a: number, b: number): boolean {
  return a >= WIN_SCORE && a - b >= WIN_LEAD;
}

/** Scores a ball that has passed a goal, and serves again or ends the match. */
function score(state: CaromState, api: UpdateApi): CaromState {
  const ball = state.ball;
  if (ball === null) return state;
  let scorer: Side;
  if (ball.x - BALL_R > FIELD_W) scorer = "left";
  else if (ball.x + BALL_R < 0) scorer = "right";
  else return state;

  api.audio.play(CUES.score);
  const scoreBoard =
    scorer === "left"
      ? { p1: state.score.p1 + 1, p2: state.score.p2 }
      : { p1: state.score.p1, p2: state.score.p2 + 1 };
  const won =
    scorer === "left"
      ? hasWon(scoreBoard.p1, scoreBoard.p2)
      : hasWon(scoreBoard.p2, scoreBoard.p1);

  if (won) {
    const screen: Screen = "matchover";
    return {
      ...state,
      score: scoreBoard,
      winner: scorer,
      screen,
      menuIndex: 0,
    };
  }
  return {
    ...state,
    score: scoreBoard,
    ball: parkedBall(),
    receiver: scorer === "left" ? "right" : "left",
    screen: "countdown",
  };
}

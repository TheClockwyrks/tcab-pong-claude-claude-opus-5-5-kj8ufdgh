// Carom — the game: the state it holds, the debug surface that poses and reads
// that state, and the three functions the engine drives.
//
// The state is a value. `update` builds the next state from the current one,
// `render` draws it, and the debug surface poses it in the same shape. The work
// itself lives in the modules beside this one:
//
//   state.ts    the title-screen state, parking the ball, starting a match
//   physics.ts  paddle integration and the ball's sub-stepped flight
//   ai.ts       the Solo opponent
//   menus.ts    the menu items and their hit regions
//   update.ts   one frame's transition
//   render.ts   drawing a state
//   debug.ts    the debug and automation surface
//   audio.ts    the cue definitions

import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { ACTIONS, BINDINGS } from "./constants";
import { defineCues } from "./audio";
import { createDebugApi, registerDiagnostics } from "./debug";
import { renderGame } from "./render";
import { titleState } from "./state";
import { updateGame } from "./update";

// ---- The state (specs/state.md) -------------------------------------------

export type Screen =
  "title" | "howto" | "countdown" | "playing" | "paused" | "matchover";

export type Mode = "solo" | "versus";

export type Side = "left" | "right";

export interface PaddleState {
  readonly cy: number;
  readonly vy: number;
  readonly driven: boolean;
  readonly drivenVy: number;
}

export interface AiState {
  readonly tracking: boolean;
  readonly movement: boolean;
}

export interface TrailSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface ObstacleState {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
}

/**
 * A pointer or touch contact that went down on a menu and has not lifted yet:
 * which pointer, the screen it went down on, and the item it landed on (`-1`
 * outside every item). A confirm needs its release inside the same item.
 */
export interface MenuPress {
  readonly id: number;
  readonly screen: Screen;
  readonly item: number;
}

export interface CaromState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";

  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;

  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: AiState;

  readonly receiver: Side;
  readonly ball: BallState | null;
  readonly obstacles: readonly ObstacleState[];

  readonly simTime: number;
  readonly muted: boolean;

  /**
   * Added beside the declared fields: the menu presses in progress. It is
   * input bookkeeping rather than game state, emptied by every reset and by
   * every screen that shows no menu, and no snapshot reports it.
   */
  readonly presses: readonly MenuPress[];
}

// ---- The debug surface (specs/instrumentation.md) -------------------------

export interface MenuItemRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PaddleSnapshot {
  cy: number;
  vy: number;
  drivenVy: number;
  driven: boolean;
}

export interface BallSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  spin: number;
  held: boolean;
  holdTimer: number;
  serveSign: 1 | -1;
  trail: { x: number; y: number; t: number }[];
}

export interface CaromSnapshot {
  version: number;
  screen: Screen;
  mode: Mode;
  menuIndex: number;
  titleIndex: number;
  resumeScreen: "countdown" | "playing";
  score: { p1: number; p2: number };
  winner: Side | null;
  muted: boolean;
  paddles: { left: PaddleSnapshot; right: PaddleSnapshot };
  ai: { tracking: boolean; movement: boolean };
  receiver: Side;
  ball: BallSnapshot | null;
  obstacles: { index: number; cx: number; cy: number }[];
  simTime: number;
}

type View = DeepReadonly<CaromState>;

export interface CaromDebugApi {
  readonly version: number;

  clearWorld(state: View): CaromState;
  spawnBall(state: View): CaromState;
  spawnObstacle(state: View, index: number): CaromState;
  reset(state: View): CaromState;
  reconcile(state: View): CaromState;

  setScreen(state: View, screen: Screen): CaromState;
  setMode(state: View, mode: Mode): CaromState;
  setMenuIndex(state: View, index: number): CaromState;
  setTitleIndex(state: View, index: number): CaromState;
  setResumeScreen(state: View, screen: "countdown" | "playing"): CaromState;

  setScore(state: View, p1: number, p2: number): CaromState;
  setWinner(state: View, side: Side | null): CaromState;
  setReceiver(state: View, side: Side): CaromState;

  setPaddleCy(state: View, side: Side, cy: number): CaromState;
  setPaddleVy(state: View, side: Side, vy: number): CaromState;
  setPaddleDriven(state: View, side: Side, driven: boolean): CaromState;

  setBallPosition(state: View, x: number, y: number): CaromState;
  setBallVelocity(state: View, vx: number, vy: number): CaromState;
  setBallSpin(state: View, spin: number): CaromState;
  setBallHeld(state: View, held: boolean): CaromState;
  setBallHoldTimer(state: View, seconds: number): CaromState;
  setBallServeSign(state: View, sign: 1 | -1): CaromState;
  drawBallServeSign(state: View): CaromState;

  setAiTracking(state: View, enabled: boolean): CaromState;
  setAiMovement(state: View, enabled: boolean): CaromState;

  setMuted(state: View, muted: boolean): CaromState;

  snapshot(state: View): CaromSnapshot;
  menuItemRect(state: View, index: number): MenuItemRect | null;
}

// ---- The game ---------------------------------------------------------------

/** The field background, which the letterbox bars are cleared to as well. */
export const BACKGROUND = "#070b16";

export const game: Game<CaromState, CaromDebugApi> = {
  initialize(api: InitApi<CaromState>): [CaromState, CaromDebugApi] {
    for (const name of ACTIONS) {
      api.input.register(name, { keys: [...BINDINGS[name]] });
    }
    defineCues(api);
    registerDiagnostics(api);
    // The runtime's mute bit starts clear and the game is the only thing that
    // sets it, so the opening copy of it is `false`.
    return [titleState(false), createDebugApi()];
  },

  update(state: View, api: UpdateApi, dt: number): CaromState {
    return updateGame(state, api, dt);
  },

  render(state: View, api: RenderApi): void {
    renderGame(state, api.ctx);
  },
};

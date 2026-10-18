// The debug and automation surface (specs/instrumentation.md), and the
// diagnostic sources the engine's overlay shows. Every pose is a transition
// from the state it is handed to the next one, and every reading is pure.

import type { InitApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { CAROM_DEBUG_VERSION, OBSTACLE_CENTERS } from "./constants";
import type {
  BallState,
  CaromDebugApi,
  CaromSnapshot,
  CaromState,
  Mode,
  PaddleState,
  Screen,
  Side,
} from "./game";
import { itemRect } from "./menus";
import {
  drawServeSign,
  obstacleAt,
  parkedBall,
  thaw,
  titleState,
} from "./state";

type View = DeepReadonly<CaromState>;

const SCREENS: readonly Screen[] = [
  "title",
  "howto",
  "countdown",
  "playing",
  "paused",
  "matchover",
];

// ---- Argument checks: a pose fails loudly rather than refusing quietly ------

function fail(operation: string, message: string): never {
  throw new Error(`Carom debug: ${operation}: ${message}`);
}

function finite(operation: string, name: string, value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(operation, `${name} must be a finite number, got ${String(value)}`);
  }
  return value;
}

function flag(operation: string, value: boolean): boolean {
  if (typeof value !== "boolean") {
    fail(operation, `expected a boolean, got ${String(value)}`);
  }
  return value;
}

function side(operation: string, value: Side): Side {
  if (value !== "left" && value !== "right") {
    fail(operation, `side must be "left" or "right", got ${String(value)}`);
  }
  return value;
}

function screen(operation: string, value: Screen): Screen {
  if (!SCREENS.includes(value)) {
    fail(operation, `no screen is named ${String(value)}`);
  }
  return value;
}

function mode(operation: string, value: Mode): Mode {
  if (value !== "solo" && value !== "versus") {
    fail(operation, `mode must be "solo" or "versus", got ${String(value)}`);
  }
  return value;
}

function index(operation: string, value: number): number {
  if (!Number.isInteger(value)) {
    fail(operation, `index must be an integer, got ${String(value)}`);
  }
  return value;
}

// ---- Shared pieces of the poses ----------------------------------------------

/** The next state with one paddle changed. */
function withPaddle(
  state: View,
  which: Side,
  change: (paddle: DeepReadonly<PaddleState>) => PaddleState,
): CaromState {
  const paddles = { ...state.paddles, [which]: change(state.paddles[which]) };
  return { ...thaw(state), paddles };
}

/** The next state with the ball changed; the ball must be on the field. */
function withBall(
  state: View,
  operation: string,
  change: (ball: DeepReadonly<BallState>) => BallState,
): CaromState {
  if (state.ball === null) fail(operation, "there is no ball on the field");
  return { ...thaw(state), ball: change(state.ball) };
}

// ---- The surface ---------------------------------------------------------------

export function snapshot(state: View): CaromSnapshot {
  const paddle = (p: DeepReadonly<PaddleState>) => ({
    cy: p.cy,
    vy: p.vy,
    drivenVy: p.drivenVy,
    driven: p.driven,
  });
  const ball = state.ball;
  return {
    version: CAROM_DEBUG_VERSION,
    screen: state.screen,
    mode: state.mode,
    menuIndex: state.menuIndex,
    titleIndex: state.titleIndex,
    resumeScreen: state.resumeScreen,
    score: { p1: state.score.p1, p2: state.score.p2 },
    winner: state.winner,
    muted: state.muted,
    paddles: {
      left: paddle(state.paddles.left),
      right: paddle(state.paddles.right),
    },
    ai: { tracking: state.ai.tracking, movement: state.ai.movement },
    receiver: state.receiver,
    ball:
      ball === null
        ? null
        : {
            x: ball.x,
            y: ball.y,
            vx: ball.vx,
            vy: ball.vy,
            speed: Math.hypot(ball.vx, ball.vy),
            spin: ball.spin,
            held: ball.held,
            holdTimer: ball.holdTimer,
            serveSign: ball.serveSign,
            trail: ball.trail.map((s) => ({ x: s.x, y: s.y, t: s.t })),
          },
    obstacles: state.obstacles.map((o) => ({
      index: o.index,
      cx: o.cx,
      cy: o.cy,
    })),
    simTime: state.simTime,
  };
}

export function createDebugApi(): CaromDebugApi {
  return {
    version: CAROM_DEBUG_VERSION,

    // The world.
    clearWorld: (s) => ({ ...thaw(s), ball: null, obstacles: [] }),
    spawnBall: (s) => ({ ...thaw(s), ball: parkedBall() }),
    spawnObstacle: (s, i) => {
      index("spawnObstacle", i);
      if (i < 0 || i >= OBSTACLE_CENTERS.length) {
        fail("spawnObstacle", `no obstacle has index ${i}`);
      }
      const obstacles = [
        ...s.obstacles.filter((o) => o.index !== i),
        obstacleAt(i),
      ].sort((a, b) => a.index - b.index);
      return { ...thaw(s), obstacles };
    },
    reset: (s) => titleState(s.muted),
    // Ball speed is worked out at every read, so there is no stored copy to
    // bring back into agreement.
    reconcile: (s) => thaw(s),

    // Screens and menus.
    setScreen: (s, v) => ({ ...thaw(s), screen: screen("setScreen", v) }),
    setMode: (s, v) => ({ ...thaw(s), mode: mode("setMode", v) }),
    setMenuIndex: (s, v) => ({
      ...thaw(s),
      menuIndex: index("setMenuIndex", v),
    }),
    setTitleIndex: (s, v) => ({
      ...thaw(s),
      titleIndex: index("setTitleIndex", v),
    }),
    setResumeScreen: (s, v) => {
      if (v !== "countdown" && v !== "playing") {
        fail("setResumeScreen", `cannot resume to ${String(v)}`);
      }
      return { ...thaw(s), resumeScreen: v };
    },

    // Match state.
    setScore: (s, p1, p2) => ({
      ...thaw(s),
      score: {
        p1: finite("setScore", "p1", p1),
        p2: finite("setScore", "p2", p2),
      },
    }),
    setWinner: (s, v) => ({
      ...thaw(s),
      winner: v === null ? null : side("setWinner", v),
    }),
    setReceiver: (s, v) => ({ ...thaw(s), receiver: side("setReceiver", v) }),

    // Paddles.
    setPaddleCy: (s, which, cy) =>
      withPaddle(s, side("setPaddleCy", which), (p) => ({
        ...p,
        cy: finite("setPaddleCy", "cy", cy),
      })),
    setPaddleVy: (s, which, vy) =>
      withPaddle(s, side("setPaddleVy", which), (p) => ({
        ...p,
        drivenVy: finite("setPaddleVy", "vy", vy),
      })),
    setPaddleDriven: (s, which, driven) =>
      withPaddle(s, side("setPaddleDriven", which), (p) => ({
        ...p,
        driven: flag("setPaddleDriven", driven),
      })),

    // The ball.
    setBallPosition: (s, x, y) =>
      withBall(s, "setBallPosition", (b) => ({
        ...b,
        x: finite("setBallPosition", "x", x),
        y: finite("setBallPosition", "y", y),
      })),
    setBallVelocity: (s, vx, vy) =>
      withBall(s, "setBallVelocity", (b) => ({
        ...b,
        vx: finite("setBallVelocity", "vx", vx),
        vy: finite("setBallVelocity", "vy", vy),
      })),
    setBallSpin: (s, spin) =>
      withBall(s, "setBallSpin", (b) => ({
        ...b,
        spin: finite("setBallSpin", "spin", spin),
      })),
    setBallHeld: (s, held) =>
      withBall(s, "setBallHeld", (b) => ({
        ...b,
        held: flag("setBallHeld", held),
      })),
    setBallHoldTimer: (s, seconds) =>
      withBall(s, "setBallHoldTimer", (b) => ({
        ...b,
        holdTimer: finite("setBallHoldTimer", "seconds", seconds),
      })),
    setBallServeSign: (s, sign) =>
      withBall(s, "setBallServeSign", (b) => {
        if (sign !== 1 && sign !== -1) {
          fail("setBallServeSign", `sign must be 1 or -1, got ${String(sign)}`);
        }
        return { ...b, serveSign: sign };
      }),
    drawBallServeSign: (s) =>
      withBall(s, "drawBallServeSign", (b) => ({
        ...b,
        serveSign: drawServeSign(),
      })),

    // The AI opponent.
    setAiTracking: (s, enabled) => ({
      ...thaw(s),
      ai: { ...s.ai, tracking: flag("setAiTracking", enabled) },
    }),
    setAiMovement: (s, enabled) => ({
      ...thaw(s),
      ai: { ...s.ai, movement: flag("setAiMovement", enabled) },
    }),

    // Audio: the next update hands this bit to the runtime before anything
    // plays, exactly where the `mute` action toggles it.
    setMuted: (s, muted) => ({ ...thaw(s), muted: flag("setMuted", muted) }),

    // Readings.
    snapshot,
    menuItemRect: (s, i) => itemRect(s.screen, i),
  };
}

/** Registers the values the overlay shows, each a pure read of the state. */
export function registerDiagnostics(api: InitApi<CaromState>): void {
  const d = api.diagnostics;
  const fixed = (n: number) => n.toFixed(1);
  d.register("screen", (s) => s.screen);
  d.register("mode", (s) => s.mode);
  d.register("score", (s) => `${s.score.p1} - ${s.score.p2}`);
  d.register("ball pos", (s) =>
    s.ball === null ? "none" : `${fixed(s.ball.x)}, ${fixed(s.ball.y)}`,
  );
  d.register("ball vel", (s) =>
    s.ball === null ? "none" : `${fixed(s.ball.vx)}, ${fixed(s.ball.vy)}`,
  );
  d.register("ball speed", (s) =>
    s.ball === null ? "none" : fixed(Math.hypot(s.ball.vx, s.ball.vy)),
  );
  d.register("ball spin", (s) =>
    s.ball === null ? "none" : fixed(s.ball.spin),
  );
  d.register(
    "left paddle",
    (s) =>
      `cy ${fixed(s.paddles.left.cy)}  vy ${fixed(s.paddles.left.vy)}` +
      (s.paddles.left.driven ? "  driven" : ""),
  );
  d.register(
    "right paddle",
    (s) =>
      `cy ${fixed(s.paddles.right.cy)}  vy ${fixed(s.paddles.right.vy)}` +
      (s.paddles.right.driven ? "  driven" : ""),
  );
}

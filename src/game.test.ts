import { describe, expect, it } from "vitest";
import {
  CAROM_DEBUG_VERSION,
  CUES,
  FIELD_CX,
  FIELD_CY,
  HOLD_TIME,
  OBSTACLE_CENTERS,
  P2_X0,
  PADDLE_MIN_CY,
  PADDLE_SPEED,
  SERVE_ANGLE,
  SERVE_SPEED,
  TRAIL_TIME,
} from "./constants";
import type { CaromSnapshot } from "./game";
import { boot } from "./harness";
import type { Harness } from "./harness";

const STEP = 1 / 60;

function snap(h: Harness): CaromSnapshot {
  return h.debug.snapshot(h.engine.state);
}

/** Taps a key and runs the frame that reads it. */
async function press(h: Harness, code: string): Promise<void> {
  h.tap(code);
  await h.engine.advance(1);
}

describe("the opening state", () => {
  it("is the title screen with every field at its title value", async () => {
    const h = await boot();
    const s = snap(h);
    expect(s).toMatchObject({
      version: CAROM_DEBUG_VERSION,
      screen: "title",
      mode: "solo",
      menuIndex: 0,
      titleIndex: 0,
      resumeScreen: "playing",
      score: { p1: 0, p2: 0 },
      winner: null,
      muted: false,
      receiver: "left",
      ai: { tracking: true, movement: true },
      paddles: {
        left: { cy: FIELD_CY, vy: 0, drivenVy: 0, driven: false },
        right: { cy: FIELD_CY, vy: 0, drivenVy: 0, driven: false },
      },
      simTime: 0,
    });
    expect(s.ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      vx: 0,
      vy: 0,
      speed: 0,
      spin: 0,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
    expect([1, -1]).toContain(s.ball?.serveSign);
    expect(s.obstacles).toEqual(
      OBSTACLE_CENTERS.map((c, index) => ({ index, cx: c.x, cy: c.y })),
    );
  });

  it("registers the eight actions' diagnostics and advances nothing on the title", async () => {
    const h = await boot();
    await h.engine.advance(30);
    const s = snap(h);
    expect(s.screen).toBe("title");
    expect(s.simTime).toBeCloseTo(30 * STEP);
    expect(s.ball?.holdTimer).toBe(HOLD_TIME);
    const names = h.engine.diagnostics().map((d) => d.name);
    expect(names).toEqual(
      expect.arrayContaining(["screen", "mode", "score", "ball speed"]),
    );
    expect(h.engine.diagnostics().every((d) => d.error === undefined)).toBe(
      true,
    );
    h.engine.apply((st) => h.debug.clearWorld(st));
    expect(
      h.engine.diagnostics().find((d) => d.name === "ball pos")?.value,
    ).toBe("none");
  });
});

describe("title menu", () => {
  it("wraps with the movement keys and moves up before down", async () => {
    const h = await boot();
    await press(h, "KeyW");
    expect(snap(h).menuIndex).toBe(2);
    await press(h, "ArrowDown");
    expect(snap(h).menuIndex).toBe(0);
    h.tap("KeyW");
    h.tap("KeyS");
    await h.engine.advance(1);
    expect(snap(h).menuIndex).toBe(2);
  });

  it("moves rather than confirms when both arrive on one frame", async () => {
    const h = await boot();
    h.tap("KeyS");
    h.tap("Enter");
    await h.engine.advance(1);
    expect(snap(h)).toMatchObject({ screen: "title", menuIndex: 1 });
  });

  it("starts a Versus match and remembers the selection", async () => {
    const h = await boot();
    await press(h, "KeyS");
    await press(h, "Space");
    const s = snap(h);
    expect(s).toMatchObject({
      screen: "countdown",
      mode: "versus",
      titleIndex: 1,
      menuIndex: 0,
      resumeScreen: "playing",
      receiver: "left",
    });
    expect(s.ball?.held).toBe(true);
  });

  it("opens how-to and returns to the remembered item", async () => {
    const h = await boot();
    await press(h, "ArrowUp");
    await press(h, "Enter");
    expect(snap(h)).toMatchObject({
      screen: "howto",
      menuIndex: 0,
      titleIndex: 2,
    });
    await press(h, "Escape");
    expect(snap(h)).toMatchObject({ screen: "title", menuIndex: 2 });
    await press(h, "Enter");
    await press(h, "Enter");
    expect(snap(h)).toMatchObject({ screen: "title", menuIndex: 2 });
  });

  it("ignores back on the title", async () => {
    const h = await boot();
    await press(h, "Escape");
    expect(snap(h).screen).toBe("title");
  });
});

describe("a match", () => {
  it("serves toward player one after the hold, at the serve angle", async () => {
    const h = await boot();
    await press(h, "Enter");
    h.engine.apply((s) => h.debug.setBallServeSign(s, -1));
    await h.engine.advance(Math.ceil(HOLD_TIME / STEP) + 2);
    const s = snap(h);
    expect(s.screen).toBe("playing");
    expect(s.ball?.held).toBe(false);
    expect(s.ball?.holdTimer).toBe(0);
    expect(s.ball?.speed).toBeCloseTo(SERVE_SPEED);
    expect(s.ball?.vx).toBeCloseTo(-SERVE_SPEED * Math.cos(SERVE_ANGLE));
    expect(s.ball?.vy).toBeCloseTo(-SERVE_SPEED * Math.sin(SERVE_ANGLE));
    expect(s.ball?.serveSign).toBe(-1);
  });

  it("serves on the frame the hold runs out, without advancing the ball", async () => {
    const h = await boot();
    h.engine.apply((s) => h.debug.setScreen(s, "countdown"));
    h.engine.apply((s) => h.debug.setReceiver(s, "right"));
    h.engine.apply((s) => h.debug.setBallHoldTimer(s, 0));
    await h.engine.advance(1);
    const s = snap(h);
    expect(s.screen).toBe("playing");
    expect(s.ball?.x).toBe(FIELD_CX);
    expect(s.ball?.vx).toBeGreaterThan(0);
  });

  it("moves the human paddle during the countdown and keeps the trail short", async () => {
    const h = await boot();
    await press(h, "Enter");
    h.key("ArrowUp", true);
    await h.engine.advance(10);
    h.key("ArrowUp", false);
    const s = snap(h);
    expect(s.paddles.left.cy).toBeCloseTo(FIELD_CY - 10 * STEP * PADDLE_SPEED);
    expect(s.paddles.right.cy).toBe(FIELD_CY);
    await h.engine.advance(80);
    const t = snap(h);
    const trail = t.ball?.trail ?? [];
    expect(trail.length).toBeGreaterThan(2);
    expect(t.simTime - trail[0].t).toBeLessThanOrEqual(TRAIL_TIME + 1e-9);
  });

  it("moves each paddle from its own keys in Versus", async () => {
    const h = await boot();
    await press(h, "KeyS");
    await press(h, "Enter");
    h.key("KeyS", true);
    h.key("ArrowUp", true);
    await h.engine.advance(5);
    const s = snap(h);
    expect(s.paddles.left.vy).toBe(PADDLE_SPEED);
    expect(s.paddles.right.vy).toBe(-PADDLE_SPEED);
  });

  it("scores, re-serves toward the side scored on, and plays the cue", async () => {
    const h = await boot();
    await press(h, "Enter");
    h.engine.apply((s) => h.debug.setScreen(s, "playing"));
    h.engine.apply((s) => h.debug.setBallHeld(s, false));
    h.engine.apply((s) => h.debug.setBallPosition(s, 1290, 100));
    h.engine.apply((s) => h.debug.setBallVelocity(s, 600, 0));
    await h.engine.advance(2);
    const s = snap(h);
    expect(s.score).toEqual({ p1: 1, p2: 0 });
    expect(s.screen).toBe("countdown");
    expect(s.receiver).toBe("right");
    expect(s.ball).toMatchObject({ x: FIELD_CX, y: FIELD_CY, held: true });
    expect(h.cues).toContain(CUES.score);
  });

  it("ends at eleven with a two-point lead, and plays on at ten all", async () => {
    const h = await boot();
    await press(h, "Enter");
    const score = async (side: "left" | "right") => {
      h.engine.apply((s) => h.debug.setScreen(s, "playing"));
      h.engine.apply((s) => h.debug.setBallHeld(s, false));
      h.engine.apply((s) =>
        h.debug.setBallPosition(s, side === "left" ? 1300 : -20, 100),
      );
      h.engine.apply((s) =>
        h.debug.setBallVelocity(s, side === "left" ? 100 : -100, 0),
      );
      await h.engine.advance(1);
    };
    h.engine.apply((s) => h.debug.setScore(s, 10, 10));
    await score("left");
    expect(snap(h)).toMatchObject({ screen: "countdown", winner: null });
    await score("right");
    await score("right");
    expect(snap(h)).toMatchObject({ screen: "countdown", winner: null });
    await score("right");
    const s = snap(h);
    expect(s).toMatchObject({
      screen: "matchover",
      winner: "right",
      score: { p1: 11, p2: 13 },
      menuIndex: 0,
    });
    expect(s.ball?.x).toBeLessThan(0);

    await press(h, "KeyS");
    await press(h, "Enter");
    expect(snap(h)).toMatchObject({ screen: "title", menuIndex: 0 });
  });

  it("plays again in the same mode from match over", async () => {
    const h = await boot();
    h.engine.apply((s) => h.debug.setMode(s, "versus"));
    h.engine.apply((s) => h.debug.setScreen(s, "matchover"));
    h.engine.apply((s) => h.debug.setScore(s, 11, 3));
    h.engine.apply((s) => h.debug.setWinner(s, "left"));
    await press(h, "Enter");
    expect(snap(h)).toMatchObject({
      screen: "countdown",
      mode: "versus",
      score: { p1: 0, p2: 0 },
      winner: null,
    });
  });

  it("returns to the title with back on match over", async () => {
    const h = await boot();
    h.engine.apply((s) => h.debug.setTitleIndex(s, 1));
    h.engine.apply((s) => h.debug.setScreen(s, "matchover"));
    h.engine.apply((s) => h.debug.setScore(s, 11, 3));
    await press(h, "Escape");
    expect(snap(h)).toMatchObject({
      screen: "title",
      menuIndex: 1,
      titleIndex: 1,
      score: { p1: 0, p2: 0 },
    });
  });
});

describe("pausing", () => {
  it("opens with one Escape and resumes with the next", async () => {
    const h = await boot();
    await press(h, "Enter");
    await press(h, "Escape");
    expect(snap(h)).toMatchObject({
      screen: "paused",
      resumeScreen: "countdown",
      menuIndex: 0,
    });
    const held = snap(h);
    await h.engine.advance(30);
    expect(snap(h).ball?.holdTimer).toBe(held.ball?.holdTimer);
    await press(h, "Escape");
    expect(snap(h).screen).toBe("countdown");
  });

  it("restarts and quits from its menu", async () => {
    const h = await boot();
    await press(h, "Enter");
    h.engine.apply((s) => h.debug.setScore(s, 4, 2));
    await press(h, "KeyP");
    await press(h, "ArrowDown");
    await press(h, "Enter");
    expect(snap(h)).toMatchObject({
      screen: "countdown",
      score: { p1: 0, p2: 0 },
    });
    await press(h, "KeyP");
    await press(h, "KeyW");
    expect(snap(h).menuIndex).toBe(2);
    await press(h, "Enter");
    expect(snap(h)).toMatchObject({ screen: "title", menuIndex: 0 });
  });

  it("resumes to playing from the RESUME item", async () => {
    const h = await boot();
    h.engine.apply((s) => h.debug.setScreen(s, "paused"));
    await press(h, "Enter");
    expect(snap(h).screen).toBe("playing");
  });
});

describe("pointer and touch", () => {
  const center = (h: Harness, index: number) => {
    const r = h.debug.menuItemRect(h.engine.state, index);
    if (r === null) throw new Error(`no item ${index}`);
    return [r.x + r.w / 2, r.y + r.h / 2] as const;
  };

  it("hovers to select and confirms a press released in the same item", async () => {
    const h = await boot();
    const [x, y] = center(h, 1);
    h.pointer("pointermove", x, y);
    await h.engine.advance(1);
    expect(snap(h).menuIndex).toBe(1);
    h.pointer("pointerdown", x, y);
    await h.engine.advance(1);
    h.pointer("pointerup", x, y);
    await h.engine.advance(1);
    expect(snap(h)).toMatchObject({
      screen: "countdown",
      mode: "versus",
      titleIndex: 1,
    });
  });

  it("confirms nothing when press and release fall in different items", async () => {
    const h = await boot();
    const [x0, y0] = center(h, 0);
    const [x2, y2] = center(h, 2);
    h.pointer("pointerdown", x0, y0);
    await h.engine.advance(1);
    h.pointer("pointermove", x2, y2);
    h.pointer("pointerup", x2, y2);
    await h.engine.advance(1);
    expect(snap(h)).toMatchObject({ screen: "title", menuIndex: 2 });
  });

  it("confirms nothing when the press lands outside every item", async () => {
    const h = await boot();
    const [x, y] = center(h, 0);
    h.pointer("pointerdown", 20, 20);
    h.pointer("pointermove", x, y);
    h.pointer("pointerup", x, y);
    await h.engine.advance(1);
    expect(snap(h)).toMatchObject({ screen: "title", menuIndex: 0 });
  });

  it("confirms a touch that lands and lifts in one item", async () => {
    const h = await boot();
    h.engine.apply((s) => h.debug.setScreen(s, "paused"));
    const [x, y] = center(h, 2);
    h.pointer("pointerdown", x, y, { id: 7, device: "touch" });
    h.pointer("pointerup", x, y, { id: 7, device: "touch" });
    await h.engine.advance(1);
    expect(snap(h).screen).toBe("title");
  });

  it("lets the keyboard confirm win over a pointer confirm on one frame", async () => {
    const h = await boot();
    const [x, y] = center(h, 1);
    h.tap("Enter");
    h.pointer("pointerdown", x, y);
    h.pointer("pointerup", x, y);
    await h.engine.advance(1);
    expect(snap(h)).toMatchObject({ screen: "countdown", mode: "solo" });
  });

  it("leaves the pointer's item after a keyboard move on the same frame", async () => {
    const h = await boot();
    const [x, y] = center(h, 2);
    h.tap("KeyS");
    h.pointer("pointermove", x, y);
    await h.engine.advance(1);
    expect(snap(h).menuIndex).toBe(2);
  });

  it("returns from how-to with a click", async () => {
    const h = await boot();
    h.engine.apply((s) => h.debug.setScreen(s, "howto"));
    const [x, y] = center(h, 0);
    h.pointer("pointerdown", x, y);
    h.pointer("pointerup", x, y);
    await h.engine.advance(1);
    expect(snap(h).screen).toBe("title");
  });

  it("drops a press when a screen without a menu comes up", async () => {
    const h = await boot();
    const [x, y] = center(h, 0);
    h.pointer("pointerdown", x, y);
    await h.engine.advance(1);
    await press(h, "Enter");
    await h.engine.advance(1);
    expect(h.engine.state.presses).toEqual([]);
  });
});

describe("audio", () => {
  it("toggles mute from any screen and mirrors it into the state", async () => {
    const h = await boot();
    await press(h, "KeyM");
    expect(snap(h).muted).toBe(true);
    await press(h, "Enter");
    await press(h, "KeyM");
    expect(snap(h).muted).toBe(false);
  });

  it("plays each contact's cue once per frame", async () => {
    const h = await boot();
    h.engine.apply((s) => h.debug.setScreen(s, "playing"));
    h.engine.apply((s) => h.debug.setBallHeld(s, false));
    h.engine.apply((s) => h.debug.setBallPosition(s, P2_X0 - 14, FIELD_CY));
    h.engine.apply((s) => h.debug.setBallVelocity(s, 900, 0));
    await h.engine.advance(1);
    expect(h.cues).toEqual([CUES.paddleHit]);
    h.engine.apply((s) => h.debug.setBallPosition(s, 300, 15));
    h.engine.apply((s) => h.debug.setBallVelocity(s, 0, -900));
    await h.engine.advance(1);
    expect(h.cues).toEqual([CUES.paddleHit, CUES.wallBounce]);
    h.engine.apply((s) => h.debug.setBallPosition(s, 470, 220));
    h.engine.apply((s) => h.debug.setBallVelocity(s, 600, 0));
    await h.engine.advance(1);
    expect(h.cues[h.cues.length - 1]).toBe(CUES.obstacleBounce);
  });
});

describe("the Solo AI in play", () => {
  it("tracks a ball heading its way and leaves a frozen paddle alone", async () => {
    const h = await boot();
    h.engine.apply((s) => h.debug.setScreen(s, "playing"));
    h.engine.apply((s) => h.debug.setBallHeld(s, false));
    h.engine.apply((s) => h.debug.setBallPosition(s, 900, 120));
    h.engine.apply((s) => h.debug.setBallVelocity(s, 300, 0));
    await h.engine.advance(20);
    expect(snap(h).paddles.right.cy).toBeLessThan(200);

    h.engine.apply((s) => h.debug.setAiMovement(s, false));
    const before = snap(h).paddles.right.cy;
    await h.engine.advance(5);
    expect(snap(h).paddles.right).toMatchObject({ cy: before, vy: 0 });
  });
});

describe("delta-time independence", () => {
  async function rally(stepMs: number) {
    const h = await boot(stepMs);
    h.engine.apply((s) => h.debug.setMode(s, "versus"));
    h.engine.apply((s) => h.debug.setScreen(s, "playing"));
    h.engine.apply((s) => h.debug.setBallHeld(s, false));
    h.engine.apply((s) => h.debug.setBallPosition(s, 400, 500));
    h.engine.apply((s) => h.debug.setBallVelocity(s, -500, -60));
    h.engine.apply((s) => h.debug.setBallSpin(s, 200));
    h.engine.apply((s) => h.debug.setPaddleDriven(s, "left", true));
    h.engine.apply((s) => h.debug.setPaddleVy(s, "left", -100));
    const frames = Math.round(2500 / stepMs);
    await h.engine.advance(frames);
    return { snap: snap(h), cues: h.cues };
  }

  it("reaches the same contacts and points at 2 ms and 16 ms", async () => {
    const fine = await rally(2);
    const coarse = await rally(16);
    expect(coarse.cues).toEqual(fine.cues);
    expect(coarse.snap.score).toEqual(fine.snap.score);
    expect(
      Math.abs((coarse.snap.ball?.speed ?? 0) - (fine.snap.ball?.speed ?? 0)),
    ).toBeLessThan(10);
    expect(Math.sign(coarse.snap.ball?.vx ?? 0)).toBe(
      Math.sign(fine.snap.ball?.vx ?? 0),
    );
  });
});

describe("the driven paddle", () => {
  it("moves at drivenVy and ignores the keys", async () => {
    const h = await boot();
    await press(h, "Enter");
    h.engine.apply((s) => h.debug.setPaddleVy(s, "left", -300));
    expect(snap(h).paddles.left).toMatchObject({ vy: 0, drivenVy: -300 });
    h.engine.apply((s) => h.debug.setPaddleDriven(s, "left", true));
    h.key("KeyS", true);
    await h.engine.advance(90);
    const s = snap(h);
    expect(s.paddles.left.cy).toBe(PADDLE_MIN_CY);
    expect(s.paddles.left.vy).toBe(0);
    expect(s.paddles.left.drivenVy).toBe(-300);
  });
});

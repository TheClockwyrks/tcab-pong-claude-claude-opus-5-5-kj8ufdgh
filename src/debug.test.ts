import { describe, expect, it } from "vitest";
import { FIELD_CX, FIELD_CY, HOLD_TIME, OBSTACLE_CENTERS } from "./constants";
import type { CaromDebugApi, CaromState, Screen } from "./game";
import { boot } from "./harness";
import { titleState } from "./state";

const SCREENS: Screen[] = [
  "title",
  "howto",
  "countdown",
  "playing",
  "paused",
  "matchover",
];

async function surface() {
  const h = await boot();
  const pose = (t: (s: CaromState) => CaromState) =>
    h.engine.apply((s) => t(s as CaromState));
  const read = () => h.debug.snapshot(h.engine.state);
  return { h, d: h.debug as CaromDebugApi, pose, read };
}

describe("the world", () => {
  it("clears and respawns the ball and the obstacles", async () => {
    const { d, pose, read } = await surface();
    pose((s) => d.clearWorld(s));
    expect(read().ball).toBeNull();
    expect(read().obstacles).toEqual([]);
    pose((s) => d.spawnObstacle(s, 1));
    pose((s) => d.spawnObstacle(s, 0));
    pose((s) => d.spawnObstacle(s, 1));
    expect(read().obstacles).toEqual(
      OBSTACLE_CENTERS.map((c, index) => ({ index, cx: c.x, cy: c.y })),
    );
    pose((s) => d.spawnBall(s));
    expect(read().ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
  });

  it("fails loudly on what it has nothing to act on", async () => {
    const { d, h } = await surface();
    const s = h.engine.state;
    expect(() => d.spawnObstacle(s, 2)).toThrow(/obstacle/);
    expect(() => d.spawnObstacle(s, 0.5)).toThrow();
    const empty = d.clearWorld(s);
    expect(() => d.setBallPosition(empty, 1, 2)).toThrow(/no ball/);
    expect(() => d.setBallVelocity(empty, 1, 2)).toThrow();
    expect(() => d.setBallSpin(empty, 1)).toThrow();
    expect(() => d.setBallHeld(empty, true)).toThrow();
    expect(() => d.setBallHoldTimer(empty, 1)).toThrow();
    expect(() => d.setBallServeSign(empty, 1)).toThrow();
    expect(() => d.drawBallServeSign(empty)).toThrow();
    expect(() => d.setScreen(s, "nowhere" as Screen)).toThrow();
    expect(() => d.setMode(s, "duel" as "solo")).toThrow();
    expect(() => d.setResumeScreen(s, "title" as "playing")).toThrow();
    expect(() => d.setPaddleCy(s, "up" as "left", 3)).toThrow();
    expect(() => d.setScore(s, NaN, 0)).toThrow();
    expect(() => d.setBallServeSign(s, 0 as 1)).toThrow();
    expect(() => d.setMuted(s, "yes" as unknown as boolean)).toThrow();
    expect(() => d.setMenuIndex(s, 1.5)).toThrow();
  });

  it("leaves the state it was handed as it was", async () => {
    const { d, h } = await surface();
    const before = h.engine.state;
    const copy = JSON.stringify(before);
    d.setScore(before, 3, 4);
    d.clearWorld(before);
    d.setPaddleCy(before, "left", 100);
    expect(JSON.stringify(before)).toBe(copy);
  });
});

describe("poses", () => {
  it("set each field and read back through the snapshot", async () => {
    const { d, pose, read } = await surface();
    for (const screen of SCREENS) {
      pose((s) => d.setScreen(s, screen));
      expect(read().screen).toBe(screen);
    }
    pose((s) => d.setMode(s, "versus"));
    pose((s) => d.setMenuIndex(s, 2));
    pose((s) => d.setTitleIndex(s, 1));
    pose((s) => d.setResumeScreen(s, "countdown"));
    pose((s) => d.setScore(s, 7, 9));
    pose((s) => d.setWinner(s, "left"));
    pose((s) => d.setReceiver(s, "right"));
    pose((s) => d.setPaddleCy(s, "right", 20));
    pose((s) => d.setPaddleVy(s, "right", 250));
    pose((s) => d.setPaddleDriven(s, "right", true));
    pose((s) => d.setBallPosition(s, 100, 200));
    pose((s) => d.setBallVelocity(s, 300, 400));
    pose((s) => d.setBallSpin(s, -120));
    pose((s) => d.setBallHeld(s, false));
    pose((s) => d.setBallHoldTimer(s, 0.25));
    pose((s) => d.setBallServeSign(s, -1));
    pose((s) => d.setAiTracking(s, false));
    pose((s) => d.setAiMovement(s, false));
    pose((s) => d.setMuted(s, true));
    expect(read()).toMatchObject({
      mode: "versus",
      menuIndex: 2,
      titleIndex: 1,
      resumeScreen: "countdown",
      score: { p1: 7, p2: 9 },
      winner: "left",
      receiver: "right",
      muted: true,
      paddles: {
        right: { cy: 20, vy: 0, drivenVy: 250, driven: true },
        left: { driven: false },
      },
      ai: { tracking: false, movement: false },
      ball: {
        x: 100,
        y: 200,
        vx: 300,
        vy: 400,
        speed: 500,
        spin: -120,
        held: false,
        holdTimer: 0.25,
        serveSign: -1,
      },
    });
    pose((s) => d.setWinner(s, null));
    expect(read().winner).toBeNull();
  });

  it("draws a serve sign of either value over many draws", async () => {
    const { d, pose, read } = await surface();
    const seen = new Set<number>();
    for (let i = 0; i < 64; i++) {
      pose((s) => d.drawBallServeSign(s));
      seen.add(read().ball?.serveSign ?? 0);
    }
    expect([...seen].sort()).toEqual([-1, 1]);
  });

  it("hands a posed mute bit to the runtime on the next frame", async () => {
    const { h, d, pose, read } = await surface();
    pose((s) => d.setMuted(s, true));
    await h.engine.advance(1);
    expect(read().muted).toBe(true);
    h.tap("KeyM");
    await h.engine.advance(1);
    expect(read().muted).toBe(false);
  });
});

describe("reset and reconcile", () => {
  it("reset restores the title state but keeps the mute bit", async () => {
    const { h, d, pose, read } = await surface();
    pose((s) => d.setMuted(s, true));
    await h.engine.advance(1);
    pose((s) => d.setScore(s, 5, 5));
    pose((s) => d.setPaddleDriven(s, "left", true));
    pose((s) => d.setPaddleVy(s, "left", 99));
    pose((s) => d.clearWorld(s));
    pose((s) => d.setTitleIndex(s, 2));
    pose((s) => d.reset(s));
    const s = read();
    const expected = d.snapshot(titleState(true));
    expect({ ...s, ball: null }).toEqual({ ...expected, ball: null });
    expect(s.ball).toMatchObject({ x: FIELD_CX, held: true, trail: [] });
  });

  it("reconcile changes nothing a reading reports", async () => {
    const { h, d, pose, read } = await surface();
    pose((s) => d.setBallVelocity(s, 30, 40));
    const before = read();
    pose((s) => d.reconcile(d.reconcile(s)));
    expect(read()).toEqual(before);
    expect(read().ball?.speed).toBe(50);
    expect(d.reconcile(h.engine.state)).toEqual(h.engine.state);
  });
});

describe("menuItemRect", () => {
  it("reports regions for the menu shown and null elsewhere", async () => {
    const { d, pose, h } = await surface();
    expect(d.menuItemRect(h.engine.state, 2)).not.toBeNull();
    expect(d.menuItemRect(h.engine.state, 3)).toBeNull();
    pose((s) => d.setScreen(s, "playing"));
    expect(d.menuItemRect(h.engine.state, 0)).toBeNull();
    pose((s) => d.setScreen(s, "howto"));
    expect(d.menuItemRect(h.engine.state, 0)).not.toBeNull();
    expect(d.menuItemRect(h.engine.state, 1)).toBeNull();
  });
});

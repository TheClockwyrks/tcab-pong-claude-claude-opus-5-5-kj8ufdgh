import { describe, expect, it } from "vitest";
import type { CaromState, Screen } from "./game";
import { boot } from "./harness";
import { modeLabel, winnerText } from "./render";
import { titleState } from "./state";

const SCREENS: Screen[] = [
  "title",
  "howto",
  "countdown",
  "playing",
  "paused",
  "matchover",
];

describe("rendering", () => {
  it("draws every screen and records its drawing", async () => {
    const h = await boot();
    h.engine.apply((s) => h.debug.setMuted(s, true));
    h.engine.apply((s) => h.debug.setBallSpin(s, 500));
    h.engine.apply((s) => h.debug.setBallVelocity(s, 300, 100));
    for (const screen of SCREENS) {
      h.engine.apply((s) => h.debug.setScreen(s, screen));
      h.engine.startRecording();
      await h.engine.advance(2);
      const recording = h.engine.stopRecording();
      expect(recording.frames).toHaveLength(2);
      expect(recording.frames[1].ops.length).toBeGreaterThan(10);
    }
    h.engine.apply((s) => h.debug.clearWorld(s));
    h.engine.apply((s) => h.debug.setScreen(s, "countdown"));
    await h.engine.advance(1);
  });

  it("names the mode and the winner", () => {
    const base: CaromState = titleState(false);
    expect(modeLabel(base)).toMatch(/SOLO/);
    expect(modeLabel({ ...base, mode: "versus" })).toMatch(/VERSUS/);
    expect(winnerText(base)).toBe("MATCH OVER");
    expect(winnerText({ ...base, winner: "left" })).toBe("YOU WIN");
    expect(winnerText({ ...base, winner: "right" })).toBe("CPU WINS");
    const versus: CaromState = { ...base, mode: "versus" };
    expect(winnerText({ ...versus, winner: "left" })).toBe("PLAYER ONE WINS");
    expect(winnerText({ ...versus, winner: "right" })).toBe("PLAYER TWO WINS");
  });
});

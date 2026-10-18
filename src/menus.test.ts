import { describe, expect, it } from "vitest";
import { itemAt, itemRect, menuItems, wrapIndex } from "./menus";

describe("menu layout", () => {
  it("lists each screen's items", () => {
    expect(menuItems("title")).toEqual(["SOLO", "VERSUS", "HOW TO PLAY"]);
    expect(menuItems("paused")).toEqual(["RESUME", "RESTART", "QUIT TO MENU"]);
    expect(menuItems("matchover")).toEqual(["PLAY AGAIN", "MENU"]);
    expect(menuItems("howto")).toHaveLength(1);
    expect(menuItems("playing")).toEqual([]);
  });

  it("reports regions only for items the screen shows", () => {
    expect(itemRect("title", 3)).toBeNull();
    expect(itemRect("title", -1)).toBeNull();
    expect(itemRect("title", 0.5)).toBeNull();
    expect(itemRect("countdown", 0)).toBeNull();
    const rect = itemRect("matchover", 1);
    expect(rect).not.toBeNull();
  });

  it("hit-tests inside regions only", () => {
    for (let i = 0; i < 3; i++) {
      const r = itemRect("title", i);
      if (r === null) throw new Error("missing rect");
      expect(itemAt("title", r.x + 1, r.y + 1)).toBe(i);
      expect(itemAt("title", r.x + r.w - 1, r.y + r.h - 1)).toBe(i);
    }
    expect(itemAt("title", 5, 5)).toBe(-1);
    expect(itemAt("playing", 640, 380)).toBe(-1);
  });

  it("wraps both ways", () => {
    expect(wrapIndex(0, -1, 3)).toBe(2);
    expect(wrapIndex(2, 1, 3)).toBe(0);
    expect(wrapIndex(7, 1, 3)).toBe(2);
    expect(wrapIndex(0.5, 1, 3)).toBe(1);
    expect(wrapIndex(4, 1, 0)).toBe(4);
  });
});

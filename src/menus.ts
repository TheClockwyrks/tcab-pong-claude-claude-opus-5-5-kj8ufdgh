// The menus every menu screen shows, and the rectangle each item occupies in
// logical units. Drawing, pointer hit-testing and `menuItemRect` all read the
// layout from here, so the three always agree.

import {
  FIELD_CX,
  MATCHOVER_ITEMS,
  PAUSE_ITEMS,
  TITLE_ITEMS,
} from "./constants";
import type { MenuItemRect, Screen } from "./game";

/** The one item the how-to screen shows. */
export const HOWTO_ITEMS = ["BACK"] as const;

interface MenuLayout {
  readonly items: readonly string[];
  /** The top edge of the first item. */
  readonly top: number;
  readonly width: number;
}

const ITEM_H = 56;
const ITEM_GAP = 18;

const LAYOUTS: Partial<Record<Screen, MenuLayout>> = {
  title: { items: TITLE_ITEMS, top: 352, width: 340 },
  howto: { items: HOWTO_ITEMS, top: 618, width: 260 },
  paused: { items: PAUSE_ITEMS, top: 300, width: 340 },
  matchover: { items: MATCHOVER_ITEMS, top: 430, width: 340 },
};

/** The items the screen shows, empty on a screen with no menu. */
export function menuItems(screen: Screen): readonly string[] {
  return LAYOUTS[screen]?.items ?? [];
}

/** Item `index`'s hit region on `screen`, or `null` if it shows no such item. */
export function itemRect(screen: Screen, index: number): MenuItemRect | null {
  const layout = LAYOUTS[screen];
  if (
    layout === undefined ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= layout.items.length
  ) {
    return null;
  }
  return {
    x: FIELD_CX - layout.width / 2,
    y: layout.top + index * (ITEM_H + ITEM_GAP),
    w: layout.width,
    h: ITEM_H,
  };
}

/** The index of the item under `(x, y)` on `screen`, or `-1` for none. */
export function itemAt(screen: Screen, x: number, y: number): number {
  const count = menuItems(screen).length;
  for (let index = 0; index < count; index++) {
    const rect = itemRect(screen, index);
    if (
      rect !== null &&
      x >= rect.x &&
      x < rect.x + rect.w &&
      y >= rect.y &&
      y < rect.y + rect.h
    ) {
      return index;
    }
  }
  return -1;
}

/** `index` moved by `step` over `count` items, wrapping both ways. */
export function wrapIndex(index: number, step: number, count: number): number {
  if (count === 0) return index;
  const base = Number.isInteger(index) ? index : 0;
  return (((base + step) % count) + count) % count;
}

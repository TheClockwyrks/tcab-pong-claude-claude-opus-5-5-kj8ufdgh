// A test harness: the real engine over a native canvas and a surface of the
// test's own, stepped with a constant clock, so a test drives the game exactly
// as the page does without a browser.

import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Engine } from "@clockwyrks/simple-2d";
import { FIELD_H, FIELD_W, LAYOUT } from "./constants";
import { BACKGROUND, game } from "./game";
import type { CaromDebugApi, CaromState } from "./game";

export interface Harness {
  readonly engine: Engine<CaromState, CaromDebugApi>;
  readonly debug: CaromDebugApi;
  /** Cue names played, in order, since the harness was built. */
  readonly cues: string[];
  key(code: string, down: boolean): void;
  /** Presses and releases a key, so its edge is armed for the next frame. */
  tap(code: string): void;
  pointer(
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    options?: { id?: number; device?: "mouse" | "touch" },
  ): void;
}

export async function boot(stepMs = 1000 / 60): Promise<Harness> {
  const canvas = createCanvas(FIELD_W, FIELD_H);
  const events = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: FIELD_W,
    height: FIELD_H,
    game,
    background: BACKGROUND,
    layout: LAYOUT,
    clock: new ConstantClock(stepMs),
    surface: {
      cssWidth: () => FIELD_W,
      cssHeight: () => FIELD_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  const cues: string[] = [];
  engine.events.on("cue:played", (event) => cues.push(event.cue));
  await engine.initialize();

  const key = (code: string, down: boolean) => {
    events.dispatchEvent(
      Object.assign(new Event(down ? "keydown" : "keyup"), {
        code,
        repeat: false,
      }),
    );
  };
  return {
    engine,
    debug: engine.debug,
    cues,
    key,
    tap(code) {
      key(code, true);
      key(code, false);
    },
    pointer(type, x, y, options = {}) {
      const down = type === "pointerdown";
      events.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: x,
          clientY: y,
          pointerId: options.id ?? 1,
          pointerType: options.device ?? "mouse",
          isPrimary: true,
          button: type === "pointermove" ? -1 : 0,
          buttons: down || type === "pointermove" ? (down ? 1 : 0) : 0,
        }),
      );
    },
  };
}

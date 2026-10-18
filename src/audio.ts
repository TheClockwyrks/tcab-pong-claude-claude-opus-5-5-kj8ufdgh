// The four cues (specs/audio.md): short synthesized blips, each with its own
// waveform and pitch contour so the events are told apart by ear.

import type { CueSpec, InitApi } from "@clockwyrks/simple-2d";
import type { CaromState } from "./game";
import { CUES } from "./constants";
import type { CueName } from "./constants";

export const CUE_SPECS: Readonly<Record<CueName, CueSpec>> = {
  // A bright upward chirp: the ball leaving a paddle with pace.
  [CUES.paddleHit]: {
    wave: "square",
    freq: 520,
    freqTo: 880,
    gain: 0.14,
    durationMs: 70,
  },
  // A dull low tick off the boundary.
  [CUES.wallBounce]: {
    wave: "triangle",
    freq: 300,
    freqTo: 240,
    gain: 0.22,
    durationMs: 55,
  },
  // A glassy ping off the pillars.
  [CUES.obstacleBounce]: {
    wave: "sine",
    freq: 1180,
    freqTo: 960,
    gain: 0.24,
    durationMs: 90,
  },
  // A falling sweep for a point.
  [CUES.score]: {
    wave: "sawtooth",
    freq: 660,
    freqTo: 180,
    gain: 0.12,
    durationMs: 260,
  },
};

export function defineCues(api: InitApi<CaromState>): void {
  for (const [cue, spec] of Object.entries(CUE_SPECS)) {
    api.audio.define(cue, spec);
  }
}

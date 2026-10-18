// Captures the showcase media into `showcase/`: screenshots of the running game
// in Chromium, and a replay recorded with the engine's own recorder.
//
//   node scripts/showcase.ts
//
// It serves the project with Vite, loads `scripts/stage.ts` into the page to
// stage scenes through the debug surface, and drives the title screen through
// the real page with the keyboard.

import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";
import { createServer } from "vite";

const OUT = new URL("../showcase/", import.meta.url);
const PORT = 4321;

const server = await createServer({
  root: new URL("..", import.meta.url).pathname,
  server: { port: PORT, strictPort: true },
  logLevel: "error",
});
await server.listen();
const browser = await chromium.launch({ args: ["--no-sandbox"] });

try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  page.on("pageerror", (error) => console.error(error));

  // The title screen, from the page exactly as a player opens it.
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: new URL("title.png", OUT).pathname });

  await page.addScriptTag({ type: "module", url: "/scripts/stage.ts" });
  await page.waitForFunction(() => window.carom !== undefined);

  // A Solo rally: spin off the paddles, a bank off a pillar, and the replay of
  // its middle stretch.
  const recording = await page.evaluate(async () => {
    const engine = await window.carom.boot();
    engine.apply((s) => engine.debug.setScreen(s, "countdown"));
    engine.apply((s) => engine.debug.setScore(s, 6, 5));
    engine.apply((s) => engine.debug.setBallServeSign(s, 1));
    await window.carom.play(engine, 230, 0.6);
    engine.startRecording();
    await window.carom.play(engine, 330, 0.6);
    return engine.stopRecording();
  });
  writeFileSync(
    new URL("rally.json.gz", OUT),
    gzipSync(JSON.stringify(recording)),
  );

  // A still of live play: the ball curling away from a spun return.
  await page.evaluate(async () => {
    const engine = await window.carom.boot();
    engine.apply((s) => engine.debug.setScreen(s, "countdown"));
    engine.apply((s) => engine.debug.setScore(s, 6, 5));
    engine.apply((s) => engine.debug.setBallServeSign(s, 1));
    await window.carom.play(engine, 150, 1);
  });
  await page.screenshot({ path: new URL("spin.png", OUT).pathname });

  // The end of a Versus match.
  await page.evaluate(async () => {
    const engine = await window.carom.boot();
    const d = engine.debug;
    engine.apply((s) => d.setMode(s, "versus"));
    engine.apply((s) => d.setScreen(s, "matchover"));
    engine.apply((s) => d.setScore(s, 12, 10));
    engine.apply((s) => d.setWinner(s, "left"));
    engine.apply((s) => d.setBallHeld(s, false));
    engine.apply((s) => d.setBallPosition(s, 1300, 430));
    await engine.advance(1);
  });
  await page.screenshot({ path: new URL("matchover.png", OUT).pathname });
} finally {
  await browser.close();
  await server.close();
}

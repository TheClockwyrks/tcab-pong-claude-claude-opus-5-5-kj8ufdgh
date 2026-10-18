// Drawing a state. Everything is drawn in code, in the 1280x720 logical field,
// from the read-only state alone: rendering changes nothing.

import type { DeepReadonly } from "ts-essentials";
import {
  BALL_R,
  FIELD_CX,
  FIELD_CY,
  FIELD_H,
  FIELD_W,
  HOLD_TIME,
  NET_X,
  OBSTACLE_H,
  OBSTACLE_W,
  P1_X0,
  P2_X0,
  PADDLE_H,
  PADDLE_W,
  SPIN_CLAMP,
  TITLE_TEXT,
} from "./constants";
import type { CaromState, Side } from "./game";
import { itemRect, menuItems } from "./menus";

type View = DeepReadonly<CaromState>;
type Ctx = CanvasRenderingContext2D;

export const PALETTE = {
  left: "#38e1ff",
  right: "#ff4f9e",
  ball: "#fff3c4",
  obstacle: "#ffb23e",
  spin: "#b8ff5a",
  net: "#22304f",
  grid: "rgba(120, 150, 220, 0.05)",
  text: "#e8eeff",
  dim: "#7d8bb0",
  shade: "rgba(4, 7, 16, 0.74)",
} as const;

const FONT = "'Trebuchet MS', 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "'Consolas', 'Menlo', 'DejaVu Sans Mono', monospace";

function font(weight: number, size: number, family = FONT): string {
  return `${weight} ${size}px ${family}`;
}

function roundRectPath(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** A solid body with a soft glow of its own color. */
function glowFill(ctx: Ctx, color: string, blur: number): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  style: string,
  color: string,
  align: CanvasTextAlign = "center",
): void {
  ctx.font = style;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
}

// ---- The field ------------------------------------------------------------------

function drawCourt(ctx: Ctx): void {
  ctx.save();
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 40; x < FIELD_W; x += 40) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, FIELD_H);
  }
  for (let y = 40; y < FIELD_H; y += 40) {
    ctx.moveTo(0, y);
    ctx.lineTo(FIELD_W, y);
  }
  ctx.stroke();

  // The goals: a wash of each side's color along the edge it defends.
  for (const [x0, color] of [
    [0, PALETTE.left],
    [FIELD_W, PALETTE.right],
  ] as const) {
    const gradient = ctx.createLinearGradient(
      x0,
      0,
      x0 === 0 ? 70 : FIELD_W - 70,
      0,
    );
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = gradient;
    ctx.fillRect(x0 === 0 ? 0 : FIELD_W - 70, 0, 70, FIELD_H);
  }
  ctx.globalAlpha = 1;

  // The walls.
  ctx.fillStyle = "#1b2744";
  ctx.fillRect(0, 0, FIELD_W, 4);
  ctx.fillRect(0, FIELD_H - 4, FIELD_W, 4);

  // The net and the center circle: decoration only.
  ctx.strokeStyle = PALETTE.net;
  ctx.lineWidth = 4;
  ctx.setLineDash([16, 14]);
  ctx.beginPath();
  ctx.moveTo(NET_X, 8);
  ctx.lineTo(NET_X, FIELD_H - 8);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(FIELD_CX, FIELD_CY, 86, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawObstacles(ctx: Ctx, state: View): void {
  for (const o of state.obstacles) {
    roundRectPath(
      ctx,
      o.cx - OBSTACLE_W / 2,
      o.cy - OBSTACLE_H / 2,
      OBSTACLE_W,
      OBSTACLE_H,
      8,
    );
    glowFill(ctx, PALETTE.obstacle, 22);
    // A darker core line gives the pillar some depth.
    ctx.fillStyle = "rgba(90, 40, 0, 0.35)";
    ctx.fillRect(o.cx - 2, o.cy - OBSTACLE_H / 2 + 12, 4, OBSTACLE_H - 24);
  }
}

function drawPaddle(ctx: Ctx, side: Side, cy: number): void {
  const x = side === "left" ? P1_X0 : P2_X0;
  roundRectPath(ctx, x, cy - PADDLE_H / 2, PADDLE_W, PADDLE_H, 7);
  glowFill(ctx, side === "left" ? PALETTE.left : PALETTE.right, 26);
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.fillRect(
    x + PADDLE_W / 2 - 1.5,
    cy - PADDLE_H / 2 + 10,
    3,
    PADDLE_H - 20,
  );
}

function drawBall(ctx: Ctx, state: View): void {
  const ball = state.ball;
  if (ball === null) return;

  // The trail: the recorded path of the last TRAIL_TIME seconds, widening and
  // brightening toward the ball, so it bends where the flight bent. A spinning
  // ball's trail takes on the spin color.
  const strength = Math.min(1, Math.abs(ball.spin) / SPIN_CLAMP);
  const points = [...ball.trail, { x: ball.x, y: ball.y, t: state.simTime }];
  if (!ball.held && points.length > 1) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = strength > 0.15 ? PALETTE.spin : PALETTE.ball;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 12;
    for (let i = 1; i < points.length; i++) {
      const f = i / (points.length - 1);
      ctx.globalAlpha = 0.15 + 0.6 * f;
      ctx.lineWidth = BALL_R * (0.5 + 1.4 * f);
      ctx.beginPath();
      ctx.moveTo(points[i - 1].x, points[i - 1].y);
      ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  glowFill(ctx, PALETTE.ball, 24);

  // Spin shows as an arc around the ball, its sweep the spin's strength,
  // starting at the heading and wrapping the way the flight is curling.
  if (strength > 0.02) {
    const heading = Math.atan2(ball.vy, ball.vx);
    const sweep = strength * Math.PI * 1.5;
    ctx.save();
    ctx.strokeStyle = PALETTE.spin;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(
      ball.x,
      ball.y,
      BALL_R + 7,
      heading,
      heading + (ball.spin > 0 ? sweep : -sweep),
      ball.spin < 0,
    );
    ctx.stroke();
    ctx.restore();
  }
}

/** The whole field: court, obstacles, paddles and ball. */
function drawField(ctx: Ctx, state: View): void {
  drawCourt(ctx);
  drawObstacles(ctx, state);
  drawPaddle(ctx, "left", state.paddles.left.cy);
  drawPaddle(ctx, "right", state.paddles.right.cy);
  drawBall(ctx, state);
}

// ---- The HUD ---------------------------------------------------------------------

export function modeLabel(state: View): string {
  return state.mode === "solo" ? "SOLO  ·  VS CPU" : "VERSUS  ·  LOCAL";
}

function drawHud(ctx: Ctx, state: View): void {
  text(
    ctx,
    String(state.score.p1),
    FIELD_CX - 110,
    74,
    font(700, 72, MONO),
    PALETTE.left,
  );
  text(
    ctx,
    String(state.score.p2),
    FIELD_CX + 110,
    74,
    font(700, 72, MONO),
    PALETTE.right,
  );
  const label = modeLabel(state);
  ctx.font = font(700, 16);
  const width = ctx.measureText(label).width + 36;
  roundRectPath(ctx, FIELD_CX - width / 2, FIELD_H - 46, width, 28, 14);
  ctx.fillStyle = "rgba(10, 16, 32, 0.9)";
  ctx.fill();
  text(ctx, label, FIELD_CX, FIELD_H - 32, font(700, 16), PALETTE.dim);
}

function drawCountdown(ctx: Ctx, state: View): void {
  const ball = state.ball;
  if (ball === null || !ball.held) return;
  const progress = Math.max(0, Math.min(1, ball.holdTimer / HOLD_TIME));
  const color = state.receiver === "left" ? PALETTE.left : PALETTE.right;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(
    ball.x,
    ball.y,
    36,
    -Math.PI / 2,
    -Math.PI / 2 + progress * Math.PI * 2,
  );
  ctx.stroke();

  // An arrow toward the receiver, tilted the way the serve will leave.
  const dir = state.receiver === "left" ? -1 : 1;
  const tilt = ball.serveSign * 0.21;
  ctx.translate(ball.x, ball.y);
  ctx.rotate(dir === 1 ? tilt : Math.PI - tilt);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(62, 0);
  ctx.lineTo(48, -9);
  ctx.lineTo(48, 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  text(
    ctx,
    state.score.p1 + state.score.p2 === 0 ? "GET READY" : "SERVE",
    ball.x,
    ball.y + 70,
    font(700, 20),
    PALETTE.text,
  );
}

// ---- Menus -------------------------------------------------------------------

function drawMenu(ctx: Ctx, state: View): void {
  const items = menuItems(state.screen);
  items.forEach((label, index) => {
    const rect = itemRect(state.screen, index);
    if (rect === null) return;
    const selected = index === state.menuIndex;
    roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 12);
    if (selected) {
      glowFill(ctx, PALETTE.left, 20);
    } else {
      ctx.fillStyle = "rgba(14, 22, 44, 0.85)";
      ctx.fill();
      ctx.strokeStyle = "#2c3b63";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    text(
      ctx,
      label,
      rect.x + rect.w / 2,
      rect.y + rect.h / 2 + 1,
      font(700, 24),
      selected ? "#04101c" : PALETTE.text,
    );
  });
}

function shade(ctx: Ctx, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PALETTE.shade;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  ctx.restore();
}

function drawTitle(ctx: Ctx, state: View): void {
  ctx.save();
  ctx.globalAlpha = 0.35;
  drawField(ctx, state);
  ctx.restore();
  shade(ctx, 0.6);

  ctx.save();
  ctx.shadowColor = PALETTE.left;
  ctx.shadowBlur = 40;
  text(ctx, TITLE_TEXT, FIELD_CX, 190, font(800, 150), PALETTE.text);
  ctx.restore();
  // A curved underline: the spin mechanic, drawn.
  ctx.save();
  ctx.strokeStyle = PALETTE.obstacle;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(FIELD_CX - 200, 270);
  ctx.quadraticCurveTo(FIELD_CX, 300, FIELD_CX + 200, 262);
  ctx.stroke();
  ctx.restore();
  text(
    ctx,
    "BEND THE BALL.  BANK THE SHOT.",
    FIELD_CX,
    316,
    font(700, 18),
    PALETTE.dim,
  );

  drawMenu(ctx, state);
  text(
    ctx,
    "W / S or ↑ / ↓ to choose  ·  ENTER to select  ·  M to mute",
    FIELD_CX,
    FIELD_H - 40,
    font(400, 16),
    PALETTE.dim,
  );
}

const HOWTO_LINES: readonly (readonly [string, string])[] = [
  ["MOVE", "Player one: W / S.  Player two (Versus): ↑ / ↓."],
  ["", "In Solo, either pair moves your paddle against the CPU."],
  ["SPIN", "Move your paddle as you strike: the ball curls the way you moved."],
  ["", "Spin fades over time, but it carries through every bounce."],
  ["ANGLE", "Hit near a paddle's end to send the ball out steeply."],
  ["PILLARS", "Two amber pillars split the field. Bank shots off them."],
  ["SCORE", "Get the ball past the far edge. First to 11, by two."],
  ["KEYS", "P or ESC pauses  ·  M mutes  ·  ENTER confirms."],
];

function drawHowto(ctx: Ctx, state: View): void {
  ctx.save();
  ctx.globalAlpha = 0.25;
  drawField(ctx, state);
  ctx.restore();
  shade(ctx, 0.85);

  text(ctx, "HOW TO PLAY", FIELD_CX, 90, font(800, 54), PALETTE.text);
  HOWTO_LINES.forEach(([head, body], i) => {
    const y = 180 + i * 52;
    if (head !== "") {
      text(ctx, head, 300, y, font(800, 20), PALETTE.obstacle, "right");
    }
    text(ctx, body, 330, y, font(400, 22), PALETTE.text, "left");
  });
  drawMenu(ctx, state);
}

function drawPaused(ctx: Ctx, state: View): void {
  drawField(ctx, state);
  drawHud(ctx, state);
  shade(ctx);
  text(ctx, "PAUSED", FIELD_CX, 210, font(800, 72), PALETTE.text);
  drawMenu(ctx, state);
}

export function winnerText(state: View): string {
  if (state.winner === null) return "MATCH OVER";
  if (state.mode === "solo") {
    return state.winner === "left" ? "YOU WIN" : "CPU WINS";
  }
  return state.winner === "left" ? "PLAYER ONE WINS" : "PLAYER TWO WINS";
}

function drawMatchover(ctx: Ctx, state: View): void {
  drawField(ctx, state);
  shade(ctx);
  const color =
    state.winner === "right"
      ? PALETTE.right
      : state.winner === "left"
        ? PALETTE.left
        : PALETTE.text;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 30;
  text(ctx, winnerText(state), FIELD_CX, 190, font(800, 76), color);
  ctx.restore();
  text(
    ctx,
    String(state.score.p1),
    FIELD_CX - 90,
    320,
    font(700, 84, MONO),
    PALETTE.left,
  );
  text(ctx, "–", FIELD_CX, 316, font(700, 60, MONO), PALETTE.dim);
  text(
    ctx,
    String(state.score.p2),
    FIELD_CX + 90,
    320,
    font(700, 84, MONO),
    PALETTE.right,
  );
  drawMenu(ctx, state);
}

export function renderGame(state: View, ctx: Ctx): void {
  switch (state.screen) {
    case "title":
      drawTitle(ctx, state);
      break;
    case "howto":
      drawHowto(ctx, state);
      break;
    case "countdown":
      drawField(ctx, state);
      drawHud(ctx, state);
      drawCountdown(ctx, state);
      break;
    case "playing":
      drawField(ctx, state);
      drawHud(ctx, state);
      break;
    case "paused":
      drawPaused(ctx, state);
      break;
    case "matchover":
      drawMatchover(ctx, state);
      break;
  }
  if (state.muted) {
    text(ctx, "MUTED", FIELD_W - 24, 26, font(700, 14), PALETTE.dim, "right");
  }
}

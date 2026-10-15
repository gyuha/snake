import { TAU, type Vec } from '@snake/shared';

/**
 * Head and tail decorations per animal (index into ANIMALS). Shapes are drawn in a local frame where
 * one unit is the body radius, +x points forward (head) or toward the body (tail), and the origin is
 * the head centre / tail tip. The body stroke is already on the canvas, so these paint on top of it;
 * the renderer draws the eyes after the head.
 */
type Shape = (g: CanvasRenderingContext2D, body: string, stripe: string) => void;

interface AnimalArt {
  head?: Shape;
  tail?: Shape;
}

const BROWN = '#7a4b2a';
const CREAM = '#f3d9b8';
const PINK = '#f6a5b8';
const WHITE = '#fafafa';
const BLACK = '#1a1a1a';

function ellipse(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number, fill: string): void {
  g.fillStyle = fill;
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, TAU);
  g.fill();
}

function disc(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  g.fillStyle = fill;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

function triangle(g: CanvasRenderingContext2D, pts: readonly [number, number][], fill: string): void {
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fill();
}

function stroke(g: CanvasRenderingContext2D, width: number, color: string): void {
  g.lineWidth = width;
  g.lineCap = 'round';
  g.strokeStyle = color;
  g.stroke();
}

const ART: readonly AnimalArt[] = [
  // default: the plain round head and tail the body stroke already draws
  {},
  // dog: floppy ears, cream muzzle, black nose; a short wagging tail
  {
    head(g) {
      for (const s of [-1, 1]) ellipse(g, -0.15, s * 1.05, 0.6, 0.36, s * 0.5, BROWN);
      ellipse(g, 0.75, 0, 0.42, 0.36, 0, CREAM);
      disc(g, 1.05, 0, 0.13, '#111111');
    },
    tail(g) {
      g.beginPath();
      g.moveTo(0.2, 0);
      g.quadraticCurveTo(-0.8, -0.9, -1.5, -0.6);
      stroke(g, 0.55, BROWN);
    },
  },
  // cat: pointed ears, whiskers; a long thin curled tail with a light tip
  {
    head(g, body) {
      for (const s of [-1, 1]) {
        triangle(g, [[-0.1, s * 0.85], [-0.4, s * 1.55], [0.35, s * 0.95]], body);
        triangle(g, [[-0.05, s * 0.95], [-0.3, s * 1.35], [0.2, s * 1.0]], PINK);
      }
      triangle(g, [[0.95, -0.1], [1.15, 0], [0.95, 0.1]], PINK);
      g.beginPath();
      for (const s of [-1, 1]) {
        g.moveTo(0.95, s * 0.18);
        g.lineTo(1.7, s * 0.5);
      }
      g.moveTo(0.95, 0);
      g.lineTo(1.75, 0);
      stroke(g, 0.07, 'rgba(255, 255, 255, 0.85)');
    },
    tail(g, body, stripe) {
      g.beginPath();
      g.moveTo(0.3, 0);
      g.bezierCurveTo(-1, 0, -1.3, -1.3, -2.6, -1.1);
      stroke(g, 0.5, body);
      disc(g, -2.6, -1.1, 0.3, stripe);
    },
  },
  // snake: a long triangular head with a forked tongue; a tapering tail
  {
    head(g, body) {
      g.fillStyle = body;
      g.beginPath();
      g.moveTo(-0.3, -1);
      g.quadraticCurveTo(1, -0.85, 1.7, 0);
      g.quadraticCurveTo(1, 0.85, -0.3, 1);
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(1.7, 0);
      g.lineTo(2.2, 0);
      g.moveTo(2.2, 0);
      g.lineTo(2.55, -0.2);
      g.moveTo(2.2, 0);
      g.lineTo(2.55, 0.2);
      stroke(g, 0.1, '#e5484d');
    },
    tail(g, body) {
      triangle(g, [[0.3, -1], [-3, 0], [0.3, 1]], body);
    },
  },
  // panda: white face, black ears, eye patches and nose; a white puff tail
  {
    head(g) {
      for (const s of [-1, 1]) disc(g, -0.1, s * 0.95, 0.42, BLACK);
      disc(g, 0, 0, 1.02, WHITE);
      for (const s of [-1, 1]) ellipse(g, 0.4, s * 0.45, 0.4, 0.3, s * 0.4, BLACK);
      ellipse(g, 1.0, 0, 0.17, 0.12, 0, BLACK);
    },
    tail(g) {
      disc(g, -0.6, 0, 0.65, WHITE);
    },
  },
  // rabbit: tall ears laid back, white face, pink nose; a cotton-ball tail
  {
    head(g) {
      for (const s of [-1, 1]) {
        ellipse(g, -0.6, s * 0.65, 1.0, 0.32, s * 0.35, '#f4f4f4');
        ellipse(g, -0.6, s * 0.65, 0.75, 0.17, s * 0.35, PINK);
      }
      disc(g, 0, 0, 1.02, '#f4f4f4');
      disc(g, 1.0, 0, 0.13, '#f27a93');
    },
    tail(g) {
      disc(g, -0.8, 0, 0.75, '#ffffff');
      disc(g, -0.95, -0.2, 0.25, '#e6e6e6');
    },
  },
];

function paint(
  ctx: CanvasRenderingContext2D, shape: Shape | undefined, at: Vec, ang: number, r: number, body: string, stripe: string,
): void {
  if (!shape) return;
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(ang);
  ctx.scale(r, r);
  shape(ctx, body, stripe);
  ctx.restore();
}

/** Paints the animal's head features at `head`, facing `ang`, for a body of radius `r`. */
export function drawHead(
  ctx: CanvasRenderingContext2D, animal: number, head: Vec, ang: number, r: number, body: string, stripe: string,
): void {
  paint(ctx, ART[animal % ART.length].head, head, ang, r, body, stripe);
}

/** Paints the animal's tail at `tail`; `ang` points from the tail tip toward the body. */
export function drawTail(
  ctx: CanvasRenderingContext2D, animal: number, tail: Vec, ang: number, r: number, body: string, stripe: string,
): void {
  paint(ctx, ART[animal % ART.length].tail, tail, ang, r, body, stripe);
}

/** Two eyes on the head, looking along `ang`. */
export function drawEyes(ctx: CanvasRenderingContext2D, head: Vec, ang: number, r: number): void {
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  for (const side of [-1, 1]) {
    const ex = head.x + cos * r * 0.35 - sin * side * r * 0.45;
    const ey = head.y + sin * r * 0.35 + cos * side * r * 0.45;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex, ey, r * 0.32, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.arc(ex + cos * r * 0.12, ey + sin * r * 0.12, r * 0.16, 0, TAU);
    ctx.fill();
  }
}

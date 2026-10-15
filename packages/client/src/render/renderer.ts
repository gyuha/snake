import { TAU, WORLD_RADIUS, bodyRadius, zoom, type Vec } from '@snake/shared';
import type { Mirror, SnakeView } from '../state/mirror';
import { FOOD_COLORS_CSS, SKINS } from './palette';
import { traceSmooth } from './smooth';

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

interface ViewRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const VIEW_UNITS = 1100;

/** Pixels per world unit so the screen half-diagonal shows 1100·zoom(sct) units (matches the server AOI). */
export function cameraScale(sct: number, width: number, height: number): number {
  return Math.hypot(width, height) / 2 / (VIEW_UNITS * zoom(sct));
}

function makeHexPattern(ctx: CanvasRenderingContext2D): CanvasPattern {
  const s = 30;
  const w = 3 * s;
  const h = Math.sqrt(3) * s;
  const tile = document.createElement('canvas');
  tile.width = w;
  tile.height = Math.round(h);
  const g = tile.getContext('2d')!;
  g.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  g.lineWidth = 2;
  const hex = (cx: number, cy: number) => {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      const x = cx + s * Math.cos(a);
      const y = cy + s * Math.sin(a);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.stroke();
  };
  hex(s, h / 2);
  hex(2.5 * s, 0);
  hex(2.5 * s, h);
  hex(-0.5 * s, 0);
  hex(-0.5 * s, h);
  return ctx.createPattern(tile, 'repeat')!;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly hexPattern: CanvasPattern;
  private dpr = 1;
  width = 0;
  height = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
    this.hexPattern = makeHexPattern(ctx);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  }

  draw(m: Mirror, cam: Camera): void {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1a0b10';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const k = this.dpr * cam.scale;
    ctx.setTransform(k, 0, 0, k, (this.dpr * this.width) / 2 - cam.x * k, (this.dpr * this.height) / 2 - cam.y * k);
    this.drawWorld();

    const halfW = this.width / 2 / cam.scale + 60;
    const halfH = this.height / 2 / cam.scale + 60;
    this.drawFoods(m, { x0: cam.x - halfW, x1: cam.x + halfW, y0: cam.y - halfH, y1: cam.y + halfH });

    const self = m.selfSnake();
    for (const s of m.snakes.values()) if (s !== self) this.drawSnake(m, s, cam.scale);
    if (self) this.drawSnake(m, self, cam.scale);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawWorld(): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(WORLD_RADIUS, WORLD_RADIUS, WORLD_RADIUS, 0, TAU);
    ctx.fillStyle = '#161c26';
    ctx.fill();
    ctx.fillStyle = this.hexPattern;
    ctx.fill();
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#ff4d5e';
    ctx.stroke();
  }

  private drawFoods(m: Mirror, v: ViewRect): void {
    const { ctx } = this;
    for (const f of m.foods.values()) {
      if (f.x < v.x0 || f.x > v.x1 || f.y < v.y0 || f.y > v.y1) continue;
      const r = 3 + f.size * 1.5;
      ctx.fillStyle = FOOD_COLORS_CSS[f.color % FOOD_COLORS_CSS.length];
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r * 2, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, TAU);
      ctx.fill();
    }
  }

  private drawSnake(m: Mirror, s: SnakeView, scale: number): void {
    const { ctx } = this;
    const pts = s.body.points;
    const r = bodyRadius(pts.length);
    const head = m.headOf(s);
    const [main, stripe] = SKINS[s.skin % SKINS.length];

    // The tail glides toward the next point unless the next commit will be a grow (fam ≥ 1).
    let tail: Vec = pts[0];
    if (pts.length > 1 && s.fam < 0.999) {
      const f = m.tailFraction(s);
      tail = { x: pts[0].x + (pts[1].x - pts[0].x) * f, y: pts[0].y + (pts[1].y - pts[0].y) * f };
    }
    const path = new Path2D();
    traceSmooth(path, [tail, ...pts.slice(1), head]);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (s.boosting) {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = main;
      ctx.lineWidth = 2 * r + 12;
      ctx.stroke(path);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = main;
    ctx.lineWidth = 2 * r;
    ctx.stroke(path);
    // A continuous sheen: a dashed stripe is anchored to the tail, so it crawls and jitters as the tail moves.
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = stripe;
    ctx.lineWidth = r * 0.7;
    ctx.stroke(path);
    ctx.globalAlpha = 1;

    this.drawEyes(head, s.ang, r);

    ctx.font = `${14 / scale}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText(s.name, head.x, head.y - r - 8 / scale);
  }

  private drawEyes(head: Vec, ang: number, r: number): void {
    const { ctx } = this;
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
}

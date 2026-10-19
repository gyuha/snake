import { dequantizeCoord, type OverviewSnake } from '@snake/shared';
import { Connection } from './net/connection';
import { SKINS } from './render/palette';
import { fitWorld, worldToScreen } from './ui/overview-layout';

const WS_URL: string = import.meta.env.VITE_WS_URL ?? `ws://${location.hostname}:8080`;
const RECONNECT_MS = 2000;
const MAP_MARGIN = 24;
const DOT_RADIUS = 5;

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
}

const canvas = el<HTMLCanvasElement>('map');
const board = el('board');
const lost = el('lost');
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2d canvas unavailable');

let snakes: OverviewSnake[] = [];

function drawMap(c: CanvasRenderingContext2D): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);

  const layout = fitWorld(w, h, MAP_MARGIN);
  c.beginPath();
  c.arc(layout.cx, layout.cy, layout.radius, 0, Math.PI * 2);
  c.fillStyle = '#151b26';
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = '#3a4558';
  c.stroke();

  c.font = '11px system-ui, sans-serif';
  c.textBaseline = 'middle';
  for (const s of snakes) {
    const p = worldToScreen(layout, dequantizeCoord(s.x), dequantizeCoord(s.y));
    c.beginPath();
    c.arc(p.x, p.y, DOT_RADIUS, 0, Math.PI * 2);
    c.fillStyle = SKINS[s.skin]?.[0] ?? '#ffffff';
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = '#ffffff';
    c.stroke();
    c.fillStyle = '#e8ecf3';
    c.fillText(s.name, p.x + DOT_RADIUS + 3, p.y);
  }
}

function drawBoard(): void {
  board.replaceChildren(
    ...snakes.map((s) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = s.name;
      const score = document.createElement('span');
      score.className = 'score';
      score.textContent = String(s.score);
      li.append(score, name);
      return li;
    }),
  );
}

const render = (): void => {
  drawMap(ctx);
  drawBoard();
};

function connect(): void {
  const conn = new Connection(
    WS_URL,
    (msgs) => {
      for (const msg of msgs) {
        if (msg.t !== 'overview') continue;
        snakes = msg.snakes;
        lost.hidden = true;
        render();
      }
    },
    () => {
      lost.hidden = false;
      setTimeout(connect, RECONNECT_MS);
    },
  );
  conn.whenOpen().then(() => conn.send({ t: 'spectate' })).catch(() => {});
}

window.addEventListener('resize', () => drawMap(ctx));
render();
connect();

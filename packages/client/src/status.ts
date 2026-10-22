import {
  BOT_MAX, ROUND_MAX_MINUTES, ROUND_MIN_MINUTES, dequantizeAngle16, dequantizeCoord, type OverviewSnake,
} from '@snake/shared';
import { Connection } from './net/connection';
import { drawEyes, drawHead } from './render/animals';
import { SKINS } from './render/palette';
import { gameUrl } from './ui/game-url';
import { drawQr } from './ui/qr';
import { fitWorld, rankStyle, worldToScreen } from './ui/overview-layout';
import { RoundClock, formatClock } from './ui/round-clock';
import { playStartBanner } from './ui/start-banner';

const WS_URL: string = import.meta.env.VITE_WS_URL ?? `ws://${location.hostname}:${import.meta.env.VITE_WS_PORT}`;
const GAME_URL: string | undefined = import.meta.env.VITE_GAME_URL;
const RECONNECT_MS = 2000;
const MAP_MARGIN = 24;

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
}

const canvas = el<HTMLCanvasElement>('map');
const board = el('board');
const lost = el('lost');
const clockEl = el('clock');
const banner = el('start-banner');
const endedEl = el('ended');
const winnerEl = el('winner');
const minutesInput = el<HTMLInputElement>('minutes');
const botsInput = el<HTMLInputElement>('bots');
const startBtn = el<HTMLButtonElement>('start');
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2d canvas unavailable');

let snakes: OverviewSnake[] = [];
let conn: Connection | null = null;
const round = new RoundClock();

function minutesValue(): number | null {
  const v = Number(minutesInput.value);
  return Number.isInteger(v) && v >= ROUND_MIN_MINUTES && v <= ROUND_MAX_MINUTES ? v : null;
}

function botsValue(): number | null {
  const v = Number(botsInput.value);
  return Number.isInteger(v) && v >= 0 && v <= BOT_MAX ? v : null;
}

function drawRound(): void {
  clockEl.hidden = round.state !== 'running';
  clockEl.textContent = formatClock(round.remaining(performance.now()));
  endedEl.hidden = round.state !== 'ended';
  const top = snakes[0];
  winnerEl.textContent = round.state === 'ended' && top ? `1위 ${top.name} · ${top.score}점` : '';
  startBtn.disabled = minutesValue() === null || botsValue() === null;
}

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

  c.textBaseline = 'middle';
  // Snakes arrive best first; draw in reverse so the podium sits on top of the rest.
  for (let i = snakes.length - 1; i >= 0; i--) {
    const s = snakes[i]!;
    const style = rankStyle(i);
    const p = worldToScreen(layout, dequantizeCoord(s.x), dequantizeCoord(s.y));
    const [body, stripe] = SKINS[s.skin] ?? ['#ffffff', '#ffffff'];
    const ang = dequantizeAngle16(s.ang);
    c.beginPath();
    c.arc(p.x, p.y, style.dotRadius, 0, Math.PI * 2);
    c.fillStyle = body;
    c.fill();
    drawHead(c, s.animal, p, ang, style.dotRadius, body, stripe);
    drawEyes(c, p, ang, style.dotRadius);
    c.beginPath();
    c.arc(p.x, p.y, style.dotRadius, 0, Math.PI * 2);
    c.lineWidth = style.ring ? 3 : 1.5;
    c.strokeStyle = style.ring ?? '#ffffff';
    c.stroke();
    c.font = `${style.bold ? '700 ' : ''}${style.labelPx}px system-ui, sans-serif`;
    c.fillStyle = style.ring ?? '#e8ecf3';
    c.fillText(style.ring ? `${i + 1}위 ${s.name}` : s.name, p.x + style.dotRadius * 1.6 + 4, p.y);
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
  drawRound();
};

function connect(): void {
  const c = new Connection(
    WS_URL,
    (msgs) => {
      for (const msg of msgs) {
        if (msg.t === 'round') {
          if (round.apply(msg.state, msg.seq, msg.remainingMs, performance.now())) playStartBanner(banner);
          drawRound();
        }
        if (msg.t === 'serverInfo') drawGameLink(msg.hosts);
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
  conn = c;
  c.whenOpen().then(() => c.send({ t: 'spectate' })).catch(() => {});
}

startBtn.addEventListener('click', () => {
  const minutes = minutesValue();
  const bots = botsValue();
  if (minutes !== null && bots !== null) conn?.send({ t: 'startRound', minutes, bots });
});
minutesInput.addEventListener('input', drawRound);
botsInput.addEventListener('input', drawRound);
setInterval(drawRound, 250);

function drawGameLink(lanHosts: string[]): void {
  const url = GAME_URL || gameUrl(location, lanHosts);
  el('qr-url').textContent = url;
  drawQr(el<HTMLCanvasElement>('qr'), url, 264);
}
drawGameLink([]);

window.addEventListener('resize', () => drawMap(ctx));
render();
connect();

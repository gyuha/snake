import { ANIMAL_COUNT, SKIN_COUNT, START_SEGMENTS, WORLD_RADIUS, dequantizeAngle8, quantizeAngle8, sanitizeName } from '@snake/shared';
import { Input } from './input';
import { Connection } from './net/connection';
import { SKINS } from './render/palette';
import { Renderer, cameraScale, type Camera } from './render/renderer';
import { Mirror } from './state/mirror';
import { Hud } from './ui/hud';
import { setupTouchControls } from './ui/touch-controls';
import { drawAnimalIcon, drawPreview } from './ui/preview';

const WS_URL: string = import.meta.env.VITE_WS_URL ?? `ws://${location.hostname}:8080`;
const STEER_INTERVAL_MS = 1000 / 30;
const NAME_KEY = 'snake.name';

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
}

const canvas = el<HTMLCanvasElement>('game');
const startScreen = el('start');
const nameInput = el<HTMLInputElement>('name');
const skinPicker = el('skins');
const animalPicker = el('animals');
const previewCanvas = el<HTMLCanvasElement>('preview');
const deathScreen = el('death');
const finalScore = el('final-score');
const lostScreen = el('lost');

const mirror = new Mirror();
const renderer = new Renderer(canvas);
const input = new Input(canvas);
setupTouchControls(input, el('joystick'), el('joystick-knob'), el('boost-btn'));
const hud = new Hud(el<HTMLOListElement>('board'), el('rank'), el('stats'), el<HTMLCanvasElement>('minimap'));

let conn: Connection | null = null;
let skin = Math.floor(Math.random() * SKIN_COUNT);
let animal = Math.floor(Math.random() * ANIMAL_COUNT);
let camera: Camera = { x: WORLD_RADIUS, y: WORLD_RADIUS, scale: 0.5 };
let lastSteer = -1;
let lastSteerAt = 0;
let lastBoost = false;
let deathShown = false;

function show(screen: HTMLElement | null): void {
  for (const s of [startScreen, deathScreen, lostScreen]) s.hidden = s !== screen;
}

function connect(): void {
  mirror.reset();
  deathShown = false;
  conn = new Connection(
    WS_URL,
    (msgs) => {
      for (const msg of msgs) mirror.apply(msg);
    },
    () => {
      conn = null;
      show(lostScreen);
    },
  );
}

function join(): void {
  const name = sanitizeName(nameInput.value);
  try {
    localStorage.setItem(NAME_KEY, nameInput.value);
  } catch {
    // Storage can be unavailable (private mode); the name is only a convenience.
  }
  const c = conn;
  if (!c) return;
  c.whenOpen()
    .then(() => {
      c.send({ t: 'join', name, skin, animal });
      lastSteer = -1;
      lastBoost = false;
      deathShown = false;
      show(null);
    })
    .catch(() => show(lostScreen));
}

function buildSkinPicker(): void {
  SKINS.forEach(([main, stripe], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = `linear-gradient(135deg, ${main} 50%, ${stripe} 50%)`;
    b.setAttribute('aria-label', `skin ${i + 1}`);
    if (i === skin) b.classList.add('selected');
    b.addEventListener('click', () => {
      skin = i;
      for (const other of skinPicker.children) other.classList.toggle('selected', other === b);
      refreshPicker();
    });
    skinPicker.append(b);
  });
}

const ANIMAL_LABELS = ['기본', '강아지', '고양이', '뱀', '팬더', '토끼'];

function buildAnimalPicker(): void {
  for (let i = 0; i < ANIMAL_COUNT; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', ANIMAL_LABELS[i]);
    b.title = ANIMAL_LABELS[i];
    if (i === animal) b.classList.add('selected');
    const icon = document.createElement('canvas');
    icon.width = 80;
    icon.height = 80;
    b.append(icon);
    b.addEventListener('click', () => {
      animal = i;
      for (const other of animalPicker.children) other.classList.toggle('selected', other === b);
      refreshPicker();
    });
    animalPicker.append(b);
  }
}

function refreshPicker(): void {
  drawPreview(previewCanvas, animal, skin);
  animalPicker.querySelectorAll('canvas').forEach((icon, i) => drawAnimalIcon(icon, i, skin));
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  input.update(dt);

  const self = mirror.selfSnake();
  if (self && conn) {
    const q = quantizeAngle8(input.angle);
    mirror.setLocalWang(dequantizeAngle8(q));
    if (q !== lastSteer && now - lastSteerAt >= STEER_INTERVAL_MS) {
      conn.send({ t: 'steer', angle: q });
      lastSteer = q;
      lastSteerAt = now;
    }
    if (input.boost !== lastBoost) {
      conn.send({ t: 'boost', on: input.boost });
      lastBoost = input.boost;
    }
  }

  mirror.advance(dt);
  if (mirror.death && !deathShown) {
    deathShown = true;
    finalScore.textContent = String(mirror.death.finalScore);
    show(deathScreen);
  }

  const focus = self ? mirror.headOf(self) : camera;
  const sct = self ? self.body.points.length : START_SEGMENTS;
  camera = { x: focus.x, y: focus.y, scale: cameraScale(sct, renderer.width, renderer.height) };
  renderer.draw(mirror, camera);
  hud.update(mirror);
  requestAnimationFrame(frame);
}

el('play').addEventListener('click', join);
el('again').addEventListener('click', join);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') join();
});
el('reconnect').addEventListener('click', () => {
  connect();
  show(startScreen);
});

try {
  nameInput.value = localStorage.getItem(NAME_KEY) ?? '';
} catch {
  nameInput.value = '';
}
buildSkinPicker();
buildAnimalPicker();
refreshPicker();
connect();
show(startScreen);
requestAnimationFrame(frame);

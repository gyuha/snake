import {
  LEADERBOARD_SIZE, MINIMAP_SIZE, SECTORS_PER_EDGE, SECTOR_SIZE, START_SEGMENTS, WORLD_RADIUS,
  Writer, encodeServer, quantizeAngle16, sectorCoord, sectorKey, toWireFam, toWireSpeed,
  viewRadius, type FoodWire, type ServerMsg, type SnakeRank,
} from '@snake/shared';
import type { Food } from '../game/food';
import type { Snake } from '../game/snake';
import type { DeathInfo, World } from '../game/world';

export interface ViewState {
  snake: Snake | null;
  viewX: number;
  viewY: number;
  sectors: Set<number>;
  snakes: Set<number>;
}

export interface FrameExtras {
  ranked?: Snake[];
  minimap?: Uint8Array;
  death?: DeathInfo;
}

const MAX_U24 = 0xffffff;

export function newViewState(): ViewState {
  return { snake: null, viewX: WORLD_RADIUS, viewY: WORLD_RADIUS, sectors: new Set(), snakes: new Set() };
}

export function visibleSectors(cx: number, cy: number, radius: number): Set<number> {
  const out = new Set<number>();
  const k = Math.ceil(radius / SECTOR_SIZE);
  const csx = sectorCoord(cx);
  const csy = sectorCoord(cy);
  const r2 = WORLD_RADIUS * WORLD_RADIUS;
  for (let sx = Math.max(0, csx - k); sx <= Math.min(SECTORS_PER_EDGE - 1, csx + k); sx++) {
    for (let sy = Math.max(0, csy - k); sy <= Math.min(SECTORS_PER_EDGE - 1, csy + k); sy++) {
      const nx = Math.max(sx * SECTOR_SIZE, Math.min(WORLD_RADIUS, (sx + 1) * SECTOR_SIZE));
      const ny = Math.max(sy * SECTOR_SIZE, Math.min(WORLD_RADIUS, (sy + 1) * SECTOR_SIZE));
      const dx = nx - WORLD_RADIUS;
      const dy = ny - WORLD_RADIUS;
      if (dx * dx + dy * dy <= r2) out.add(sectorKey(sx, sy));
    }
  }
  return out;
}

export function snakeAddMsg(s: Snake): ServerMsg {
  const snap = s.addSnapshot();
  return {
    t: 'snakeAdd',
    id: s.id,
    name: s.name,
    skin: s.skin,
    animal: s.animal,
    ang: quantizeAngle16(s.ang),
    wang: quantizeAngle16(s.wang),
    speed: toWireSpeed(s.speed),
    fam: toWireFam(s.fam),
    tailX: snap.tailX,
    tailY: snap.tailY,
    iangs: snap.iangs,
  };
}

function toWireFood(f: Food): FoodWire {
  return { rx: f.rx, ry: f.ry, size: f.size, color: f.color };
}

function encodeSectorFood(w: Writer, sx: number, sy: number, foods: Food[]): void {
  for (let i = 0; i < foods.length; i += 255) {
    encodeServer(w, { t: 'sectorFood', sx, sy, foods: foods.slice(i, i + 255).map(toWireFood) });
  }
}

export function buildFrame(view: ViewState, world: World, extras: FrameExtras): Uint8Array | null {
  const w = new Writer();
  const self = view.snake && view.snake.alive ? view.snake : null;
  if (self) {
    view.viewX = self.headX;
    view.viewY = self.headY;
  }

  // Sectors and food
  const nextSectors = visibleSectors(view.viewX, view.viewY, viewRadius(self ? self.sct : START_SEGMENTS));
  for (const key of view.sectors) {
    if (!nextSectors.has(key)) {
      encodeServer(w, { t: 'sectorLeave', sx: Math.floor(key / SECTORS_PER_EDGE), sy: key % SECTORS_PER_EDGE });
    }
  }
  for (const key of nextSectors) {
    if (view.sectors.has(key)) continue;
    const sx = Math.floor(key / SECTORS_PER_EDGE);
    const sy = key % SECTORS_PER_EDGE;
    encodeSectorFood(w, sx, sy, world.food.sectorFoods(sx, sy));
  }
  const stayed = (sx: number, sy: number): boolean => {
    const key = sectorKey(sx, sy);
    return view.sectors.has(key) && nextSectors.has(key);
  };
  for (const f of world.food.added) {
    if (stayed(f.sx, f.sy)) {
      encodeServer(w, { t: 'foodAdd', sx: f.sx, sy: f.sy, rx: f.rx, ry: f.ry, size: f.size, color: f.color });
    }
  }
  for (const e of world.food.eaten) {
    const f = e.food;
    if (stayed(f.sx, f.sy)) {
      encodeServer(w, { t: 'foodEat', sx: f.sx, sy: f.sy, rx: f.rx, ry: f.ry, eaterId: e.eaterId });
    }
  }

  // Snakes
  const nextSnakes = new Map<number, Snake>();
  for (const key of nextSectors) {
    const set = world.index.snakesInSector(key);
    if (!set) continue;
    for (const s of set) if (s.alive) nextSnakes.set(s.id, s);
  }
  if (self) nextSnakes.set(self.id, self);

  const died = new Set(world.deaths.map((d) => d.snake.id));
  for (const id of view.snakes) {
    if (!nextSnakes.has(id)) encodeServer(w, { t: 'snakeRemove', id, reason: died.has(id) ? 1 : 0 });
  }
  for (const [id, s] of nextSnakes) {
    if (!view.snakes.has(id)) {
      encodeServer(w, snakeAddMsg(s));
      continue;
    }
    for (const e of s.events) {
      if (e.k === 'move') encodeServer(w, { t: 'snakeMove', id, iang: e.iang });
      else if (e.k === 'grow') encodeServer(w, { t: 'snakeGrow', id, iang: e.iang, fam: toWireFam(e.fam) });
      else encodeServer(w, { t: 'snakeShrink', id, fam: toWireFam(e.fam) });
    }
    if (s.stateDirty) {
      encodeServer(w, { t: 'snakeState', id, ang: quantizeAngle16(s.ang), wang: quantizeAngle16(s.wang), speed: toWireSpeed(s.speed) });
    }
    if (s.famDirty) encodeServer(w, { t: 'snakeFam', id, fam: toWireFam(s.fam) });
  }

  // Extras
  if (extras.ranked) {
    const ranked = extras.ranked;
    const myRank = self ? ranked.indexOf(self) + 1 : 0;
    const ranks: SnakeRank[] = [];
    ranked.forEach((s, i) => {
      if (nextSnakes.has(s.id)) ranks.push({ id: s.id, rank: i + 1 });
    });
    encodeServer(w, {
      t: 'leaderboard',
      myRank,
      total: ranked.length,
      entries: ranked.slice(0, LEADERBOARD_SIZE).map((s) => ({ score: Math.min(s.score, MAX_U24), name: s.name })),
      ranks,
    });
  }
  if (extras.minimap) encodeServer(w, { t: 'minimap', bits: extras.minimap });
  if (extras.death) {
    encodeServer(w, { t: 'death', killerId: extras.death.killerId, finalScore: Math.max(0, Math.min(extras.death.snake.score, MAX_U24)) });
  }

  view.sectors = nextSectors;
  view.snakes = new Set(nextSnakes.keys());
  return w.length > 0 ? w.finish() : null;
}

export function buildMinimap(world: World): Uint8Array {
  const bits = new Uint8Array((MINIMAP_SIZE * MINIMAP_SIZE) / 8);
  const cell = (2 * WORLD_RADIUS) / MINIMAP_SIZE;
  const clamp = (v: number) => Math.max(0, Math.min(MINIMAP_SIZE - 1, Math.floor(v / cell)));
  for (const s of world.snakes.values()) {
    for (const p of [...s.points, { x: s.headX, y: s.headY }]) {
      const idx = clamp(p.y) * MINIMAP_SIZE + clamp(p.x);
      bits[idx >> 3] |= 0x80 >> (idx & 7);
    }
  }
  return bits;
}

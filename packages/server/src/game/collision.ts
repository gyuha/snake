import { sectorCoord, sectorKey } from '@snake/shared';
import type { Snake } from './snake';

export interface BodyEntry {
  snake: Snake;
  x: number;
  y: number;
}

const CELL = 160;

function cellKey(cx: number, cy: number): number {
  return cx * 4096 + cy;
}

/** Rebuilt every tick: a fine grid of body points for collision/probing plus sector → snakes for AOI. */
export class SpatialIndex {
  private readonly cells = new Map<number, BodyEntry[]>();
  private readonly sectorSnakes = new Map<number, Set<Snake>>();
  maxRadius = 0;

  rebuild(snakes: Iterable<Snake>): void {
    this.cells.clear();
    this.sectorSnakes.clear();
    this.maxRadius = 0;
    for (const s of snakes) {
      if (!s.alive) continue;
      this.maxRadius = Math.max(this.maxRadius, s.radius);
      for (const p of s.points) this.insert(s, p.x, p.y);
      this.insert(s, s.headX, s.headY);
    }
  }

  private insert(snake: Snake, x: number, y: number): void {
    const key = cellKey(Math.floor(x / CELL), Math.floor(y / CELL));
    let list = this.cells.get(key);
    if (!list) {
      list = [];
      this.cells.set(key, list);
    }
    list.push({ snake, x, y });

    const sk = sectorKey(sectorCoord(x), sectorCoord(y));
    let set = this.sectorSnakes.get(sk);
    if (!set) {
      set = new Set();
      this.sectorSnakes.set(sk, set);
    }
    set.add(snake);
  }

  forEachNear(x: number, y: number, r: number, cb: (e: BodyEntry) => boolean | void): void {
    const cx0 = Math.floor((x - r) / CELL);
    const cx1 = Math.floor((x + r) / CELL);
    const cy0 = Math.floor((y - r) / CELL);
    const cy1 = Math.floor((y + r) / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const list = this.cells.get(cellKey(cx, cy));
        if (!list) continue;
        for (const e of list) if (cb(e) === true) return;
      }
    }
  }

  snakesInSector(key: number): ReadonlySet<Snake> | undefined {
    return this.sectorSnakes.get(key);
  }
}

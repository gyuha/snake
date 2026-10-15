import {
  FOOD_COLORS, NATURAL_FOOD_VALUE_PER_SIZE, SECTOR_SIZE, TAU, WORLD_RADIUS, foodId, foodPos,
  sectorCoord, sectorKey,
} from '@snake/shared';

export type FoodKind = 'natural' | 'death' | 'boost';

export interface Food {
  id: number;
  sx: number;
  sy: number;
  rx: number;
  ry: number;
  x: number;
  y: number;
  size: number;
  color: number;
  value: number;
  kind: FoodKind;
}

export interface FoodEaten {
  food: Food;
  eaterId: number;
}

function toByte(offset: number): number {
  return Math.max(0, Math.min(255, Math.floor((offset * 256) / SECTOR_SIZE)));
}

export class FoodStore {
  private readonly sectors = new Map<number, Map<number, Food>>();
  naturalCount = 0;
  added: Food[] = [];
  eaten: FoodEaten[] = [];

  constructor(private readonly rng: () => number = Math.random) {}

  add(x: number, y: number, size: number, color: number, value: number, kind: FoodKind): Food | null {
    const dx = x - WORLD_RADIUS;
    const dy = y - WORLD_RADIUS;
    if (dx * dx + dy * dy > WORLD_RADIUS * WORLD_RADIUS) return null;
    const sx = sectorCoord(x);
    const sy = sectorCoord(y);
    const rx = toByte(x - sx * SECTOR_SIZE);
    const ry = toByte(y - sy * SECTOR_SIZE);
    const id = foodId(sx, sy, rx, ry);
    const key = sectorKey(sx, sy);
    let cell = this.sectors.get(key);
    if (!cell) {
      cell = new Map();
      this.sectors.set(key, cell);
    }
    if (cell.has(id)) return null;
    const p = foodPos(sx, sy, rx, ry);
    const food: Food = { id, sx, sy, rx, ry, x: p.x, y: p.y, size, color, value, kind };
    cell.set(id, food);
    if (kind === 'natural') this.naturalCount++;
    this.added.push(food);
    return food;
  }

  remove(food: Food, eaterId: number): void {
    const cell = this.sectors.get(sectorKey(food.sx, food.sy));
    if (!cell || !cell.delete(food.id)) return;
    if (food.kind === 'natural') this.naturalCount--;
    this.eaten.push({ food, eaterId });
  }

  sectorFoods(sx: number, sy: number): Food[] {
    const cell = this.sectors.get(sectorKey(sx, sy));
    return cell ? Array.from(cell.values()) : [];
  }

  queryCircle(x: number, y: number, r: number): Food[] {
    const out: Food[] = [];
    const r2 = r * r;
    const x1 = sectorCoord(x + r);
    const y0 = sectorCoord(y - r);
    const y1 = sectorCoord(y + r);
    for (let sx = sectorCoord(x - r); sx <= x1; sx++) {
      for (let sy = y0; sy <= y1; sy++) {
        const cell = this.sectors.get(sectorKey(sx, sy));
        if (!cell) continue;
        for (const f of cell.values()) {
          const dx = f.x - x;
          const dy = f.y - y;
          if (dx * dx + dy * dy <= r2) out.push(f);
        }
      }
    }
    return out;
  }

  /** Tries up to 2·count random points; returns how many foods were actually placed. */
  spawnNatural(count: number): number {
    let placed = 0;
    for (let i = 0; i < count * 2 && placed < count; i++) {
      const rr = (WORLD_RADIUS - 50) * Math.sqrt(this.rng());
      const a = this.rng() * TAU;
      const size = 1 + Math.floor(this.rng() * 4);
      const color = Math.floor(this.rng() * FOOD_COLORS);
      const f = this.add(
        WORLD_RADIUS + Math.cos(a) * rr,
        WORLD_RADIUS + Math.sin(a) * rr,
        size,
        color,
        size * NATURAL_FOOD_VALUE_PER_SIZE,
        'natural',
      );
      if (f) placed++;
    }
    return placed;
  }

  clearEvents(): void {
    this.added = [];
    this.eaten = [];
  }
}

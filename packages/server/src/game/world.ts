import {
  BOOST_COST, BOOST_DROP_INTERVAL, BOOST_FOOD_SIZE, BOOST_RECYCLE, DEATH_FOOD_SIZE,
  DEATH_FOOD_VALUE, EAT_MARGIN, FOOD_COLORS, FOOD_RESPAWN_PER_TICK, NATURAL_FOOD_TARGET,
  NO_KILLER, SPAWN_CLEARANCE, SPAWN_RADIUS_FRAC, TAU, WORLD_RADIUS, type Vec,
} from '@snake/shared';
import { SpatialIndex } from './collision';
import { FoodStore } from './food';
import { Snake } from './snake';

export interface DeathInfo {
  snake: Snake;
  killerId: number;
}

const MAX_ID = 0xfffe; // 0xffff is NO_KILLER, 0 is never used

export class World {
  readonly snakes = new Map<number, Snake>();
  readonly food: FoodStore;
  readonly index = new SpatialIndex();
  deaths: DeathInfo[] = [];
  private pendingDeaths: DeathInfo[] = [];
  private lastId = 0;

  constructor(private readonly rng: () => number = Math.random, initialFood = NATURAL_FOOD_TARGET) {
    this.food = new FoodStore(rng);
    this.food.spawnNatural(initialFood);
    this.food.clearEvents();
  }

  allocId(): number {
    for (let i = 0; i < MAX_ID; i++) {
      this.lastId = (this.lastId % MAX_ID) + 1;
      if (!this.snakes.has(this.lastId)) return this.lastId;
    }
    throw new Error('no free snake id');
  }

  addSnake(s: Snake): void {
    this.snakes.set(s.id, s);
  }

  spawnSnake(name: string, skin: number, isBot: boolean, animal = 0): Snake {
    const p = this.findSpawn();
    const s = new Snake(this.allocId(), name, skin, isBot, p.x, p.y, this.rng() * TAU, animal);
    this.addSnake(s);
    return s;
  }

  private findSpawn(): Vec {
    let p: Vec = { x: WORLD_RADIUS, y: WORLD_RADIUS };
    const c2 = SPAWN_CLEARANCE * SPAWN_CLEARANCE;
    for (let attempt = 0; attempt < 20; attempt++) {
      const rr = WORLD_RADIUS * SPAWN_RADIUS_FRAC * Math.sqrt(this.rng());
      const a = this.rng() * TAU;
      p = { x: WORLD_RADIUS + Math.cos(a) * rr, y: WORLD_RADIUS + Math.sin(a) * rr };
      const box = { clear: true };
      this.index.forEachNear(p.x, p.y, SPAWN_CLEARANCE, (e) => {
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        if (dx * dx + dy * dy < c2) {
          box.clear = false;
          return true;
        }
        return false;
      });
      if (box.clear) return p;
    }
    return p;
  }

  killSnake(s: Snake, killerId: number): void {
    if (!s.alive) return;
    if (killerId !== NO_KILLER) {
      const killer = this.snakes.get(killerId);
      if (killer) killer.kills++;
    }
    this.removeSnake(s, killerId);
  }

  private removeSnake(s: Snake, killerId: number): void {
    if (!s.alive) return;
    s.alive = false;
    this.snakes.delete(s.id);
    for (const p of s.points) this.dropDeathFood(p.x, p.y, s.skin);
    this.pendingDeaths.push({ snake: s, killerId });
  }

  private dropDeathFood(x: number, y: number, skin: number): void {
    for (let attempt = 0; attempt < 2; attempt++) {
      const jx = x + (this.rng() * 2 - 1) * 10;
      const jy = y + (this.rng() * 2 - 1) * 10;
      if (this.food.add(jx, jy, DEATH_FOOD_SIZE, skin % FOOD_COLORS, DEATH_FOOD_VALUE, 'death')) return;
    }
  }

  tick(dt: number): void {
    const boostValue = BOOST_COST * BOOST_DROP_INTERVAL * BOOST_RECYCLE;
    for (const s of this.snakes.values()) {
      for (const d of s.step(dt)) {
        this.food.add(d.x, d.y, BOOST_FOOD_SIZE, s.skin % FOOD_COLORS, boostValue, 'boost');
      }
    }

    for (const s of this.snakes.values()) {
      for (const f of this.food.queryCircle(s.headX, s.headY, s.radius + EAT_MARGIN)) {
        this.food.remove(f, s.id);
        s.eat(f.value);
      }
    }

    this.index.rebuild(this.snakes.values());
    const hits = this.detectCollisions();
    for (const h of hits) {
      if (h.killerId !== NO_KILLER) {
        const killer = this.snakes.get(h.killerId);
        if (killer) killer.kills++;
      }
    }
    for (const h of hits) this.removeSnake(h.victim, h.killerId);

    const missing = NATURAL_FOOD_TARGET - this.food.naturalCount;
    if (missing > 0) this.food.spawnNatural(Math.min(FOOD_RESPAWN_PER_TICK, missing));

    this.deaths.push(...this.pendingDeaths);
    this.pendingDeaths = [];
  }

  private detectCollisions(): Array<{ victim: Snake; killerId: number }> {
    const out: Array<{ victim: Snake; killerId: number }> = [];
    for (const a of this.snakes.values()) {
      const ra = a.radius;
      if (Math.hypot(a.headX - WORLD_RADIUS, a.headY - WORLD_RADIUS) + ra > WORLD_RADIUS) {
        out.push({ victim: a, killerId: NO_KILLER });
        continue;
      }
      const hit: { by: Snake | null } = { by: null };
      this.index.forEachNear(a.headX, a.headY, 0.6 * ra + this.index.maxRadius, (e) => {
        if (e.snake === a) return false;
        const limit = 0.6 * ra + e.snake.radius;
        const dx = e.x - a.headX;
        const dy = e.y - a.headY;
        if (dx * dx + dy * dy < limit * limit) {
          hit.by = e.snake;
          return true;
        }
        return false;
      });
      if (hit.by) out.push({ victim: a, killerId: hit.by.id });
    }
    return out;
  }

  endTick(): void {
    for (const s of this.snakes.values()) s.clearEvents();
    this.food.clearEvents();
    this.deaths = [];
  }

  leaderboard(): Snake[] {
    return Array.from(this.snakes.values()).sort((a, b) => b.score - a.score);
  }
}

import { describe, expect, it } from 'vitest';
import {
  FOOD_RESPAWN_PER_TICK, NATURAL_FOOD_TARGET, NO_KILLER, SPAWN_CLEARANCE, SPAWN_RADIUS_FRAC,
  TICK_DT, WORLD_RADIUS,
} from '@snake/shared';
import { Snake } from '../src/game/snake';
import { World } from '../src/game/world';
import { seededRng } from './helpers';

const C = WORLD_RADIUS;

function emptyWorld(): World {
  return new World(seededRng(3), 0);
}

function place(w: World, x: number, y: number, ang: number): Snake {
  const s = new Snake(w.allocId(), 'test', 0, false, x, y, ang);
  w.addSnake(s);
  return s;
}

function tick(w: World, n = 1): void {
  for (let i = 0; i < n; i++) {
    w.tick(TICK_DT);
    w.endTick();
  }
}

/** Ticks until `cond` holds, returning the deaths seen; fails after `limit` ticks. */
function tickUntil(w: World, cond: () => boolean, limit: number) {
  const seen: World['deaths'] = [];
  for (let i = 0; i < limit && !cond(); i++) {
    w.tick(TICK_DT);
    seen.push(...w.deaths);
    w.endTick();
  }
  expect(cond()).toBe(true);
  return seen;
}

describe('spawning', () => {
  it('spawns inside 0.7R and away from existing bodies', () => {
    const w = emptyWorld();
    const first = w.spawnSnake('a', 0, false);
    tick(w);
    for (let i = 0; i < 30; i++) {
      const s = w.spawnSnake(`b${i}`, 1, false);
      expect(Math.hypot(s.headX - C, s.headY - C)).toBeLessThanOrEqual(C * SPAWN_RADIUS_FRAC + 1);
      for (const p of first.points) {
        expect(Math.hypot(s.headX - p.x, s.headY - p.y)).toBeGreaterThanOrEqual(SPAWN_CLEARANCE);
      }
      w.killSnake(s, NO_KILLER);
    }
  });

  it('allocates ids cyclically, never 0 or NO_KILLER', () => {
    const w = emptyWorld();
    const a = w.spawnSnake('a', 0, false);
    const b = w.spawnSnake('b', 0, false);
    w.killSnake(a, NO_KILLER);
    const c = w.spawnSnake('c', 0, false);
    expect([a.id, b.id, c.id]).toEqual([1, 2, 3]);
  });
});

describe('eating', () => {
  it('a head eats food within radius + margin', () => {
    const w = emptyWorld();
    const s = place(w, C, C, 0);
    const f = w.food.add(C + 20, C, 2, 0, 0.1, 'natural')!;
    w.tick(TICK_DT);
    expect(w.food.eaten).toEqual([{ food: f, eaterId: s.id }]);
    expect(s.fam).toBeCloseTo(0.1, 12);
    expect(s.famDirty).toBe(true);
    w.endTick();
  });
});

describe('collisions', () => {
  it('head into another body kills the attacker and credits the owner', () => {
    const w = emptyWorld();
    const owner = place(w, C, C, 0);
    const attacker = place(w, owner.tail.x, C - 50, Math.PI / 2);
    const deaths = tickUntil(w, () => !attacker.alive, 20);
    expect(deaths).toEqual([{ snake: attacker, killerId: owner.id }]);
    expect(owner.alive).toBe(true);
    expect(owner.kills).toBe(1);
  });

  it('a snake never collides with its own body', () => {
    const w = emptyWorld();
    const s = place(w, C, C, 0);
    s.eat(20);
    tick(w, 120);
    expect(s.sct).toBeGreaterThan(12);
    for (let i = 0; i < 150; i++) {
      s.setInput(s.ang + 1.5, false);
      tick(w);
    }
    expect(s.alive).toBe(true);
  });

  it('head-on collisions kill both and credit both', () => {
    const w = emptyWorld();
    const a = place(w, C - 100, C, 0);
    const b = place(w, C + 100, C, Math.PI);
    const deaths = tickUntil(w, () => !a.alive || !b.alive, 60);
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(false);
    expect(deaths.map((d) => [d.snake.id, d.killerId]).sort()).toEqual([[a.id, b.id], [b.id, a.id]].sort());
    expect(a.kills).toBe(1);
    expect(b.kills).toBe(1);
  });

  it('crossing the world edge kills with NO_KILLER', () => {
    const w = emptyWorld();
    const s = place(w, 2 * C - 40, C, 0);
    const deaths = tickUntil(w, () => !s.alive, 30);
    expect(deaths).toEqual([{ snake: s, killerId: NO_KILLER }]);
  });
});

describe('death handling', () => {
  it('drops one death food per body point', () => {
    const w = emptyWorld();
    const s = place(w, C, C, 0);
    s.eat(5);
    tick(w, 60);
    const points = s.sct;
    w.killSnake(s, NO_KILLER);
    expect(w.food.added.filter((f) => f.kind === 'death')).toHaveLength(points);
    expect(w.snakes.has(s.id)).toBe(false);
  });

  it('killSnake outside tick is reported in the next tick deaths', () => {
    const w = emptyWorld();
    const s = place(w, C, C, 0);
    w.killSnake(s, NO_KILLER);
    expect(w.deaths).toEqual([]);
    w.tick(TICK_DT);
    expect(w.deaths).toEqual([{ snake: s, killerId: NO_KILLER }]);
    w.endTick();
    expect(w.deaths).toEqual([]);
  });
});

describe('food respawn and tick bookkeeping', () => {
  it('respawns natural food up to the target, capped per tick', () => {
    const w = emptyWorld();
    tick(w);
    expect(w.food.naturalCount).toBe(FOOD_RESPAWN_PER_TICK);
    tick(w, Math.ceil(NATURAL_FOOD_TARGET / FOOD_RESPAWN_PER_TICK) + 5);
    expect(w.food.naturalCount).toBe(NATURAL_FOOD_TARGET);
  });

  it('constructor fills the initial food without leaving add events', () => {
    const w = new World(seededRng(1));
    expect(w.food.naturalCount).toBe(NATURAL_FOOD_TARGET);
    expect(w.food.added).toEqual([]);
  });

  it('endTick clears snake events and food events', () => {
    const w = emptyWorld();
    const s = place(w, C, C, 0);
    s.setInput(1, false);
    tick(w, 20);
    expect(s.events).toEqual([]);
    expect(s.stateDirty).toBe(false);
    expect(w.food.added).toEqual([]);
  });

  it('leaderboard sorts by score descending', () => {
    const w = emptyWorld();
    const small = place(w, C - 500, C, 0);
    const big = place(w, C + 500, C, 0);
    big.eat(10);
    tick(w, 120);
    expect(w.leaderboard()[0]).toBe(big);
    expect(w.leaderboard()[1]).toBe(small);
  });
});

import { describe, expect, it } from 'vitest';
import { NATURAL_FOOD_VALUE_PER_SIZE, WORLD_RADIUS, foodId, foodPos } from '@snake/shared';
import { FoodStore } from '../src/game/food';
import { seededRng } from './helpers';

const C = WORLD_RADIUS;

describe('FoodStore.add', () => {
  it('snaps the position to the sector byte grid and records an add event', () => {
    const store = new FoodStore(seededRng(1));
    const f = store.add(C + 10.3, C + 20.7, 2, 3, 0.1, 'natural')!;
    expect(f).not.toBeNull();
    expect(f.id).toBe(foodId(f.sx, f.sy, f.rx, f.ry));
    expect({ x: f.x, y: f.y }).toEqual(foodPos(f.sx, f.sy, f.rx, f.ry));
    expect(Math.abs(f.x - (C + 10.3))).toBeLessThan(480 / 256);
    expect(store.added).toEqual([f]);
    expect(store.naturalCount).toBe(1);
  });

  it('rejects food outside the world circle', () => {
    const store = new FoodStore();
    expect(store.add(0, 0, 1, 0, 0.05, 'natural')).toBeNull();
    expect(store.add(2 * C - 1, C, 1, 0, 0.05, 'natural')).not.toBeNull();
  });

  it('rejects a second food in the same byte cell', () => {
    const store = new FoodStore();
    expect(store.add(C, C, 1, 0, 0.05, 'natural')).not.toBeNull();
    expect(store.add(C + 0.5, C + 0.5, 1, 0, 0.05, 'death')).toBeNull();
  });
});

describe('FoodStore.remove and query', () => {
  it('remove records the eater once and keeps naturalCount right', () => {
    const store = new FoodStore();
    const f = store.add(C, C, 1, 0, 0.05, 'natural')!;
    store.remove(f, 7);
    store.remove(f, 8);
    expect(store.eaten).toEqual([{ food: f, eaterId: 7 }]);
    expect(store.naturalCount).toBe(0);
    expect(store.sectorFoods(f.sx, f.sy)).toEqual([]);
  });

  it('queryCircle crosses sector boundaries and respects the radius', () => {
    const store = new FoodStore();
    const left = store.add(479 * 16, C, 1, 0, 0.05, 'natural')!; // x = 7664 (sector 15 / 16 boundary is 7680)
    const right = store.add(7690, C, 1, 0, 0.05, 'natural')!;
    const far = store.add(7900, C, 1, 0, 0.05, 'natural')!;
    const hits = store.queryCircle(7680, C, 30);
    expect(hits).toContain(left);
    expect(hits).toContain(right);
    expect(hits).not.toContain(far);
  });

  it('clearEvents empties added and eaten', () => {
    const store = new FoodStore();
    const f = store.add(C, C, 1, 0, 0.05, 'natural')!;
    store.remove(f, 1);
    store.clearEvents();
    expect(store.added).toEqual([]);
    expect(store.eaten).toEqual([]);
  });
});

describe('FoodStore.spawnNatural', () => {
  it('spawns the requested count inside the world with sizes 1..4', () => {
    const store = new FoodStore(seededRng(7));
    expect(store.spawnNatural(4000)).toBe(4000);
    expect(store.naturalCount).toBe(4000);
    for (const f of store.added) {
      expect(Math.hypot(f.x - C, f.y - C)).toBeLessThanOrEqual(WORLD_RADIUS);
      expect(f.size).toBeGreaterThanOrEqual(1);
      expect(f.size).toBeLessThanOrEqual(4);
      expect(f.value).toBeCloseTo(f.size * NATURAL_FOOD_VALUE_PER_SIZE, 12);
      expect(f.kind).toBe('natural');
    }
  });
});

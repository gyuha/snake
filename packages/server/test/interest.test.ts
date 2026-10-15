import { describe, expect, it } from 'vitest';
import {
  BodyReplica, MINIMAP_SIZE, NO_KILLER, SECTORS_PER_EDGE, TICK_DT, WORLD_RADIUS,
  decodeServerFrame, sectorKey, type ServerMsg,
} from '@snake/shared';
import { Snake } from '../src/game/snake';
import { World } from '../src/game/world';
import { buildFrame, buildMinimap, newViewState, visibleSectors, type FrameExtras, type ViewState } from '../src/net/interest';
import { seededRng } from './helpers';

const C = WORLD_RADIUS;

function setup() {
  const world = new World(seededRng(5), 0);
  const view = newViewState();
  const self = new Snake(world.allocId(), 'me', 0, false, C, C, 0);
  world.addSnake(self);
  view.snake = self;
  return { world, view, self };
}

/** One server tick for one viewer; returns decoded messages. */
function step(world: World, view: ViewState, extras: FrameExtras = {}): ServerMsg[] {
  world.tick(TICK_DT);
  const frame = buildFrame(view, world, extras);
  world.endTick();
  return frame ? decodeServerFrame(frame) : [];
}

describe('visibleSectors', () => {
  it('covers a (2k+1)² square at the center', () => {
    expect(visibleSectors(C, C, 1300).size).toBe(49);
  });
  it('clips to the grid and the world circle near the edge', () => {
    const set = visibleSectors(100, C, 1300);
    expect(set.size).toBeLessThan(49);
    for (const key of set) {
      expect(key).toBeGreaterThanOrEqual(0);
      expect(key).toBeLessThan(SECTORS_PER_EDGE * SECTORS_PER_EDGE);
    }
  });
});

describe('first frame', () => {
  it('sends self as snakeAdd and the food of visible sectors', () => {
    const { world, view, self } = setup();
    const food = world.food.add(C + 300, C + 300, 2, 1, 0.1, 'natural')!;
    world.food.clearEvents();
    const msgs = step(world, view);
    const add = msgs.find((m) => m.t === 'snakeAdd');
    expect(add && add.t === 'snakeAdd' && add.id).toBe(self.id);
    const sectorFood = msgs.filter((m) => m.t === 'sectorFood');
    expect(sectorFood.some((m) => m.t === 'sectorFood' && m.sx === food.sx && m.sy === food.sy
      && m.foods.some((f) => f.rx === food.rx && f.ry === food.ry))).toBe(true);
  });

  it('snakeAdd decodes into a replica equal to the server body', () => {
    const { world, view, self } = setup();
    self.eat(4);
    for (let i = 0; i < 60; i++) {
      world.tick(TICK_DT);
      world.endTick();
    }
    const add = step(world, view).find((m) => m.t === 'snakeAdd' && m.id === self.id);
    if (!add || add.t !== 'snakeAdd') throw new Error('missing snakeAdd');
    const replica = new BodyReplica(add.tailX, add.tailY, add.iangs);
    expect(replica.points).toHaveLength(self.points.length);
    replica.points.forEach((p, i) => {
      expect(p.x).toBeCloseTo(self.points[i].x, 9);
      expect(p.y).toBeCloseTo(self.points[i].y, 9);
    });
  });
});

describe('incremental frames', () => {
  it('sends only move events for a visible snake after the first frame', () => {
    const { world, view, self } = setup();
    step(world, view);
    const later: ServerMsg[] = [];
    for (let i = 0; i < 30; i++) later.push(...step(world, view));
    const own = later.filter((m) => 'id' in m && m.id === self.id);
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((m) => m.t === 'snakeMove')).toBe(true);
  });

  it('sends state when input changes and fam when eating', () => {
    const { world, view, self } = setup();
    step(world, view);
    self.setInput(1, false);
    world.food.add(C + 15, C, 2, 0, 0.1, 'natural');
    const msgs = step(world, view);
    expect(msgs.some((m) => m.t === 'snakeState' && m.id === self.id)).toBe(true);
    expect(msgs.some((m) => m.t === 'snakeFam' && m.id === self.id)).toBe(true);
  });

  it('sends foodAdd and foodEat only for sectors that stayed visible', () => {
    const { world, view } = setup();
    step(world, view);
    const f = world.food.add(C + 600, C + 600, 2, 0, 0.1, 'natural')!;
    const added = step(world, view);
    expect(added.some((m) => m.t === 'foodAdd' && m.rx === f.rx && m.ry === f.ry)).toBe(true);
    world.food.remove(f, NO_KILLER);
    const eaten = step(world, view);
    expect(eaten.some((m) => m.t === 'foodEat' && m.rx === f.rx && m.ry === f.ry)).toBe(true);
  });

  it('crossing a sector boundary leaves the old column and loads the new one', () => {
    const { world, view } = setup();
    const ahead = world.food.add(20 * 480 + 10, C, 3, 0, 0.15, 'natural')!; // sector column 20
    step(world, view);
    const msgs: ServerMsg[] = [];
    for (let i = 0; i < 45; i++) msgs.push(...step(world, view));
    expect(msgs.some((m) => m.t === 'sectorLeave' && m.sx === 13)).toBe(true);
    expect(msgs.some((m) => m.t === 'sectorFood' && m.sx === ahead.sx
      && m.foods.some((f) => f.rx === ahead.rx && f.ry === ahead.ry))).toBe(true);
  });
});

describe('other snakes', () => {
  it('adds a snake entering view and removes it with reason 1 when it dies', () => {
    const { world, view } = setup();
    const far = new Snake(world.allocId(), 'far', 1, true, C + 4000, C, Math.PI / 2);
    world.addSnake(far);
    expect(step(world, view).some((m) => m.t === 'snakeAdd' && m.id === far.id)).toBe(false);

    const near = new Snake(world.allocId(), 'near', 2, true, C, C + 600, 0);
    world.addSnake(near);
    expect(step(world, view).some((m) => m.t === 'snakeAdd' && m.id === near.id)).toBe(true);

    world.killSnake(near, NO_KILLER);
    const msgs = step(world, view);
    expect(msgs).toContainEqual({ t: 'snakeRemove', id: near.id, reason: 1 });
  });
});

describe('dense sectors and extras', () => {
  it('splits sector food over 255 into several messages', () => {
    const { world, view } = setup();
    // Sector (17,17) spans 8160..8640, away from the head at (8000, 8000) so nothing gets eaten.
    for (let i = 0; i < 300; i++) {
      world.food.add(8161 + (i % 20) * 20, 8161 + Math.floor(i / 20) * 20, 1, 0, 0.05, 'natural');
    }
    world.food.clearEvents();
    const chunks = step(world, view).filter((m) => m.t === 'sectorFood' && m.sx === 17 && m.sy === 17);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const total = chunks.reduce((n, m) => n + (m.t === 'sectorFood' ? m.foods.length : 0), 0);
    expect(total).toBe(300);
  });

  it('encodes leaderboard rank, death, and minimap when requested', () => {
    const { world, view, self } = setup();
    world.tick(TICK_DT);
    const ranked = world.leaderboard();
    const minimap = buildMinimap(world);
    const frame = buildFrame(view, world, { ranked, minimap, death: { snake: self, killerId: NO_KILLER } });
    world.endTick();
    const msgs = decodeServerFrame(frame!);
    expect(msgs).toContainEqual({ t: 'leaderboard', myRank: 1, total: 1, entries: [{ score: self.score, name: 'me' }] });
    expect(msgs).toContainEqual({ t: 'death', killerId: NO_KILLER, finalScore: self.score });
    expect(msgs.some((m) => m.t === 'minimap')).toBe(true);
  });

  it('buildMinimap sets the bit of each occupied cell', () => {
    const { world, self } = setup();
    const bits = buildMinimap(world);
    expect(bits.length).toBe((MINIMAP_SIZE * MINIMAP_SIZE) / 8);
    const cell = (2 * WORLD_RADIUS) / MINIMAP_SIZE;
    const idx = Math.floor(self.headY / cell) * MINIMAP_SIZE + Math.floor(self.headX / cell);
    expect(bits[idx >> 3] & (0x80 >> (idx & 7))).not.toBe(0);
  });

  it('a viewer without a snake keeps watching its last view center', () => {
    const world = new World(seededRng(9), 0);
    const view = newViewState();
    view.viewX = 200;
    view.viewY = C;
    step(world, view);
    step(world, view);
    expect(view.sectors).toEqual(visibleSectors(200, C, 1300));
    expect(view.sectors.has(sectorKey(0, 16))).toBe(true);
  });
});

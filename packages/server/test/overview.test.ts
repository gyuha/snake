import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import { buildOverview } from '../src/net/overview';
import { seededRng } from './helpers';

describe('buildOverview', () => {
  it('is an empty list for a world without snakes', () => {
    const world = new World(seededRng(1), 0);
    expect(buildOverview(world)).toEqual({ t: 'overview', snakes: [] });
  });

  it('lists every snake sorted by score, descending', () => {
    const world = new World(seededRng(2), 0);
    world.spawnSnake('a', 1, false);
    world.spawnSnake('b', 2, true);
    world.spawnSnake('c', 3, false);
    const msg = buildOverview(world);
    if (msg.t !== 'overview') throw new Error('wrong message');
    expect(msg.snakes.map((s) => s.name).sort()).toEqual(['a', 'b', 'c']);
    for (let i = 1; i < msg.snakes.length; i++) {
      expect(msg.snakes[i - 1]!.score).toBeGreaterThanOrEqual(msg.snakes[i]!.score);
    }
  });

  it('clamps heads that drift outside the world square instead of producing out-of-range values', () => {
    const world = new World(seededRng(3), 0);
    const s = world.spawnSnake('edge', 0, false);
    s.headX = -40;
    s.headY = 16050;
    const msg = buildOverview(world);
    if (msg.t !== 'overview') throw new Error('wrong message');
    expect(msg.snakes[0]).toMatchObject({ id: s.id, skin: 0, name: 'edge', x: 0, y: 0xffff });
  });
});

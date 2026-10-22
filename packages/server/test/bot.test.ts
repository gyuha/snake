import { describe, expect, it } from 'vitest';
import { ANIMAL_COUNT, DEATH_FOOD_VALUE, NO_KILLER, TICK_DT, WORLD_RADIUS, angleDiff, quantizeAngle16 } from '@snake/shared';
import { BotController, decide, type Brain } from '../src/bots/bot';
import { Snake } from '../src/game/snake';
import { World } from '../src/game/world';
import { seededRng } from './helpers';

const C = WORLD_RADIUS;

function emptyWorld(): World {
  return new World(seededRng(21), 0);
}

function brain(): Brain {
  return { wanderAngle: 0, wanderLeft: 0 };
}

function placeBot(w: World, x: number, y: number, ang: number): Snake {
  const s = new Snake(w.allocId(), 'bot', 0, true, x, y, ang);
  w.addSnake(s);
  return s;
}

describe('BotController', () => {
  it('fills up to the target and replaces dead bots', () => {
    const w = emptyWorld();
    const bots = new BotController(5, seededRng(1));
    bots.update(w, 0);
    expect(bots.count).toBe(5);
    expect([...w.snakes.values()].every((s) => s.isBot)).toBe(true);
    const victim = w.snakes.values().next().value as Snake;
    w.killSnake(victim, NO_KILLER);
    bots.update(w, 1);
    expect(bots.count).toBe(5);
    expect(w.snakes.has(victim.id)).toBe(false);
    expect(w.snakes.size).toBe(5);
  });

  it('follows a new target on the next update once the world has been cleared', () => {
    const w = emptyWorld();
    const bots = new BotController(5, seededRng(1));
    bots.update(w, 0);
    w.clearSnakes();
    bots.setTarget(2);
    bots.update(w, 1);
    expect(bots.count).toBe(2);
    expect(w.snakes.size).toBe(2);
    w.clearSnakes();
    bots.setTarget(0);
    bots.update(w, 2);
    expect(bots.count).toBe(0);
  });

  it('gives each bot an animal within range', () => {
    const w = emptyWorld();
    new BotController(20, seededRng(3)).update(w, 0);
    for (const s of w.snakes.values()) {
      expect(Number.isInteger(s.animal)).toBe(true);
      expect(s.animal).toBeGreaterThanOrEqual(0);
      expect(s.animal).toBeLessThan(ANIMAL_COUNT);
    }
  });
});

describe('decide', () => {
  it('turns toward the center near the world edge', () => {
    const w = emptyWorld();
    const s = placeBot(w, 2 * C - 300, C, 0);
    const d = decide(w, s, brain(), seededRng(2));
    expect(Math.abs(angleDiff(Math.PI, d.wang))).toBeLessThan(0.01);
    expect(d.boost).toBe(false);
  });

  it('ignores food in the edge band so it does not oscillate at the margin', () => {
    const w = emptyWorld();
    const s = placeBot(w, 2 * C - 700, C, 0);
    w.food.add(2 * C - 300, C, 8, 0, DEATH_FOOD_VALUE, 'death');
    w.index.rebuild(w.snakes.values());
    const d = decide(w, s, { wanderAngle: Math.PI, wanderLeft: 5 }, seededRng(5));
    expect(Math.abs(angleDiff(Math.PI, d.wang))).toBeLessThan(0.01);
  });

  it('steers away from a body directly ahead', () => {
    const w = emptyWorld();
    const s = placeBot(w, C, C, 0);
    const wall = new Snake(w.allocId(), 'wall', 1, false, C + 80, C + 120, Math.PI / 2);
    wall.points = Array.from({ length: 13 }, (_, i) => ({ x: C + 80, y: C - 120 + i * 20, iang: quantizeAngle16(Math.PI / 2) }));
    wall.headX = C + 80;
    wall.headY = C + 120;
    w.addSnake(wall);
    w.index.rebuild(w.snakes.values());
    const d = decide(w, s, brain(), seededRng(3));
    expect(Math.abs(angleDiff(0, d.wang))).toBeGreaterThanOrEqual(Math.PI / 4);
    expect(d.boost).toBe(false);
  });

  it('heads for the most valuable nearby food', () => {
    const w = emptyWorld();
    const s = placeBot(w, C, C, 0);
    w.food.add(C + 100, C + 100, 8, 0, DEATH_FOOD_VALUE, 'death');
    w.food.add(C - 400, C, 1, 0, 0.05, 'natural');
    w.index.rebuild(w.snakes.values());
    const d = decide(w, s, brain(), seededRng(4));
    expect(d.wang).toBeCloseTo(Math.PI / 4, 1);
  });

  it('boosts toward a rich pile of death food when long enough', () => {
    const w = emptyWorld();
    const s = placeBot(w, C, C, 0);
    s.eat(6);
    for (let i = 0; i < 90; i++) s.step(TICK_DT);
    s.clearEvents();
    for (let i = 0; i < 3; i++) w.food.add(s.headX + 100 + i * 15, s.headY + 30, 8, 0, DEATH_FOOD_VALUE, 'death');
    w.index.rebuild(w.snakes.values());
    expect(decide(w, s, brain(), seededRng(5)).boost).toBe(true);
  });

  it('wanders when there is nothing to do', () => {
    const w = emptyWorld();
    const s = placeBot(w, C, C, 0);
    w.index.rebuild(w.snakes.values());
    const b = brain();
    const d = decide(w, s, b, seededRng(6));
    expect(d.wang).toBe(b.wanderAngle);
    expect(b.wanderLeft).toBeGreaterThanOrEqual(2);
    expect(b.wanderLeft).toBeLessThanOrEqual(4);
  });
});

describe('bot survival (spec §12)', () => {
  it('bots never die at the world edge over 60 simulated seconds', () => {
    const w = new World(seededRng(77));
    const bots = new BotController(5, seededRng(78));
    let edgeDeaths = 0;
    for (let t = 0; t < 60 * 30; t++) {
      bots.update(w, t);
      w.tick(TICK_DT);
      edgeDeaths += w.deaths.filter((d) => d.killerId === NO_KILLER).length;
      w.endTick();
    }
    expect(edgeDeaths).toBe(0);
  });
});

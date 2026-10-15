import { describe, expect, it } from 'vitest';
import {
  BOOST_DROP_INTERVAL, BodyReplica, FAM_CAP, MAX_SEGMENTS, SEG_SPACING, START_SEGMENTS, TAU,
  TICK_DT, maxTurnRate, nextPoint, speedOf,
} from '@snake/shared';
import { Snake, type SnakeEvent } from '../src/game/snake';
import { seededRng } from './helpers';

function run(s: Snake, ticks: number): { events: SnakeEvent[]; drops: number } {
  const events: SnakeEvent[] = [];
  let drops = 0;
  for (let i = 0; i < ticks; i++) {
    drops += s.step(TICK_DT).length;
    events.push(...s.events);
    s.clearEvents();
  }
  return { events, drops };
}

function applyEvents(b: BodyReplica, events: SnakeEvent[]): void {
  for (const e of events) {
    if (e.k === 'move') b.applyMove(e.iang);
    else if (e.k === 'grow') b.applyGrow(e.iang);
    else b.applyShrink();
  }
}

describe('Snake construction', () => {
  it('creates START_SEGMENTS points chained by nextPoint, head at (x, y)', () => {
    const s = new Snake(1, 'a', 0, false, 5000, 6000, 1.0);
    expect(s.sct).toBe(START_SEGMENTS);
    for (let i = 1; i < s.points.length; i++) {
      const n = nextPoint(s.points[i - 1], s.points[i].iang);
      expect(s.points[i].x).toBe(n.x);
      expect(s.points[i].y).toBe(n.y);
    }
    expect(s.lastPoint.x).toBeCloseTo(5000, 6);
    expect(s.lastPoint.y).toBeCloseTo(6000, 6);
  });
});

describe('Snake movement', () => {
  it('moves at speedOf units per second in a straight line', () => {
    const s = new Snake(1, 'a', 0, false, 5000, 5000, 0);
    run(s, 30);
    expect(s.headX - 5000).toBeCloseTo(speedOf(START_SEGMENTS, false), 6);
  });

  it('commits one point per SEG_SPACING travelled and keeps length without food', () => {
    const s = new Snake(1, 'a', 0, false, 5000, 5000, 0);
    const { events } = run(s, 30);
    expect(events).toHaveLength(Math.floor(speedOf(START_SEGMENTS, false) / SEG_SPACING));
    expect(events.every((e) => e.k === 'move')).toBe(true);
    expect(s.sct).toBe(START_SEGMENTS);
  });

  it('limits turning to maxTurnRate per second', () => {
    const s = new Snake(1, 'a', 0, false, 5000, 5000, 0);
    s.setInput(Math.PI / 2, false);
    expect(s.stateDirty).toBe(true);
    s.step(TICK_DT);
    expect(s.ang).toBeCloseTo(maxTurnRate(START_SEGMENTS, false) * TICK_DT, 9);
  });
});

describe('Snake growth and boost', () => {
  it('eating one segment worth of fam grows on the next commit', () => {
    const s = new Snake(1, 'a', 0, false, 5000, 5000, 0);
    s.eat(1);
    expect(s.famDirty).toBe(true);
    const { events } = run(s, 15);
    expect(events.filter((e) => e.k === 'grow')).toHaveLength(1);
    expect(s.sct).toBe(START_SEGMENTS + 1);
    expect(s.fam).toBeCloseTo(0, 9);
  });

  it('refuses to boost at START_SEGMENTS', () => {
    const s = new Snake(1, 'a', 0, false, 5000, 5000, 0);
    s.setInput(0, true);
    s.step(TICK_DT);
    expect(s.boosting).toBe(false);
  });

  it('boost speeds up, shrinks the tail, and drops food every interval', () => {
    const s = new Snake(1, 'a', 0, false, 5000, 5000, 0);
    s.eat(6);
    run(s, 90);
    const before = s.sct;
    expect(before).toBe(START_SEGMENTS + 6);
    s.setInput(0, true);
    const { events, drops } = run(s, 60);
    expect(s.boosting).toBe(true);
    expect(events.some((e) => e.k === 'shrink')).toBe(true);
    expect(s.sct).toBeLessThan(before);
    // 60 ticks of 1/30 s accumulate float error, so one boundary drop may land on either side.
    expect(drops).toBeGreaterThanOrEqual(Math.floor(2 / BOOST_DROP_INTERVAL) - 1);
    expect(drops).toBeLessThanOrEqual(Math.floor(2 / BOOST_DROP_INTERVAL));
  });

  it('stops boosting when it reaches START_SEGMENTS', () => {
    const s = new Snake(1, 'a', 0, false, 5000, 5000, 0);
    s.eat(1);
    run(s, 15);
    s.setInput(0, true);
    run(s, 300);
    expect(s.sct).toBe(START_SEGMENTS);
    expect(s.boosting).toBe(false);
    expect(s.fam).toBeGreaterThanOrEqual(0);
  });

  it('caps length at MAX_SEGMENTS and fam at FAM_CAP', () => {
    const s = new Snake(1, 'a', 0, false, 8000, 8000, 0);
    for (let i = 0; i < 4000 && s.sct < MAX_SEGMENTS; i++) {
      s.eat(1);
      s.setInput(s.ang + 0.3, false);
      run(s, 15);
    }
    expect(s.sct).toBe(MAX_SEGMENTS);
    s.eat(10);
    run(s, 60);
    expect(s.sct).toBe(MAX_SEGMENTS);
    expect(s.fam).toBeLessThanOrEqual(FAM_CAP);
  });
});

describe('client reconstruction stays in sync (spec §1 criterion 4)', () => {
  it('replicas built from events match server points within 1e-3', () => {
    const rng = seededRng(42);
    const s = new Snake(1, 'a', 0, false, 8000, 8000, 0);
    const snap0 = s.addSnapshot();
    const fromStart = new BodyReplica(snap0.tailX, snap0.tailY, snap0.iangs);
    let lateJoiner: BodyReplica | null = null;

    for (let i = 0; i < 1000; i++) {
      if (i % 20 === 0) s.setInput(rng() * TAU, rng() < 0.3);
      if (i % 7 === 0) s.eat(rng() * 0.6);
      s.step(TICK_DT);
      applyEvents(fromStart, s.events);
      if (lateJoiner) applyEvents(lateJoiner, s.events);
      s.clearEvents();
      if (i === 500) {
        const snap = s.addSnapshot();
        lateJoiner = new BodyReplica(snap.tailX, snap.tailY, snap.iangs);
      }
    }

    for (const replica of [fromStart, lateJoiner!]) {
      expect(replica.points).toHaveLength(s.points.length);
      replica.points.forEach((p, i) => {
        expect(Math.abs(p.x - s.points[i].x)).toBeLessThanOrEqual(1e-3);
        expect(Math.abs(p.y - s.points[i].y)).toBeLessThanOrEqual(1e-3);
      });
    }
  });
});

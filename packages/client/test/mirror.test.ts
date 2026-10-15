import { describe, expect, it } from 'vitest';
import {
  SEG_SPACING, foodId, foodPos, maxTurnRate, quantizeAngle16, sectorKey, speedOf, toWireFam,
  toWireSpeed, type ServerMsg,
} from '@snake/shared';
import { Mirror } from '../src/state/mirror';

const q0 = quantizeAngle16(0);

function addMsg(id: number, speedUnits = speedOf(3, false)): ServerMsg {
  return {
    t: 'snakeAdd', id, name: `s${id}`, skin: 1, ang: q0, wang: q0, speed: toWireSpeed(speedUnits),
    fam: toWireFam(0.25), tailX: 1000, tailY: 2000, iangs: [q0, q0],
  };
}

function headDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('snakes', () => {
  it('snakeAdd rebuilds the body and reads state', () => {
    const m = new Mirror();
    m.apply(addMsg(5));
    const s = m.snakes.get(5)!;
    expect(s.body.points).toHaveLength(3);
    expect(s.body.head.x).toBeCloseTo(1000 + 2 * SEG_SPACING, 9);
    expect(s.fam).toBeCloseTo(0.25, 4);
    expect(s.boosting).toBe(false);
    m.apply(addMsg(6, 375));
    expect(m.snakes.get(6)!.boosting).toBe(true);
  });

  it('advance extrapolates the head at the snake speed, capped at 1.5 segments', () => {
    const m = new Mirror();
    m.apply(addMsg(5));
    const s = m.snakes.get(5)!;
    m.advance(0.1);
    expect(m.headOf(s).x - s.body.head.x).toBeCloseTo(speedOf(3, false) * 0.1, 6);
    m.advance(5);
    expect(m.headOf(s).x - s.body.head.x).toBeCloseTo(1.5 * SEG_SPACING, 6);
  });

  it('advance turns toward wang no faster than maxTurnRate', () => {
    const m = new Mirror();
    m.apply(addMsg(5));
    m.apply({ t: 'snakeState', id: 5, ang: q0, wang: quantizeAngle16(Math.PI / 2), speed: toWireSpeed(speedOf(3, false)) });
    m.advance(0.05);
    expect(m.snakes.get(5)!.ang).toBeCloseTo(maxTurnRate(3, false) * 0.05, 6);
  });

  it('applying a move keeps the visual head continuous, then the correction decays', () => {
    const m = new Mirror();
    m.apply(addMsg(5));
    const s = m.snakes.get(5)!;
    m.advance(0.3);
    const before = m.headOf(s);
    m.apply({ t: 'snakeMove', id: 5, iang: quantizeAngle16(0.3) });
    expect(headDistance(before, m.headOf(s))).toBeLessThan(1e-9);
    expect(s.body.points).toHaveLength(3);
    m.advance(0.2);
    expect(Math.hypot(s.corrX, s.corrY)).toBeLessThan(1e-9);
  });

  it('grow keeps the tail and updates fam; shrink drops the tail', () => {
    const m = new Mirror();
    m.apply(addMsg(5));
    m.apply({ t: 'snakeGrow', id: 5, iang: q0, fam: toWireFam(0.1) });
    const s = m.snakes.get(5)!;
    expect(s.body.points).toHaveLength(4);
    expect(s.fam).toBeCloseTo(0.1, 4);
    m.apply({ t: 'snakeShrink', id: 5, fam: toWireFam(0.9) });
    expect(s.body.points).toHaveLength(3);
    expect(s.fam).toBeCloseTo(0.9, 4);
  });

  it('boosting snakes lose fam locally between server updates', () => {
    const m = new Mirror();
    m.apply(addMsg(5, 375));
    m.advance(0.1);
    expect(m.snakes.get(5)!.fam).toBeLessThan(0.25);
  });

  it('events for unknown snakes are ignored and snakeRemove deletes', () => {
    const m = new Mirror();
    m.apply({ t: 'snakeMove', id: 99, iang: 0 });
    m.apply(addMsg(5));
    m.apply({ t: 'snakeRemove', id: 5, reason: 0 });
    expect(m.snakes.size).toBe(0);
  });
});

describe('self prediction', () => {
  it('setLocalWang steers immediately and stale server wang does not override it', () => {
    const m = new Mirror();
    m.apply({ t: 'welcome', selfId: 5, worldRadius: 8000, sectorSize: 480, segSpacing: 42, tickHz: 30, mscps: 411, maxSegments: 300 });
    m.apply(addMsg(5));
    m.setLocalWang(1.0);
    m.apply({ t: 'snakeState', id: 5, ang: q0, wang: q0, speed: toWireSpeed(375) });
    const self = m.selfSnake()!;
    expect(self.wang).toBeCloseTo(1.0, 12);
    expect(self.boosting).toBe(true);
  });

  it('other snakes take wang from snakeState', () => {
    const m = new Mirror();
    m.apply(addMsg(7));
    m.apply({ t: 'snakeState', id: 7, ang: q0, wang: quantizeAngle16(2), speed: toWireSpeed(speedOf(3, false)) });
    expect(m.snakes.get(7)!.wang).toBeCloseTo(2, 3);
  });
});

describe('food', () => {
  it('sectorFood, foodAdd, foodEat and sectorLeave keep the food map in sync', () => {
    const m = new Mirror();
    m.apply({ t: 'sectorFood', sx: 3, sy: 4, foods: [{ rx: 10, ry: 20, size: 2, color: 1 }, { rx: 11, ry: 21, size: 3, color: 2 }] });
    m.apply({ t: 'sectorFood', sx: 5, sy: 5, foods: [{ rx: 0, ry: 0, size: 1, color: 0 }] });
    const id = foodId(3, 4, 10, 20);
    expect(m.foods.get(id)).toEqual({ id, sector: sectorKey(3, 4), ...foodPos(3, 4, 10, 20), size: 2, color: 1 });

    m.apply({ t: 'foodEat', sx: 3, sy: 4, rx: 10, ry: 20, eaterId: 1 });
    expect(m.foods.has(id)).toBe(false);
    m.apply({ t: 'foodAdd', sx: 3, sy: 4, rx: 12, ry: 22, size: 1, color: 3 });
    expect(m.foods.has(foodId(3, 4, 12, 22))).toBe(true);

    m.apply({ t: 'sectorLeave', sx: 3, sy: 4 });
    expect([...m.foods.values()].map((f) => f.sector)).toEqual([sectorKey(5, 5)]);
  });
});

describe('session messages', () => {
  it('stores leaderboard, minimap and death; welcome clears death; reset clears all', () => {
    const m = new Mirror();
    m.apply({ t: 'leaderboard', myRank: 2, total: 9, entries: [{ score: 50, name: 'x' }] });
    m.apply({ t: 'minimap', bits: new Uint8Array(512) });
    m.apply({ t: 'death', killerId: 3, finalScore: 120 });
    expect(m.leaderboard?.myRank).toBe(2);
    expect(m.minimap).not.toBeNull();
    expect(m.death).toEqual({ killerId: 3, finalScore: 120 });
    m.apply({ t: 'welcome', selfId: 8, worldRadius: 8000, sectorSize: 480, segSpacing: 42, tickHz: 30, mscps: 411, maxSegments: 300 });
    expect(m.death).toBeNull();
    expect(m.selfId).toBe(8);
    m.apply(addMsg(8));
    m.reset();
    expect(m.snakes.size).toBe(0);
    expect(m.selfId).toBe(-1);
  });

  it('tailFraction tracks progress through the current segment', () => {
    const m = new Mirror();
    m.apply(addMsg(5));
    const s = m.snakes.get(5)!;
    expect(m.tailFraction(s)).toBe(0);
    m.advance(SEG_SPACING / 2 / speedOf(3, false));
    expect(m.tailFraction(s)).toBeCloseTo(0.5, 6);
    m.advance(10);
    expect(m.tailFraction(s)).toBe(1);
  });
});

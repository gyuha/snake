import { describe, expect, it } from 'vitest';
import {
  SEG_SPACING, TAU, angleDiff, bodyRadius, dequantizeAngle16, foodId, foodPos, maxTurnRate,
  nextPoint, quantizeAngle16, quantizeAngle8, score, sectorCoord, sectorKey, sizeScale,
  speedOf, turnToward, viewRadius, dequantizeAngle8,
} from '../src/index';

describe('size and speed formulas (spec §2.1)', () => {
  it('sizeScale follows the original curve and caps at 6', () => {
    expect(sizeScale(2)).toBe(1);
    expect(sizeScale(108)).toBe(2);
    expect(sizeScale(10000)).toBe(6);
  });
  it('speedOf converts sp to units per second', () => {
    expect(speedOf(2, false)).toBeCloseTo(4.75 * 31.25, 6);
    expect(speedOf(2, true)).toBe(375);
  });
  it('maxTurnRate = 4.125 * scang * min(1, sp/4.8)', () => {
    expect(maxTurnRate(2, false)).toBeCloseTo(4.125 * (4.75 / 4.8), 6);
    expect(maxTurnRate(2, true)).toBeCloseTo(4.125, 6);
    expect(maxTurnRate(300, false)).toBeLessThan(maxTurnRate(2, false));
  });
  it('bodyRadius is 14 * sc', () => {
    expect(bodyRadius(2)).toBe(14);
    expect(bodyRadius(108)).toBe(28);
  });
});

describe('score (spec §5.1 check values)', () => {
  it.each([
    [2, 10], [10, 133], [100, 2029], [300, 20245],
  ])('score(%i, 0) = %i', (sct, expected) => {
    expect(score(sct, 0)).toBe(expected);
  });
  it('caps segments at MAX_SEGMENTS', () => {
    expect(score(400, 0)).toBe(score(300, 0));
  });
  it('fam adds fractional score and is clamped to [0,1]', () => {
    expect(score(10, 0.5)).toBeGreaterThan(score(10, 0));
    expect(score(10, 5)).toBe(score(10, 1));
  });
});

describe('angles', () => {
  it('quantize16 round trip error is at most half a step', () => {
    for (let i = 0; i < 1000; i++) {
      const a = (i / 1000) * TAU * 3 - TAU;
      const back = dequantizeAngle16(quantizeAngle16(a));
      expect(Math.abs(angleDiff(a, back))).toBeLessThanOrEqual(TAU / 65536 / 2 + 1e-12);
    }
  });
  it('quantize wraps at 2π', () => {
    expect(quantizeAngle16(TAU - 1e-9)).toBe(0);
    expect(quantizeAngle8(TAU - 1e-9)).toBe(0);
    expect(dequantizeAngle8(64)).toBeCloseTo(Math.PI / 2, 12);
  });
  it('angleDiff returns the shortest signed difference', () => {
    expect(angleDiff(0.1, TAU - 0.1)).toBeCloseTo(-0.2, 12);
    expect(angleDiff(TAU - 0.1, 0.1)).toBeCloseTo(0.2, 12);
  });
  it('turnToward clamps to maxDelta and takes the short way', () => {
    expect(turnToward(0, 1, 0.5)).toBeCloseTo(0.5, 12);
    expect(turnToward(0, 0.2, 0.5)).toBeCloseTo(0.2, 12);
    expect(turnToward(0.1, TAU - 0.1, 0.05)).toBeCloseTo(0.05, 12);
  });
});

describe('geometry helpers', () => {
  it('nextPoint moves exactly SEG_SPACING', () => {
    const p = nextPoint({ x: 100, y: 200 }, quantizeAngle16(1.234));
    expect(Math.hypot(p.x - 100, p.y - 200)).toBeCloseTo(SEG_SPACING, 9);
  });
  it('sectorCoord clamps to the grid', () => {
    expect(sectorCoord(-5)).toBe(0);
    expect(sectorCoord(480)).toBe(1);
    expect(sectorCoord(99999)).toBe(33);
  });
  it('sectorKey and foodId pack coordinates', () => {
    expect(sectorKey(2, 3)).toBe(2 * 34 + 3);
    expect(foodId(33, 33, 255, 255)).toBe(0x2121ffff);
  });
  it('foodPos maps sector-relative bytes to world units', () => {
    expect(foodPos(1, 2, 128, 0)).toEqual({ x: 720, y: 960 });
  });
  it('viewRadius grows with size', () => {
    expect(viewRadius(2)).toBe(1300);
    expect(viewRadius(300)).toBeGreaterThan(1300);
  });
});

import { describe, expect, it } from 'vitest';
import { WORLD_RADIUS } from '@snake/shared';
import { fitWorld, rankStyle, worldToScreen } from '../src/ui/overview-layout';

describe('overview layout', () => {
  it('centers the world circle in a non-square area using the shorter side', () => {
    const l = fitWorld(800, 400, 20);
    expect(l.cx).toBe(400);
    expect(l.cy).toBe(200);
    expect(l.radius).toBe(180);
    expect(l.scale).toBeCloseTo(180 / WORLD_RADIUS);
  });

  it('maps the world center to the circle center and the edge to the circle edge', () => {
    const l = fitWorld(600, 600, 0);
    expect(worldToScreen(l, WORLD_RADIUS, WORLD_RADIUS)).toEqual({ x: 300, y: 300 });
    const east = worldToScreen(l, 2 * WORLD_RADIUS, WORLD_RADIUS);
    expect(east.x).toBeCloseTo(600);
    expect(east.y).toBeCloseTo(300);
    const north = worldToScreen(l, WORLD_RADIUS, 0);
    expect(north.x).toBeCloseTo(300);
    expect(north.y).toBeCloseTo(0);
  });

  it('never produces a non-positive radius when the area is smaller than the margin', () => {
    const l = fitWorld(100, 100, 80);
    expect(l.radius).toBe(1);
    expect(l.scale).toBeGreaterThan(0);
  });
});

describe('rankStyle', () => {
  it('makes the top three progressively smaller, with gold, silver and bronze rings', () => {
    const [first, second, third] = [0, 1, 2].map(rankStyle);
    expect(first!.dotRadius).toBeGreaterThan(second!.dotRadius);
    expect(second!.dotRadius).toBeGreaterThan(third!.dotRadius);
    expect(first!.labelPx).toBeGreaterThan(second!.labelPx);
    expect(second!.labelPx).toBeGreaterThan(third!.labelPx);
    expect(new Set([first!.ring, second!.ring, third!.ring]).size).toBe(3);
    expect([first, second, third].every((s) => s!.ring !== null && s!.bold)).toBe(true);
  });

  it('keeps every snake from fourth place on at the plain default', () => {
    const fourth = rankStyle(3);
    expect(fourth).toEqual(rankStyle(30));
    expect(fourth).toEqual({ dotRadius: 5, labelPx: 11, ring: null, bold: false });
    expect(rankStyle(2).dotRadius).toBeGreaterThan(fourth.dotRadius);
    expect(rankStyle(2).labelPx).toBeGreaterThan(fourth.labelPx);
  });
});

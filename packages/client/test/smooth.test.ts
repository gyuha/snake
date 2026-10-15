import { describe, expect, it } from 'vitest';
import { traceSmooth } from '../src/render/smooth';

type Call = [string, ...number[]];
type P = { x: number; y: number };

function record(pts: P[]): Call[] {
  const calls: Call[] = [];
  traceSmooth(
    {
      moveTo: (x, y) => calls.push(['M', x, y]),
      lineTo: (x, y) => calls.push(['L', x, y]),
      bezierCurveTo: (c1x, c1y, c2x, c2y, x, y) => calls.push(['B', c1x, c1y, c2x, c2y, x, y]),
    },
    pts,
  );
  return calls;
}

describe('traceSmooth (Catmull-Rom through every point)', () => {
  it('draws nothing for no points and only a move for one point', () => {
    expect(record([])).toEqual([]);
    expect(record([{ x: 1, y: 2 }])).toEqual([['M', 1, 2]]);
  });

  it('two points are a straight line', () => {
    expect(record([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toEqual([['M', 0, 0], ['L', 10, 0]]);
  });

  it('passes through every input point, in order', () => {
    const pts = Array.from({ length: 9 }, (_, i) => ({ x: i * 42, y: Math.sin(i * 0.9) * 40 }));
    const calls = record(pts);
    expect(calls[0]).toEqual(['M', pts[0].x, pts[0].y]);
    const ends = calls.slice(1).map((c) => [c[c.length - 2], c[c.length - 1]]);
    expect(ends).toEqual(pts.slice(1).map((p) => [p.x, p.y]));
  });

  it('collinear points stay on the line (no wobble)', () => {
    const calls = record([{ x: 0, y: 0 }, { x: 42, y: 0 }, { x: 84, y: 0 }, { x: 126, y: 0 }]);
    for (const c of calls) {
      for (let i = 2; i < c.length; i += 2) expect(c[i]).toBe(0);
    }
  });

  it('has a continuous tangent at every joint (no visible kink)', () => {
    const pts = Array.from({ length: 10 }, (_, i) => ({ x: i * 42, y: Math.sin(i * 1.3) * 50 }));
    const curves = record(pts).filter((c) => c[0] === 'B') as number[][];
    for (let i = 0; i + 1 < curves.length; i++) {
      const a = curves[i];
      const b = curves[i + 1];
      const joint = { x: a[5], y: a[6] };
      const inDir = { x: joint.x - a[3], y: joint.y - a[4] };
      const outDir = { x: b[1] - joint.x, y: b[2] - joint.y };
      const cross = inDir.x * outDir.y - inDir.y * outDir.x;
      const dot = inDir.x * outDir.x + inDir.y * outDir.y;
      expect(Math.abs(cross)).toBeLessThan(1e-6);
      expect(dot).toBeGreaterThan(0);
    }
  });

  it('a right-angle corner is rounded: the curve bulges inside the corner point', () => {
    const calls = record([{ x: 0, y: 0 }, { x: 42, y: 0 }, { x: 42, y: 42 }, { x: 42, y: 84 }]);
    // The first curve ends at the corner (42, 0); its second control point is pulled back along the incoming side.
    const first = calls[1];
    expect(first[0]).toBe('B');
    expect(first[3]).toBeLessThan(42);
  });
});

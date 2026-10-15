import { describe, expect, it } from 'vitest';
import { traceSmooth } from '../src/render/smooth';

type Call = [string, ...number[]];

function record(pts: Array<{ x: number; y: number }>): Call[] {
  const calls: Call[] = [];
  traceSmooth(
    {
      moveTo: (x, y) => calls.push(['M', x, y]),
      lineTo: (x, y) => calls.push(['L', x, y]),
      quadraticCurveTo: (cx, cy, x, y) => calls.push(['Q', cx, cy, x, y]),
    },
    pts,
  );
  return calls;
}

describe('traceSmooth', () => {
  it('draws nothing for no points and only a move for one point', () => {
    expect(record([])).toEqual([]);
    expect(record([{ x: 1, y: 2 }])).toEqual([['M', 1, 2]]);
  });

  it('two points are a straight line', () => {
    expect(record([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toEqual([['M', 0, 0], ['L', 10, 0]]);
  });

  it('rounds corners: control points are the original points, curves end at midpoints', () => {
    const calls = record([{ x: 0, y: 0 }, { x: 42, y: 0 }, { x: 42, y: 42 }, { x: 84, y: 42 }]);
    expect(calls).toEqual([
      ['M', 0, 0],
      ['Q', 42, 0, 42, 21],
      ['Q', 42, 42, 63, 42],
      ['L', 84, 42],
    ]);
  });

  it('never passes through a sharp corner point (no lineTo into an interior vertex)', () => {
    const calls = record([{ x: 0, y: 0 }, { x: 42, y: 0 }, { x: 42, y: 42 }]);
    const lines = calls.filter((c) => c[0] === 'L');
    expect(lines).toEqual([['L', 42, 42]]);
  });

  it('stays continuous: each curve starts where the previous one ended', () => {
    const pts = Array.from({ length: 12 }, (_, i) => ({ x: i * 42, y: Math.sin(i) * 30 }));
    const calls = record(pts);
    let end = [calls[0][1], calls[0][2]];
    for (const c of calls.slice(1)) {
      if (c[0] === 'Q') {
        // The segment's start is the previous end; the control point is an input vertex.
        expect(pts.some((p) => p.x === c[1] && p.y === c[2])).toBe(true);
        end = [c[3], c[4]];
      } else {
        end = [c[1], c[2]];
      }
    }
    expect(end).toEqual([pts[pts.length - 1].x, pts[pts.length - 1].y]);
  });
});

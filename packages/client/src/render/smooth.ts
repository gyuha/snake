import type { Vec } from '@snake/shared';

export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
}

/**
 * Traces a Catmull-Rom spline through every snake body point. Body points are 42 units apart while a
 * body is 28+ units wide and turns tightly, so straight segments show every turn as a kink and a
 * curve that cuts corners looks flat. A spline that passes through each point keeps the tangent
 * continuous at joints and follows the turn.
 */
export function traceSmooth(path: PathSink, pts: readonly Vec[]): void {
  const n = pts.length;
  if (n === 0) return;
  path.moveTo(pts[0].x, pts[0].y);
  if (n === 1) return;
  if (n === 2) {
    path.lineTo(pts[1].x, pts[1].y);
    return;
  }
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, n - 1)];
    path.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
    );
  }
}

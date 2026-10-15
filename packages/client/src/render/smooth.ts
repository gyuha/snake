import type { Vec } from '@snake/shared';

export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
}

/**
 * Traces a smooth curve through snake body points. Body points are 42 units apart while the body is
 * ~28+ units wide, so joining them with straight lines shows every turn as a visible kink.
 * Each interior point becomes a quadratic control point and the curve passes through the midpoints
 * between neighbours, which keeps the tangent continuous.
 */
export function traceSmooth(path: PathSink, pts: readonly Vec[]): void {
  const n = pts.length;
  if (n === 0) return;
  path.moveTo(pts[0].x, pts[0].y);
  if (n === 1) return;
  for (let i = 1; i < n - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    path.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  path.lineTo(pts[n - 1].x, pts[n - 1].y);
}

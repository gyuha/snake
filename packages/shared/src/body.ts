import { nextPoint, type Vec } from './physics';

/** Rebuilds a snake body from the tail anchor and per-point quantized angles (spec §7). */
export class BodyReplica {
  points: Vec[];

  constructor(tailX: number, tailY: number, iangs: readonly number[]) {
    this.points = [{ x: tailX, y: tailY }];
    for (const a of iangs) this.points.push(nextPoint(this.head, a));
  }

  get head(): Vec {
    return this.points[this.points.length - 1];
  }

  applyMove(iang: number): void {
    this.points.push(nextPoint(this.head, iang));
    this.points.shift();
  }

  applyGrow(iang: number): void {
    this.points.push(nextPoint(this.head, iang));
  }

  applyShrink(): void {
    if (this.points.length > 1) this.points.shift();
  }
}

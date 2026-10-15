import { describe, expect, it } from 'vitest';
import { BodyReplica, SEG_SPACING, quantizeAngle16 } from '../src/index';

describe('BodyReplica', () => {
  const q = quantizeAngle16(0);

  it('builds points from the tail anchor and angles', () => {
    const b = new BodyReplica(100, 100, [q, q]);
    expect(b.points).toHaveLength(3);
    expect(b.head.x).toBeCloseTo(100 + 2 * SEG_SPACING, 9);
  });

  it('move adds a head and drops the tail', () => {
    const b = new BodyReplica(0, 0, [q]);
    b.applyMove(q);
    expect(b.points).toHaveLength(2);
    expect(b.points[0].x).toBeCloseTo(SEG_SPACING, 9);
  });

  it('grow keeps the tail; shrink drops it but never the last point', () => {
    const b = new BodyReplica(0, 0, []);
    b.applyGrow(q);
    expect(b.points).toHaveLength(2);
    b.applyShrink();
    b.applyShrink();
    expect(b.points).toHaveLength(1);
  });
});

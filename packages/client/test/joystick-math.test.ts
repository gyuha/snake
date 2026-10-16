import { describe, expect, it } from 'vitest';
import { stickState } from '../src/ui/joystick-math';

describe('stickState', () => {
  it('reports no angle inside the deadzone', () => {
    expect(stickState(2, 1, 65).angle).toBeNull();
  });

  it('computes the screen angle outside the deadzone', () => {
    expect(stickState(40, 0, 65).angle).toBeCloseTo(0);
    expect(stickState(0, 40, 65).angle).toBeCloseTo(Math.PI / 2);
    expect(stickState(-40, 0, 65).angle).toBeCloseTo(Math.PI);
  });

  it('clamps the knob to the base radius', () => {
    const s = stickState(300, 400, 65);
    expect(Math.hypot(s.x, s.y)).toBeCloseTo(65);
  });
});

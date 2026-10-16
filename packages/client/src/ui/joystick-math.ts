export const DEADZONE = 0.15; // fraction of the base radius

export interface StickState {
  x: number; // knob offset from center, clamped to the base radius
  y: number;
  angle: number | null; // null while inside the deadzone
}

export function stickState(dx: number, dy: number, radius: number): StickState {
  const dist = Math.hypot(dx, dy);
  const k = dist > radius ? radius / dist : 1;
  return {
    x: dx * k,
    y: dy * k,
    angle: dist < radius * DEADZONE ? null : Math.atan2(dy, dx),
  };
}

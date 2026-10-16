import type { Input } from '../input';
import { stickState } from './joystick-math';

export function setupTouchControls(input: Input, base: HTMLElement, knob: HTMLElement, boostBtn: HTMLElement): void {
  let stickPointer: number | null = null;

  const moveKnob = (e: PointerEvent): void => {
    const r = base.getBoundingClientRect();
    const s = stickState(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2, r.width / 2);
    knob.style.transform = `translate(${s.x}px, ${s.y}px)`;
    if (s.angle !== null) input.angle = s.angle;
  };
  const releaseStick = (e: PointerEvent): void => {
    if (e.pointerId !== stickPointer) return;
    stickPointer = null;
    knob.style.transform = '';
  };

  base.addEventListener('pointerdown', (e) => {
    if (stickPointer !== null) return;
    stickPointer = e.pointerId;
    base.setPointerCapture(e.pointerId);
    moveKnob(e);
  });
  base.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickPointer) moveKnob(e);
  });
  base.addEventListener('pointerup', releaseStick);
  base.addEventListener('pointercancel', releaseStick);

  let boostPointer: number | null = null;
  const releaseBoost = (e: PointerEvent): void => {
    if (e.pointerId !== boostPointer) return;
    boostPointer = null;
    input.touchBoost = false;
    boostBtn.classList.remove('active');
  };
  boostBtn.addEventListener('pointerdown', (e) => {
    if (boostPointer !== null) return;
    boostPointer = e.pointerId;
    boostBtn.setPointerCapture(e.pointerId);
    input.touchBoost = true;
    boostBtn.classList.add('active');
  });
  boostBtn.addEventListener('pointerup', releaseBoost);
  boostBtn.addEventListener('pointercancel', releaseBoost);
}

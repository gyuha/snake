/** Speed travels as u8 = units/s ÷ 2 (spec §7). */
export function toWireSpeed(unitsPerSec: number): number {
  return Math.max(0, Math.min(255, Math.round(unitsPerSec / 2)));
}

export function fromWireSpeed(w: number): number {
  return w * 2;
}

/** fam travels as u16 = round(min(fam, 1)·65535). */
export function toWireFam(fam: number): number {
  return Math.round(Math.max(0, Math.min(fam, 1)) * 65535);
}

export function fromWireFam(w: number): number {
  return w / 65535;
}

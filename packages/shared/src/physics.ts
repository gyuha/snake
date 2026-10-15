import {
  BODY_RADIUS_PER_SC, BOOST_SP, MAMU, MAX_SEGMENTS, MSCPS, NSP1, NSP2, SECTORS_PER_EDGE,
  SECTOR_SIZE, SEG_SPACING, SPANGDV, SPEED_SCALE, TURN_SCALE,
} from './constants';

export const TAU = Math.PI * 2;

export interface Vec {
  x: number;
  y: number;
}

export function sizeScale(sct: number): number {
  return Math.min(6, 1 + (sct - 2) / 106);
}

export function turnScale(sc: number): number {
  return 0.13 + 0.87 * ((7 - sc) / 6) ** 2;
}

function spOf(sct: number, boosting: boolean): number {
  return boosting ? BOOST_SP : NSP1 + NSP2 * sizeScale(sct);
}

export function speedOf(sct: number, boosting: boolean): number {
  return spOf(sct, boosting) * SPEED_SCALE;
}

export function maxTurnRate(sct: number, boosting: boolean): number {
  const sp = spOf(sct, boosting);
  return MAMU * TURN_SCALE * turnScale(sizeScale(sct)) * Math.min(1, sp / SPANGDV);
}

export function bodyRadius(sct: number): number {
  return BODY_RADIUS_PER_SC * sizeScale(sct);
}

const FMLTS: number[] = [];
const FPSLS: number[] = [0];
for (let i = 0; i < MSCPS; i++) FMLTS.push((1 - i / MSCPS) ** 2.25);
FMLTS.push(FMLTS[MSCPS - 1]);
for (let i = 1; i <= MSCPS; i++) FPSLS.push(FPSLS[i - 1] + 1 / FMLTS[i - 1]);

export function score(sct: number, fam: number): number {
  const s = Math.max(1, Math.min(sct, MAX_SEGMENTS));
  const f = Math.max(0, Math.min(fam, 1));
  return Math.floor((FPSLS[s] + f / FMLTS[s] - 1) * 15 - 5);
}

export function normAngle(a: number): number {
  const r = a % TAU;
  return r < 0 ? r + TAU : r;
}

export function angleDiff(from: number, to: number): number {
  let d = normAngle(to - from);
  if (d > Math.PI) d -= TAU;
  return d;
}

export function turnToward(ang: number, wang: number, maxDelta: number): number {
  const d = angleDiff(ang, wang);
  if (Math.abs(d) <= maxDelta) return normAngle(wang);
  return normAngle(ang + Math.sign(d) * maxDelta);
}

export function quantizeAngle16(a: number): number {
  return Math.round((normAngle(a) * 65536) / TAU) & 0xffff;
}

export function dequantizeAngle16(q: number): number {
  return ((q & 0xffff) * TAU) / 65536;
}

export function quantizeAngle8(a: number): number {
  return Math.round((normAngle(a) * 256) / TAU) & 0xff;
}

export function dequantizeAngle8(q: number): number {
  return ((q & 0xff) * TAU) / 256;
}

/** Every body point is prev + SEG_SPACING·dir(iang); server and client share this exact arithmetic. */
export function nextPoint(prev: Vec, iang: number): Vec {
  const a = dequantizeAngle16(iang);
  return { x: prev.x + Math.cos(a) * SEG_SPACING, y: prev.y + Math.sin(a) * SEG_SPACING };
}

export function zoom(sct: number): number {
  return 1 + 0.25 * (sizeScale(sct) - 1);
}

export function viewRadius(sct: number): number {
  return 1100 * zoom(sct) + 200;
}

export function sectorCoord(v: number): number {
  return Math.max(0, Math.min(SECTORS_PER_EDGE - 1, Math.floor(v / SECTOR_SIZE)));
}

export function sectorKey(sx: number, sy: number): number {
  return sx * SECTORS_PER_EDGE + sy;
}

export function foodId(sx: number, sy: number, rx: number, ry: number): number {
  return ((sx << 24) | (sy << 16) | (rx << 8) | ry) >>> 0;
}

export function foodPos(sx: number, sy: number, rx: number, ry: number): Vec {
  return {
    x: sx * SECTOR_SIZE + (rx * SECTOR_SIZE) / 256,
    y: sy * SECTOR_SIZE + (ry * SECTOR_SIZE) / 256,
  };
}

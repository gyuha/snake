import { ANIMAL_COUNT, MAX_NAME_BYTES, MINIMAP_SIZE, SKIN_COUNT, WORLD_RADIUS } from './constants';

export class ProtocolError extends Error {}

export const C2S = { JOIN: 0x01, STEER: 0x02, BOOST: 0x03, PING: 0x04, SPECTATE: 0x05 } as const;

export const S2C = {
  WELCOME: 0x10,
  SNAKE_ADD: 0x11,
  SNAKE_REMOVE: 0x12,
  SNAKE_MOVE: 0x13,
  SNAKE_GROW: 0x14,
  SNAKE_SHRINK: 0x15,
  SNAKE_STATE: 0x16,
  SNAKE_FAM: 0x17,
  SECTOR_FOOD: 0x20,
  FOOD_ADD: 0x21,
  FOOD_EAT: 0x22,
  SECTOR_LEAVE: 0x23,
  LEADERBOARD: 0x30,
  MINIMAP: 0x31,
  DEATH: 0x32,
  PONG: 0x33,
  OVERVIEW: 0x34,
} as const;

export type ClientMsg =
  | { t: 'join'; name: string; skin: number; animal: number }
  | { t: 'steer'; angle: number }
  | { t: 'boost'; on: boolean }
  | { t: 'ping' }
  | { t: 'spectate' };

export interface FoodWire {
  rx: number;
  ry: number;
  size: number;
  color: number;
}

export interface LeaderEntry {
  score: number;
  name: string;
}

/** Global rank (1 = first) of a snake currently in the receiver's view. */
export interface SnakeRank {
  id: number;
  rank: number;
}

/** One snake in the spectator overview; x/y are quantized with quantizeCoord, ang with quantizeAngle16. */
export interface OverviewSnake {
  id: number;
  skin: number;
  animal: number;
  name: string;
  x: number;
  y: number;
  ang: number;
  score: number;
}

const COORD_SCALE = 0xffff / (2 * WORLD_RADIUS);

/** World units → u16, clamped to the world square so float drift at the edge cannot break encoding. */
export function quantizeCoord(v: number): number {
  if (!(v > 0)) return 0;
  return Math.min(0xffff, Math.round(v * COORD_SCALE));
}

export function dequantizeCoord(q: number): number {
  return q / COORD_SCALE;
}

export type ServerMsg =
  | { t: 'welcome'; selfId: number; worldRadius: number; sectorSize: number; segSpacing: number; tickHz: number; mscps: number; maxSegments: number }
  | { t: 'snakeAdd'; id: number; name: string; skin: number; animal: number; ang: number; wang: number; speed: number; fam: number; tailX: number; tailY: number; iangs: number[] }
  | { t: 'snakeRemove'; id: number; reason: number }
  | { t: 'snakeMove'; id: number; iang: number }
  | { t: 'snakeGrow'; id: number; iang: number; fam: number }
  | { t: 'snakeShrink'; id: number; fam: number }
  | { t: 'snakeState'; id: number; ang: number; wang: number; speed: number }
  | { t: 'snakeFam'; id: number; fam: number }
  | { t: 'sectorFood'; sx: number; sy: number; foods: FoodWire[] }
  | { t: 'foodAdd'; sx: number; sy: number; rx: number; ry: number; size: number; color: number }
  | { t: 'foodEat'; sx: number; sy: number; rx: number; ry: number; eaterId: number }
  | { t: 'sectorLeave'; sx: number; sy: number }
  | { t: 'leaderboard'; myRank: number; total: number; entries: LeaderEntry[]; ranks: SnakeRank[] }
  | { t: 'minimap'; bits: Uint8Array }
  | { t: 'death'; killerId: number; finalScore: number }
  | { t: 'overview'; snakes: OverviewSnake[] }
  | { t: 'pong' };

const MINIMAP_BYTES = (MINIMAP_SIZE * MINIMAP_SIZE) / 8;
const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function checkUint(v: number, max: number): void {
  if (!Number.isInteger(v) || v < 0 || v > max) throw new ProtocolError(`value out of range: ${v}`);
}

export class Writer {
  private buf = new Uint8Array(256);
  private view = new DataView(this.buf.buffer);
  length = 0;

  private ensure(n: number): void {
    if (this.length + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.length + n) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  u8(v: number): this {
    checkUint(v, 0xff);
    this.ensure(1);
    this.view.setUint8(this.length, v);
    this.length += 1;
    return this;
  }

  u16(v: number): this {
    checkUint(v, 0xffff);
    this.ensure(2);
    this.view.setUint16(this.length, v);
    this.length += 2;
    return this;
  }

  u24(v: number): this {
    checkUint(v, 0xffffff);
    this.ensure(3);
    this.view.setUint8(this.length, (v >>> 16) & 0xff);
    this.view.setUint16(this.length + 1, v & 0xffff);
    this.length += 3;
    return this;
  }

  f64(v: number): this {
    this.ensure(8);
    this.view.setFloat64(this.length, v);
    this.length += 8;
    return this;
  }

  bytes(b: Uint8Array): this {
    this.ensure(b.length);
    this.buf.set(b, this.length);
    this.length += b.length;
    return this;
  }

  str(s: string): this {
    const b = utf8Encoder.encode(s);
    this.u8(b.length);
    return this.bytes(b);
  }

  finish(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

export class Reader {
  private readonly view: DataView;
  private pos = 0;

  constructor(private readonly buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  get remaining(): number {
    return this.buf.length - this.pos;
  }

  private need(n: number): void {
    if (this.pos + n > this.buf.length) throw new ProtocolError('truncated message');
  }

  u8(): number {
    this.need(1);
    return this.view.getUint8(this.pos++);
  }

  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos);
    this.pos += 2;
    return v;
  }

  u24(): number {
    this.need(3);
    const v = (this.view.getUint8(this.pos) << 16) | this.view.getUint16(this.pos + 1);
    this.pos += 3;
    return v;
  }

  f64(): number {
    this.need(8);
    const v = this.view.getFloat64(this.pos);
    this.pos += 8;
    return v;
  }

  bytes(n: number): Uint8Array {
    this.need(n);
    const b = this.buf.slice(this.pos, this.pos + n);
    this.pos += n;
    return b;
  }

  str(): string {
    const b = this.bytes(this.u8());
    try {
      return utf8Decoder.decode(b);
    } catch {
      throw new ProtocolError('invalid utf-8');
    }
  }
}

export function sanitizeName(raw: string): string {
  const cleaned = raw.replace(/\p{Cc}/gu, '').trim();
  let out = '';
  let used = 0;
  for (const ch of cleaned) {
    const n = utf8Encoder.encode(ch).length;
    if (used + n > MAX_NAME_BYTES) break;
    out += ch;
    used += n;
  }
  return out.length > 0 ? out : 'Player';
}

function checkName(name: string): void {
  if (utf8Encoder.encode(name).length > MAX_NAME_BYTES) throw new ProtocolError('name too long');
}

export function encodeClient(msg: ClientMsg): Uint8Array {
  const w = new Writer();
  switch (msg.t) {
    case 'join':
      checkName(msg.name);
      w.u8(C2S.JOIN).str(msg.name).u8(msg.skin).u8(msg.animal);
      break;
    case 'steer':
      w.u8(C2S.STEER).u8(msg.angle);
      break;
    case 'boost':
      w.u8(C2S.BOOST).u8(msg.on ? 1 : 0);
      break;
    case 'ping':
      w.u8(C2S.PING);
      break;
    case 'spectate':
      w.u8(C2S.SPECTATE);
      break;
  }
  return w.finish();
}

export function decodeClient(buf: Uint8Array): ClientMsg {
  const r = new Reader(buf);
  const op = r.u8();
  let msg: ClientMsg;
  switch (op) {
    case C2S.JOIN: {
      const name = r.str();
      checkName(name);
      const skin = r.u8();
      if (skin >= SKIN_COUNT) throw new ProtocolError(`skin out of range: ${skin}`);
      const animal = r.u8();
      if (animal >= ANIMAL_COUNT) throw new ProtocolError(`animal out of range: ${animal}`);
      msg = { t: 'join', name, skin, animal };
      break;
    }
    case C2S.STEER:
      msg = { t: 'steer', angle: r.u8() };
      break;
    case C2S.BOOST: {
      const v = r.u8();
      if (v > 1) throw new ProtocolError(`boost flag out of range: ${v}`);
      msg = { t: 'boost', on: v === 1 };
      break;
    }
    case C2S.PING:
      msg = { t: 'ping' };
      break;
    case C2S.SPECTATE:
      msg = { t: 'spectate' };
      break;
    default:
      throw new ProtocolError(`unknown client opcode: ${op}`);
  }
  if (r.remaining !== 0) throw new ProtocolError('trailing bytes');
  return msg;
}

export function encodeServer(w: Writer, msg: ServerMsg): void {
  switch (msg.t) {
    case 'welcome':
      w.u8(S2C.WELCOME).u16(msg.selfId).u16(msg.worldRadius).u16(msg.sectorSize)
        .u8(msg.segSpacing).u8(msg.tickHz).u16(msg.mscps).u16(msg.maxSegments);
      break;
    case 'snakeAdd':
      w.u8(S2C.SNAKE_ADD).u16(msg.id).str(msg.name).u8(msg.skin).u8(msg.animal).u16(msg.ang).u16(msg.wang)
        .u8(msg.speed).u16(msg.fam).u16(msg.iangs.length + 1).f64(msg.tailX).f64(msg.tailY);
      for (const a of msg.iangs) w.u16(a);
      break;
    case 'snakeRemove':
      w.u8(S2C.SNAKE_REMOVE).u16(msg.id).u8(msg.reason);
      break;
    case 'snakeMove':
      w.u8(S2C.SNAKE_MOVE).u16(msg.id).u16(msg.iang);
      break;
    case 'snakeGrow':
      w.u8(S2C.SNAKE_GROW).u16(msg.id).u16(msg.iang).u16(msg.fam);
      break;
    case 'snakeShrink':
      w.u8(S2C.SNAKE_SHRINK).u16(msg.id).u16(msg.fam);
      break;
    case 'snakeState':
      w.u8(S2C.SNAKE_STATE).u16(msg.id).u16(msg.ang).u16(msg.wang).u8(msg.speed);
      break;
    case 'snakeFam':
      w.u8(S2C.SNAKE_FAM).u16(msg.id).u16(msg.fam);
      break;
    case 'sectorFood':
      if (msg.foods.length > 255) throw new ProtocolError('too many foods in one sectorFood');
      w.u8(S2C.SECTOR_FOOD).u8(msg.sx).u8(msg.sy).u8(msg.foods.length);
      for (const f of msg.foods) w.u8(f.rx).u8(f.ry).u8(f.size).u8(f.color);
      break;
    case 'foodAdd':
      w.u8(S2C.FOOD_ADD).u8(msg.sx).u8(msg.sy).u8(msg.rx).u8(msg.ry).u8(msg.size).u8(msg.color);
      break;
    case 'foodEat':
      w.u8(S2C.FOOD_EAT).u8(msg.sx).u8(msg.sy).u8(msg.rx).u8(msg.ry).u16(msg.eaterId);
      break;
    case 'sectorLeave':
      w.u8(S2C.SECTOR_LEAVE).u8(msg.sx).u8(msg.sy);
      break;
    case 'leaderboard':
      w.u8(S2C.LEADERBOARD).u16(msg.myRank).u16(msg.total).u8(msg.entries.length);
      for (const e of msg.entries) w.u24(e.score).str(e.name);
      w.u8(msg.ranks.length);
      for (const e of msg.ranks) w.u16(e.id).u16(e.rank);
      break;
    case 'minimap':
      if (msg.bits.length !== MINIMAP_BYTES) throw new ProtocolError('minimap size mismatch');
      w.u8(S2C.MINIMAP).bytes(msg.bits);
      break;
    case 'death':
      w.u8(S2C.DEATH).u16(msg.killerId).u24(msg.finalScore);
      break;
    case 'overview':
      w.u8(S2C.OVERVIEW).u16(msg.snakes.length);
      for (const s of msg.snakes) w.u16(s.id).u8(s.skin).u8(s.animal).str(s.name).u16(s.x).u16(s.y).u16(s.ang).u24(s.score);
      break;
    case 'pong':
      w.u8(S2C.PONG);
      break;
  }
}

function decodeServerMsg(r: Reader): ServerMsg {
  const op = r.u8();
  switch (op) {
    case S2C.WELCOME:
      return { t: 'welcome', selfId: r.u16(), worldRadius: r.u16(), sectorSize: r.u16(), segSpacing: r.u8(), tickHz: r.u8(), mscps: r.u16(), maxSegments: r.u16() };
    case S2C.SNAKE_ADD: {
      const id = r.u16();
      const name = r.str();
      const skin = r.u8();
      const animal = r.u8();
      if (animal >= ANIMAL_COUNT) throw new ProtocolError(`animal out of range: ${animal}`);
      const ang = r.u16();
      const wang = r.u16();
      const speed = r.u8();
      const fam = r.u16();
      const n = r.u16();
      if (n < 1) throw new ProtocolError('snake without points');
      const tailX = r.f64();
      const tailY = r.f64();
      const iangs: number[] = [];
      for (let i = 1; i < n; i++) iangs.push(r.u16());
      return { t: 'snakeAdd', id, name, skin, animal, ang, wang, speed, fam, tailX, tailY, iangs };
    }
    case S2C.SNAKE_REMOVE:
      return { t: 'snakeRemove', id: r.u16(), reason: r.u8() };
    case S2C.SNAKE_MOVE:
      return { t: 'snakeMove', id: r.u16(), iang: r.u16() };
    case S2C.SNAKE_GROW:
      return { t: 'snakeGrow', id: r.u16(), iang: r.u16(), fam: r.u16() };
    case S2C.SNAKE_SHRINK:
      return { t: 'snakeShrink', id: r.u16(), fam: r.u16() };
    case S2C.SNAKE_STATE:
      return { t: 'snakeState', id: r.u16(), ang: r.u16(), wang: r.u16(), speed: r.u8() };
    case S2C.SNAKE_FAM:
      return { t: 'snakeFam', id: r.u16(), fam: r.u16() };
    case S2C.SECTOR_FOOD: {
      const sx = r.u8();
      const sy = r.u8();
      const count = r.u8();
      const foods: FoodWire[] = [];
      for (let i = 0; i < count; i++) foods.push({ rx: r.u8(), ry: r.u8(), size: r.u8(), color: r.u8() });
      return { t: 'sectorFood', sx, sy, foods };
    }
    case S2C.FOOD_ADD:
      return { t: 'foodAdd', sx: r.u8(), sy: r.u8(), rx: r.u8(), ry: r.u8(), size: r.u8(), color: r.u8() };
    case S2C.FOOD_EAT:
      return { t: 'foodEat', sx: r.u8(), sy: r.u8(), rx: r.u8(), ry: r.u8(), eaterId: r.u16() };
    case S2C.SECTOR_LEAVE:
      return { t: 'sectorLeave', sx: r.u8(), sy: r.u8() };
    case S2C.LEADERBOARD: {
      const myRank = r.u16();
      const total = r.u16();
      const n = r.u8();
      const entries: LeaderEntry[] = [];
      for (let i = 0; i < n; i++) entries.push({ score: r.u24(), name: r.str() });
      const ranks: SnakeRank[] = [];
      const rn = r.u8();
      for (let i = 0; i < rn; i++) ranks.push({ id: r.u16(), rank: r.u16() });
      return { t: 'leaderboard', myRank, total, entries, ranks };
    }
    case S2C.MINIMAP:
      return { t: 'minimap', bits: r.bytes(MINIMAP_BYTES) };
    case S2C.DEATH:
      return { t: 'death', killerId: r.u16(), finalScore: r.u24() };
    case S2C.OVERVIEW: {
      const n = r.u16();
      const snakes: OverviewSnake[] = [];
      for (let i = 0; i < n; i++) {
        const id = r.u16();
        const skin = r.u8();
        if (skin >= SKIN_COUNT) throw new ProtocolError(`skin out of range: ${skin}`);
        const animal = r.u8();
        if (animal >= ANIMAL_COUNT) throw new ProtocolError(`animal out of range: ${animal}`);
        snakes.push({ id, skin, animal, name: r.str(), x: r.u16(), y: r.u16(), ang: r.u16(), score: r.u24() });
      }
      return { t: 'overview', snakes };
    }
    case S2C.PONG:
      return { t: 'pong' };
    default:
      throw new ProtocolError(`unknown server opcode: ${op}`);
  }
}

export function decodeServerFrame(buf: Uint8Array): ServerMsg[] {
  const r = new Reader(buf);
  const out: ServerMsg[] = [];
  while (r.remaining > 0) out.push(decodeServerMsg(r));
  return out;
}

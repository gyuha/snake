import { describe, expect, it } from 'vitest';
import {
  ANIMAL_COUNT, C2S, ProtocolError, S2C, WORLD_RADIUS, Writer, decodeClient, decodeServerFrame, dequantizeCoord,
  encodeClient, encodeServer, quantizeCoord, sanitizeName, type ClientMsg, type ServerMsg,
} from '../src/index';

const clientMsgs: ClientMsg[] = [
  { t: 'join', name: '뱀왕😀', skin: 7, animal: 5 },
  { t: 'steer', angle: 200 },
  { t: 'boost', on: true },
  { t: 'boost', on: false },
  { t: 'ping' },
  { t: 'spectate' },
];

const serverMsgs: ServerMsg[] = [
  { t: 'welcome', selfId: 3, worldRadius: 8000, sectorSize: 480, segSpacing: 42, tickHz: 30, mscps: 411, maxSegments: 300 },
  { t: 'snakeAdd', id: 65000, name: 'bot', skin: 2, animal: 3, ang: 1, wang: 65535, speed: 188, fam: 32768, tailX: 1234.567891234, tailY: 9876.54321, iangs: [0, 100, 65535] },
  { t: 'snakeAdd', id: 1, name: '', skin: 0, animal: 0, ang: 0, wang: 0, speed: 74, fam: 0, tailX: 8000, tailY: 8000, iangs: [] },
  { t: 'snakeRemove', id: 9, reason: 1 },
  { t: 'snakeMove', id: 9, iang: 40000 },
  { t: 'snakeGrow', id: 9, iang: 12, fam: 65535 },
  { t: 'snakeShrink', id: 9, fam: 7 },
  { t: 'snakeState', id: 9, ang: 5, wang: 6, speed: 74 },
  { t: 'snakeFam', id: 9, fam: 100 },
  { t: 'sectorFood', sx: 33, sy: 0, foods: [{ rx: 0, ry: 255, size: 8, color: 8 }, { rx: 1, ry: 2, size: 1, color: 0 }] },
  { t: 'sectorFood', sx: 1, sy: 1, foods: [] },
  { t: 'foodAdd', sx: 2, sy: 3, rx: 4, ry: 5, size: 3, color: 6 },
  { t: 'foodEat', sx: 2, sy: 3, rx: 4, ry: 5, eaterId: 77 },
  { t: 'sectorLeave', sx: 10, sy: 11 },
  { t: 'leaderboard', myRank: 4, total: 31, entries: [{ score: 20245, name: 'a' }, { score: 10, name: '한글' }], ranks: [{ id: 9, rank: 1 }, { id: 300, rank: 31 }] },
  { t: 'minimap', bits: Uint8Array.from({ length: 512 }, (_, i) => i & 0xff) },
  { t: 'death', killerId: 0xffff, finalScore: 16777215 },
  {
    t: 'overview',
    snakes: [
      { id: 65534, skin: 7, animal: 5, name: '뱀왕😀', x: 0, y: 65535, ang: 65535, score: 16777215 },
      { id: 1, skin: 0, animal: 0, name: '', x: 32768, y: 100, ang: 0, score: 0 },
    ],
  },
  { t: 'overview', snakes: [] },
  { t: 'pong' },
];

describe('client messages', () => {
  it.each(clientMsgs.map((m) => [m.t, m] as const))('round trips %s', (_t, msg) => {
    expect(decodeClient(encodeClient(msg))).toEqual(msg);
  });

  it.each([
    ['empty frame', new Uint8Array([])],
    ['unknown opcode', new Uint8Array([0x7f])],
    ['trailing bytes', new Uint8Array([C2S.PING, 0])],
    ['truncated join', new Uint8Array([C2S.JOIN, 5, 0x61])],
    ['name over 24 bytes', new Uint8Array([C2S.JOIN, 25, ...new Array(25).fill(0x61), 0])],
    ['skin out of range', new Uint8Array([C2S.JOIN, 1, 0x61, 8])],
    ['animal out of range', new Uint8Array([C2S.JOIN, 1, 0x61, 0, 6])],
    ['boost not 0/1', new Uint8Array([C2S.BOOST, 2])],
    ['invalid utf-8 name', new Uint8Array([C2S.JOIN, 2, 0xff, 0xfe, 0])],
  ])('rejects %s', (_label, bytes) => {
    expect(() => decodeClient(bytes)).toThrow(ProtocolError);
  });
});

describe('server frames', () => {
  it('round trips every message type in one frame', () => {
    const w = new Writer();
    for (const m of serverMsgs) encodeServer(w, m);
    expect(decodeServerFrame(w.finish())).toEqual(serverMsgs);
  });

  it('keeps f64 tail anchors bit-exact', () => {
    const w = new Writer();
    encodeServer(w, { t: 'snakeAdd', id: 1, name: 'x', skin: 0, animal: 0, ang: 0, wang: 0, speed: 0, fam: 0, tailX: Math.PI * 1000, tailY: Math.E * 1000, iangs: [] });
    const [m] = decodeServerFrame(w.finish());
    expect(m.t === 'snakeAdd' && m.tailX).toBe(Math.PI * 1000);
    expect(m.t === 'snakeAdd' && m.tailY).toBe(Math.E * 1000);
  });

  it('grows the writer past its initial capacity', () => {
    const w = new Writer();
    const msgs: ServerMsg[] = Array.from({ length: 300 }, (_, i) => ({ t: 'snakeMove', id: i, iang: i }));
    for (const m of msgs) encodeServer(w, m);
    expect(decodeServerFrame(w.finish())).toEqual(msgs);
  });

  it('refuses more than 255 foods in one sectorFood message', () => {
    const foods = Array.from({ length: 256 }, () => ({ rx: 0, ry: 0, size: 1, color: 0 }));
    expect(() => encodeServer(new Writer(), { t: 'sectorFood', sx: 0, sy: 0, foods })).toThrow(ProtocolError);
  });

  it('refuses out-of-range integers instead of wrapping', () => {
    expect(() => encodeServer(new Writer(), { t: 'snakeMove', id: 70000, iang: 0 })).toThrow(ProtocolError);
    expect(() => encodeServer(new Writer(), { t: 'snakeMove', id: 1, iang: 1.5 })).toThrow(ProtocolError);
  });

  it('rejects a truncated frame', () => {
    const w = new Writer();
    encodeServer(w, { t: 'snakeMove', id: 1, iang: 2 });
    expect(() => decodeServerFrame(w.finish().subarray(0, 3))).toThrow(ProtocolError);
  });
});

describe('sanitizeName', () => {
  it('strips control characters and trims', () => {
    expect(sanitizeName('  ab\u0000c\u0007d\n ')).toBe('abcd');
  });
  it('falls back to Player when empty', () => {
    expect(sanitizeName('   ')).toBe('Player');
    expect(sanitizeName('\u0001')).toBe('Player');
  });
  it('truncates at 24 UTF-8 bytes on a code point boundary', () => {
    const ko = sanitizeName('가'.repeat(10));
    expect(ko).toBe('가'.repeat(8));
    const emoji = sanitizeName('😀'.repeat(7));
    expect(emoji).toBe('😀'.repeat(6));
    expect(new TextEncoder().encode(emoji).length).toBeLessThanOrEqual(24);
    expect(emoji.includes('�')).toBe(false);
  });
});

describe('overview', () => {
  it('rejects a skin out of range', () => {
    const w = new Writer().u8(S2C.OVERVIEW).u16(1).u16(1).u8(8).str('a').u16(0).u16(0).u24(0);
    expect(() => decodeServerFrame(w.finish())).toThrow(ProtocolError);
  });

  it('rejects an animal out of range', () => {
    const w = new Writer().u8(S2C.OVERVIEW).u16(1).u16(1).u8(0).u8(ANIMAL_COUNT).str('a').u16(0).u16(0).u16(0).u24(0);
    expect(() => decodeServerFrame(w.finish())).toThrow(ProtocolError);
  });

  it('rejects a truncated snake list', () => {
    const w = new Writer().u8(S2C.OVERVIEW).u16(2).u16(1).u8(0).u8(0).str('a').u16(0).u16(0).u16(0).u24(0);
    expect(() => decodeServerFrame(w.finish())).toThrow(ProtocolError);
  });

  it('spectate carries no payload', () => {
    expect(Array.from(encodeClient({ t: 'spectate' }))).toEqual([C2S.SPECTATE]);
    expect(() => decodeClient(Uint8Array.from([C2S.SPECTATE, 0]))).toThrow(ProtocolError);
  });

  it('quantizeCoord clamps to the world and keeps 0.25 unit precision', () => {
    expect(quantizeCoord(-50)).toBe(0);
    expect(quantizeCoord(2 * WORLD_RADIUS + 50)).toBe(0xffff);
    expect(quantizeCoord(Number.NaN)).toBe(0);
    for (const v of [0, 1, 4000.3, WORLD_RADIUS, 15999.9, 2 * WORLD_RADIUS]) {
      expect(Math.abs(dequantizeCoord(quantizeCoord(v)) - v)).toBeLessThanOrEqual(0.25);
    }
  });
});

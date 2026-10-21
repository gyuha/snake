import { describe, expect, it } from 'vitest';
import { qrModules } from '../src/ui/qr';

const finder = (m: boolean[][], r0: number, c0: number): string =>
  m.slice(r0, r0 + 7).map((row) => row.slice(c0, c0 + 7).map((d) => (d ? '#' : '.')).join('')).join('\n');

const FINDER = ['#######', '#.....#', '#.###.#', '#.###.#', '#.###.#', '#.....#', '#######'].join('\n');

describe('qrModules', () => {
  it('builds a square matrix with a valid QR size', () => {
    const m = qrModules('http://192.168.0.74:5173/');
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect((m.length - 17) % 4).toBe(0);
    expect(m.every((row) => row.length === m.length)).toBe(true);
  });

  it('puts the three finder patterns in the corners', () => {
    const m = qrModules('http://192.168.0.74:5173/');
    const n = m.length;
    expect(finder(m, 0, 0)).toBe(FINDER);
    expect(finder(m, 0, n - 7)).toBe(FINDER);
    expect(finder(m, n - 7, 0)).toBe(FINDER);
  });

  it('encodes different text differently and the same text identically', () => {
    expect(qrModules('http://a.example/')).toEqual(qrModules('http://a.example/'));
    expect(qrModules('http://a.example/')).not.toEqual(qrModules('http://b.example/'));
  });
});

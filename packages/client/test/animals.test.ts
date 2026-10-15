import { describe, expect, it } from 'vitest';
import { ANIMAL_COUNT } from '@snake/shared';
import { drawHead, drawTail } from '../src/render/animals';

/** A canvas context stand-in that records every call and property assignment. */
function recorder(): { ctx: CanvasRenderingContext2D; log: string[] } {
  const log: string[] = [];
  const ctx = new Proxy({}, {
    get: (_t, name: string) => (...args: unknown[]) => {
      log.push(`${name}(${args.join(',')})`);
    },
    set: (_t, name: string, value: unknown) => {
      log.push(`${name}=${String(value)}`);
      return true;
    },
  }) as CanvasRenderingContext2D;
  return { ctx, log };
}

const animals = Array.from({ length: ANIMAL_COUNT }, (_, i) => i);

describe('animal drawing', () => {
  it.each(animals)('animal %i draws a head and a tail without throwing', (a) => {
    const { ctx } = recorder();
    expect(() => drawHead(ctx, a, { x: 10, y: 20 }, 0.7, 12, '#3ec1d3', '#b4ecf3')).not.toThrow();
    expect(() => drawTail(ctx, a, { x: 10, y: 20 }, 0.7, 12, '#3ec1d3', '#b4ecf3')).not.toThrow();
  });

  it('every animal produces its own head, and each non-default one draws something', () => {
    const heads = animals.map((a) => {
      const { ctx, log } = recorder();
      drawHead(ctx, a, { x: 0, y: 0 }, 0, 10, '#3ec1d3', '#b4ecf3');
      return log.join('|');
    });
    expect(new Set(heads).size).toBe(ANIMAL_COUNT);
    for (const h of heads.slice(1)) expect(h.length).toBeGreaterThan(0);
  });

  it('every animal produces its own tail, and each non-default one draws something', () => {
    const tails = animals.map((a) => {
      const { ctx, log } = recorder();
      drawTail(ctx, a, { x: 0, y: 0 }, 0, 10, '#3ec1d3', '#b4ecf3');
      return log.join('|');
    });
    expect(new Set(tails).size).toBe(ANIMAL_COUNT);
    for (const t of tails.slice(1)) expect(t.length).toBeGreaterThan(0);
  });

  it('restores the canvas state it changed', () => {
    for (const a of animals) {
      const { ctx, log } = recorder();
      drawHead(ctx, a, { x: 0, y: 0 }, 1, 10, '#3ec1d3', '#b4ecf3');
      drawTail(ctx, a, { x: 0, y: 0 }, 1, 10, '#3ec1d3', '#b4ecf3');
      const saves = log.filter((l) => l.startsWith('save(')).length;
      const restores = log.filter((l) => l.startsWith('restore(')).length;
      expect(restores).toBe(saves);
    }
  });

  it('the default animal draws nothing, so the plain look is preserved', () => {
    const { ctx, log } = recorder();
    drawHead(ctx, 0, { x: 0, y: 0 }, 0, 10, '#3ec1d3', '#b4ecf3');
    drawTail(ctx, 0, { x: 0, y: 0 }, 0, 10, '#3ec1d3', '#b4ecf3');
    expect(log).toEqual([]);
  });
});

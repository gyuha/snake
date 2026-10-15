import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('client index.html', () => {
  it('declares an icon so browsers do not request /favicon.ico (404 console error)', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
    expect(html).toMatch(/<link\s+[^>]*rel="icon"[^>]*>/);
  });
});

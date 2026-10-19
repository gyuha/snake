import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf-8');

describe('client status.html', () => {
  it('has the map canvas, the ranking list and the connection-lost banner', () => {
    const html = read('status.html');
    expect(html).toMatch(/<canvas\s+id="map"/);
    expect(html).toMatch(/<ol\s+id="board"/);
    expect(html).toMatch(/id="lost"/);
  });

  it('loads only its own entry script, not the game client', () => {
    const html = read('status.html');
    expect(html).toMatch(/<script\s+type="module"\s+src="\/src\/status\.ts"/);
    expect(html).not.toMatch(/src\/main\.ts/);
  });

  it('is a production build entry next to index.html', () => {
    const config = read('vite.config.ts');
    expect(config).toContain('index.html');
    expect(config).toContain('status.html');
  });
});

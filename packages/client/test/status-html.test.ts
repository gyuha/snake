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

  it('has the round controls, the countdown and the end overlay', () => {
    const html = read('status.html');
    expect(html).toMatch(/<input[^>]*id="minutes"[^>]*type="number"[^>]*min="1"[^>]*max="60"[^>]*value="10"/);
    expect(html).toMatch(/<input[^>]*id="bots"[^>]*type="number"[^>]*min="0"[^>]*max="100"[^>]*value="30"/);
    expect(html.indexOf('id="bots"')).toBeLessThan(html.indexOf('id="start"'));
    expect(html).toMatch(/<button[^>]*id="start"/);
    expect(html).toMatch(/id="clock"/);
    expect(html).toMatch(/id="ended"/);
    expect(html).toMatch(/id="ended-time"/);
    expect(html).toMatch(/id="winner"/);
    expect(html).toMatch(/id="start-banner"/);
    expect(html).toContain('게임 시작');
    expect(html).toMatch(/@keyframes\s+banner/);
  });

  it('shows the game address as a QR code in the bottom-left corner', () => {
    const html = read('status.html');
    expect(html).toMatch(/<canvas\s+id="qr"/);
    expect(html).toMatch(/id="qr-url"/);
    expect(html).toMatch(/#qr-box\s*\{[^}]*left:\s*\d+px[^}]*bottom:\s*\d+px/);
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

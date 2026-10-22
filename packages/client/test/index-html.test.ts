import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('client index.html', () => {
  it('declares an icon so browsers do not request /favicon.ico (404 console error)', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
    expect(html).toMatch(/<link\s+[^>]*rel="icon"[^>]*>/);
  });

  it('has the start-screen pickers: a preview canvas, an animal row and a skin row', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
    expect(html).toMatch(/<canvas\s+id="preview"/);
    expect(html).toMatch(/id="animals"/);
    expect(html).toMatch(/id="skins"/);
    expect(html.indexOf('id="preview"')).toBeLessThan(html.indexOf('id="animals"'));
    expect(html.indexOf('id="animals"')).toBeLessThan(html.indexOf('id="skins"'));
  });

  it('has touch controls: a joystick with a knob and a boost button', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
    expect(html).toMatch(/id="joystick"/);
    expect(html).toMatch(/id="joystick-knob"/);
    expect(html).toMatch(/id="boost-btn"/);
  });

  it('shows the round countdown in the HUD and has an end-of-round overlay above the other screens', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
    expect(html).toMatch(/id="round-time"/);
    expect(html).toMatch(/id="round-ended"/);
    expect(html).toMatch(/id="my-result"/);
    expect(html).toMatch(/id="start-banner"/);
    expect(html).toContain('게임 시작');
    expect(html).toMatch(/@keyframes\s+banner/);
    expect(html.indexOf('id="round-ended"')).toBeGreaterThan(html.indexOf('id="lost"'));
  });
});

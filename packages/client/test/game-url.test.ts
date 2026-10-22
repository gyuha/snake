import { describe, expect, it } from 'vitest';
import { gameUrl } from '../src/ui/game-url';

const lan = ['192.168.0.74', '192.168.0.81'];

describe('gameUrl', () => {
  it('swaps a loopback host for the first LAN address and keeps scheme and port', () => {
    expect(gameUrl({ protocol: 'http:', hostname: 'localhost', port: '5173' }, lan)).toBe('http://192.168.0.74:5173/');
    expect(gameUrl({ protocol: 'http:', hostname: '127.0.0.1', port: '5173' }, lan)).toBe('http://192.168.0.74:5173/');
    expect(gameUrl({ protocol: 'https:', hostname: '[::1]', port: '' }, lan)).toBe('https://192.168.0.74/');
  });

  it('keeps an address the visitor already used', () => {
    expect(gameUrl({ protocol: 'http:', hostname: '192.168.0.81', port: '5173' }, lan)).toBe('http://192.168.0.81:5173/');
    expect(gameUrl({ protocol: 'https:', hostname: 'snake.example.com', port: '' }, lan)).toBe('https://snake.example.com/');
  });

  it('falls back to the loopback address while no LAN address is known', () => {
    expect(gameUrl({ protocol: 'http:', hostname: 'localhost', port: '5173' }, [])).toBe('http://localhost:5173/');
  });
});

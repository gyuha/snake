import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { MAX_MSGS_PER_SEC, Session } from '../src/net/session';

const fakeSocket = {} as WebSocket;

describe('Session.admit', () => {
  it('drops messages beyond the per-second limit', () => {
    const s = new Session(fakeSocket);
    const verdicts = Array.from({ length: MAX_MSGS_PER_SEC + 5 }, () => s.admit(10_000));
    expect(verdicts.filter((v) => v === 'ok')).toHaveLength(MAX_MSGS_PER_SEC);
    expect(verdicts.slice(MAX_MSGS_PER_SEC).every((v) => v === 'drop')).toBe(true);
  });

  it('closes after three consecutive over-limit seconds', () => {
    const s = new Session(fakeSocket);
    let t = 10_000;
    for (let w = 0; w < 3; w++, t += 1000) for (let i = 0; i < 100; i++) s.admit(t);
    expect(s.admit(t)).toBe('close');
  });

  it('a calm second resets the over-limit streak', () => {
    const s = new Session(fakeSocket);
    let t = 10_000;
    for (let w = 0; w < 2; w++, t += 1000) for (let i = 0; i < 100; i++) s.admit(t);
    s.admit(t);
    t += 1000;
    for (let i = 0; i < 100; i++) s.admit(t);
    t += 1000;
    expect(s.admit(t)).toBe('ok');
  });
});

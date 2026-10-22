import { describe, expect, it } from 'vitest';
import { RoundClock, formatClock, formatMyResult } from '../src/ui/round-clock';

describe('formatClock', () => {
  it('shows a full minute count at the start of a round', () => {
    expect(formatClock(10 * 60_000)).toBe('10:00');
    expect(formatClock(60 * 60_000)).toBe('60:00');
  });

  it('rounds partial seconds up so 00:00 only appears once time is really up', () => {
    expect(formatClock(59_001)).toBe('01:00');
    expect(formatClock(1)).toBe('00:01');
    expect(formatClock(0)).toBe('00:00');
  });

  it('pads seconds and never goes negative', () => {
    expect(formatClock(65_000)).toBe('01:05');
    expect(formatClock(-500)).toBe('00:00');
  });
});

describe('formatMyResult', () => {
  it('shows rank and score for a snake that is still alive when time is up', () => {
    expect(formatMyResult({ alive: true, myRank: 3, total: 31, score: 120, finalScore: null })).toBe('내 순위 3 / 31 · 120점');
  });

  it('shows elimination and the final score for a snake that already died', () => {
    expect(formatMyResult({ alive: false, myRank: 0, total: 31, score: 0, finalScore: 45 })).toBe('탈락 · 최종 점수 45점');
  });

  it('shows nothing for someone who never played this round', () => {
    expect(formatMyResult({ alive: false, myRank: 0, total: 31, score: 0, finalScore: null })).toBe('');
  });

  it('shows nothing while the rank is not known yet', () => {
    expect(formatMyResult({ alive: true, myRank: 0, total: 0, score: 10, finalScore: null })).toBe('');
  });
});

describe('RoundClock', () => {
  it('does not report a start for the first message it ever sees', () => {
    const c = new RoundClock();
    expect(c.apply('running', 4, 30_000, 0)).toBe(false);
    expect(c.remaining(10_000)).toBe(20_000);
  });

  it('reports a start when the round number changes while running, and only then', () => {
    const c = new RoundClock();
    c.apply('none', 0, 0, 0);
    expect(c.apply('running', 1, 60_000, 0)).toBe(true);
    expect(c.apply('running', 1, 59_000, 1_000)).toBe(false);
    expect(c.apply('running', 2, 60_000, 2_000)).toBe(true);
    expect(c.apply('ended', 2, 0, 62_000)).toBe(false);
  });
});

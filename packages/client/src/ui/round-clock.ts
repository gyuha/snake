import type { RoundState } from '@snake/shared';

/** Remaining time as MM:SS; partial seconds round up so 00:00 only shows once time is really up. */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export interface MyResult {
  alive: boolean;
  myRank: number;
  total: number;
  score: number;
  finalScore: number | null;
}

/** The player's own line on the end-of-round overlay; empty when there is nothing true to say. */
export function formatMyResult(r: MyResult): string {
  if (r.alive) return r.myRank > 0 ? `내 순위 ${r.myRank} / ${r.total} · ${r.score}점` : '';
  return r.finalScore !== null ? `탈락 · 최종 점수 ${r.finalScore}점` : '';
}

/** Follows the server's round messages and counts the remaining time down locally between them. */
export class RoundClock {
  state: RoundState = 'none';
  private seq: number | null = null;
  private endsAt = 0;

  /** Returns true when this message announces a round start the clock had not seen before. */
  apply(state: RoundState, seq: number, remainingMs: number, nowMs: number): boolean {
    const started = state === 'running' && this.seq !== null && seq !== this.seq;
    this.state = state;
    this.seq = seq;
    this.endsAt = nowMs + remainingMs;
    return started;
  }

  remaining(nowMs: number): number {
    return this.state === 'running' ? Math.max(0, this.endsAt - nowMs) : 0;
  }
}

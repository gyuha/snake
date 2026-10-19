import type { WebSocket } from 'ws';
import { newViewState, type ViewState } from './interest';

export const MAX_MSGS_PER_SEC = 60;
export const MAX_OVER_LIMIT_WINDOWS = 3;

export class Session {
  readonly view: ViewState = newViewState();
  /** Watches the whole world through overview messages; never owns a snake. */
  spectator = false;
  private windowStart = 0;
  private windowCount = 0;
  private overLimitWindows = 0;

  constructor(readonly socket: WebSocket) {}

  /** Fixed one-second windows: excess messages are dropped; three over-limit windows in a row close the socket. */
  admit(nowMs: number): 'ok' | 'drop' | 'close' {
    if (nowMs - this.windowStart >= 1000) {
      this.overLimitWindows = this.windowCount > MAX_MSGS_PER_SEC ? this.overLimitWindows + 1 : 0;
      this.windowStart = nowMs;
      this.windowCount = 0;
    }
    this.windowCount++;
    if (this.overLimitWindows >= MAX_OVER_LIMIT_WINDOWS) return 'close';
    return this.windowCount > MAX_MSGS_PER_SEC ? 'drop' : 'ok';
  }
}

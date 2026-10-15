import { describe, expect, it } from 'vitest';
import {
  TAU, angleDiff, quantizeAngle16, toWireFam, toWireSpeed, type ServerMsg,
} from '@snake/shared';
import { Snake, type SnakeEvent } from '../../server/src/game/snake';
import { seededRng } from '../../server/test/helpers';
import { Mirror } from '../src/state/mirror';

const SERVER_DT = 1 / 30;
const FRAME_DT = 1 / 60;

interface Delivery {
  at: number;
  msgs: ServerMsg[];
}

/** Server messages for one tick of one snake, mirroring what buildFrame sends. */
function tickMessages(s: Snake, events: SnakeEvent[], stateDirty: boolean): ServerMsg[] {
  const out: ServerMsg[] = [];
  for (const e of events) {
    if (e.k === 'move') out.push({ t: 'snakeMove', id: s.id, iang: e.iang });
    else if (e.k === 'grow') out.push({ t: 'snakeGrow', id: s.id, iang: e.iang, fam: toWireFam(e.fam) });
    else out.push({ t: 'snakeShrink', id: s.id, fam: toWireFam(e.fam) });
  }
  if (stateDirty) {
    out.push({ t: 'snakeState', id: s.id, ang: quantizeAngle16(s.ang), wang: quantizeAngle16(s.wang), speed: toWireSpeed(s.speed) });
  }
  return out;
}

/** Runs server + jittery network + 60 fps client; returns per-frame head positions and the server speed. */
function simulate(opts: { seconds: number; latency: number; jitter: number; steerEvery: number; seed: number }) {
  const rng = seededRng(opts.seed);
  const s = new Snake(7, 'bot', 0, true, 8000, 8000, 0);
  s.eat(8);
  const mirror = new Mirror();
  const snap = s.addSnapshot();
  mirror.apply({
    t: 'snakeAdd', id: 7, name: 'bot', skin: 0, animal: 0, ang: quantizeAngle16(s.ang), wang: quantizeAngle16(s.wang),
    speed: toWireSpeed(s.speed), fam: toWireFam(s.fam), tailX: snap.tailX, tailY: snap.tailY, iangs: snap.iangs,
  });

  const queue: Delivery[] = [];
  let lastDelivery = 0;
  let serverTime = 0;
  let nextServerTick = 0;
  const heads: Array<{ x: number; y: number }> = [];
  let speed = s.speed;

  for (let t = 0; t < opts.seconds; t += FRAME_DT) {
    while (nextServerTick <= t) {
      if (Math.round(nextServerTick / SERVER_DT) % Math.round(opts.steerEvery / SERVER_DT) === 0) {
        s.setInput(rng() * TAU, false);
      }
      s.step(SERVER_DT);
      speed = s.speed;
      const msgs = tickMessages(s, s.events, s.stateDirty);
      s.clearEvents();
      // In-order delivery with jitter, like a single TCP/WebSocket connection.
      const at = Math.max(lastDelivery, nextServerTick + opts.latency + (rng() * 2 - 1) * opts.jitter);
      lastDelivery = at;
      if (msgs.length > 0) queue.push({ at, msgs });
      nextServerTick += SERVER_DT;
      serverTime = nextServerTick;
    }
    while (queue.length > 0 && queue[0].at <= t) for (const m of queue.shift()!.msgs) mirror.apply(m);
    mirror.advance(FRAME_DT);
    heads.push(mirror.headOf(mirror.snakes.get(7)!));
  }
  void serverTime;
  return { heads, speed };
}

function stepStats(heads: Array<{ x: number; y: number }>, skip: number) {
  const steps: number[] = [];
  const turns: number[] = [];
  let prevAngle: number | null = null;
  for (let i = skip + 1; i < heads.length; i++) {
    const dx = heads[i].x - heads[i - 1].x;
    const dy = heads[i].y - heads[i - 1].y;
    steps.push(Math.hypot(dx, dy));
    const a = Math.atan2(dy, dx);
    if (prevAngle !== null) turns.push(Math.abs(angleDiff(prevAngle, a)));
    prevAngle = a;
  }
  return { steps, turns };
}

describe('client head motion stays smooth under network jitter', () => {
  const cases = [
    { name: 'steady link', latency: 0.05, jitter: 0.0 },
    { name: 'jittery link', latency: 0.06, jitter: 0.03 },
  ];
  it.each(cases)('$name: no per-frame hitches while turning', ({ latency, jitter }) => {
    const { heads, speed } = simulate({ seconds: 12, latency, jitter, steerEvery: 0.7, seed: 5 });
    const { steps, turns } = stepStats(heads, 60);
    const expected = speed * FRAME_DT;
    const worst = Math.max(...steps.map((d) => Math.abs(d - expected) / expected));
    // A hitch (head snapping to a corrected position) shows up as a step far from speed·dt (was ~1.2 before the fix).
    expect(worst).toBeLessThan(0.12);
    // Physical turn limit is ~0.069 rad per 60 fps frame; corrections may add a little, snaps would add far more.
    expect(Math.max(...turns)).toBeLessThan(0.1);
  });
});

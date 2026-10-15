import { BOT_TARGET, SKIN_COUNT, START_SEGMENTS, TAU, TICK_HZ, WORLD_RADIUS, normAngle } from '@snake/shared';
import type { Food } from '../game/food';
import type { Snake } from '../game/snake';
import type { World } from '../game/world';

const BOT_NAMES = [
  'Viper', 'Mamba', 'Cobra', 'Python', 'Boa', 'Krait', 'Adder', 'Taipan',
  'Asp', 'Racer', 'Garter', 'Kingsnake', 'Sidewinder', 'Rattler', 'Copperhead', 'Anaconda',
];
const DECIDE_EVERY = 3;
const DECISION_DT = DECIDE_EVERY / TICK_HZ;
const EDGE_MARGIN = 600;
const PROBE_COUNT = 9;
const PROBE_SPAN = Math.PI / 2;
const FOOD_SEARCH = 500;
const BOOST_SEARCH = 300;

export interface Brain {
  wanderAngle: number;
  wanderLeft: number;
}

export interface BotDecision {
  wang: number;
  boost: boolean;
}

export class BotController {
  private readonly brains = new Map<number, Brain>();

  constructor(
    private readonly target = BOT_TARGET,
    private readonly rng: () => number = Math.random,
  ) {}

  get count(): number {
    return this.brains.size;
  }

  update(world: World, tick: number): void {
    for (const id of this.brains.keys()) if (!world.snakes.has(id)) this.brains.delete(id);
    while (this.brains.size < this.target) {
      const name = BOT_NAMES[Math.floor(this.rng() * BOT_NAMES.length)];
      const s = world.spawnSnake(name, Math.floor(this.rng() * SKIN_COUNT), true);
      this.brains.set(s.id, { wanderAngle: s.ang, wanderLeft: 0 });
    }
    for (const [id, b] of this.brains) {
      if ((id + tick) % DECIDE_EVERY !== 0) continue;
      const s = world.snakes.get(id);
      if (!s) continue;
      const d = decide(world, s, b, this.rng);
      s.setInput(d.wang, d.boost);
    }
  }
}

/** Distance along `angle` to the first body point of another snake, or `len` if the path is clear. */
function clearance(world: World, s: Snake, angle: number, len: number): number {
  const step = Math.max(10, s.radius);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  for (let d = step; d <= len; d += step) {
    const px = s.headX + ux * d;
    const py = s.headY + uy * d;
    const hit = { found: false };
    world.index.forEachNear(px, py, s.radius + world.index.maxRadius, (e) => {
      if (e.snake === s) return false;
      const limit = s.radius + e.snake.radius;
      const ex = e.x - px;
      const ey = e.y - py;
      if (ex * ex + ey * ey < limit * limit) {
        hit.found = true;
        return true;
      }
      return false;
    });
    if (hit.found) return d;
  }
  return len;
}

export function decide(world: World, s: Snake, brain: Brain, rng: () => number): BotDecision {
  const cx = s.headX - WORLD_RADIUS;
  const cy = s.headY - WORLD_RADIUS;
  if (Math.hypot(cx, cy) > WORLD_RADIUS - EDGE_MARGIN) {
    return { wang: normAngle(Math.atan2(-cy, -cx)), boost: false };
  }

  const probeLen = 150 + 2 * s.radius;
  const ahead = clearance(world, s, s.ang, probeLen);
  if (ahead < probeLen) {
    let best = s.ang;
    let bestClear = ahead;
    let bestOffset = 0;
    for (let i = 0; i < PROBE_COUNT; i++) {
      const offset = -PROBE_SPAN + (2 * PROBE_SPAN * i) / (PROBE_COUNT - 1);
      const c = clearance(world, s, s.ang + offset, probeLen);
      if (c > bestClear || (c === bestClear && Math.abs(offset) < Math.abs(bestOffset))) {
        best = s.ang + offset;
        bestClear = c;
        bestOffset = offset;
      }
    }
    return { wang: normAngle(best), boost: false };
  }

  let target: Food | null = null;
  let bestScore = 0;
  let deathValue = 0;
  for (const f of world.food.queryCircle(s.headX, s.headY, FOOD_SEARCH)) {
    // Food inside the edge band would pull the bot back out right after the edge rule turns it in.
    if (Math.hypot(f.x - WORLD_RADIUS, f.y - WORLD_RADIUS) > WORLD_RADIUS - EDGE_MARGIN) continue;
    const d = Math.max(1, Math.hypot(f.x - s.headX, f.y - s.headY));
    const value = f.value / d;
    if (value > bestScore) {
      bestScore = value;
      target = f;
    }
    if (f.kind === 'death' && d <= BOOST_SEARCH) deathValue += f.value;
  }
  if (target) {
    return {
      wang: normAngle(Math.atan2(target.y - s.headY, target.x - s.headX)),
      boost: deathValue >= 1 && s.sct > START_SEGMENTS + 3,
    };
  }

  brain.wanderLeft -= DECISION_DT;
  if (brain.wanderLeft <= 0) {
    brain.wanderAngle = rng() * TAU;
    brain.wanderLeft = 2 + rng() * 2;
  }
  return { wang: brain.wanderAngle, boost: false };
}

import {
  BOOST_COST, BodyReplica, SEG_SPACING, TICK_DT, angleDiff, dequantizeAngle16, foodId, foodPos,
  fromWireFam, fromWireSpeed, maxTurnRate, normAngle, sectorKey, speedOf, turnToward,
  type LeaderEntry, type ServerMsg, type Vec,
} from '@snake/shared';

export interface SnakeView {
  id: number;
  name: string;
  skin: number;
  animal: number;
  body: BodyReplica;
  ang: number;
  wang: number;
  boosting: boolean;
  fam: number;
  /** Distance travelled since the last committed point; drives the tail glide only. */
  progress: number;
  /** Locally integrated head position (smooth); server events only nudge it. */
  hx: number;
  hy: number;
  /** Correction toward the server's head estimate, applied gradually over the next frames. */
  pendX: number;
  pendY: number;
}

export interface FoodView {
  id: number;
  sector: number;
  x: number;
  y: number;
  size: number;
  color: number;
}

const MAX_EXTRAPOLATION = 1.5 * SEG_SPACING;
/** Time constant for easing in a correction; long enough to hide it, short enough not to drift. */
const CORRECTION_TAU = 0.6;
/** Share of the head error that one server event schedules for correction. */
const CORRECTION_GAIN = 0.25;
/** Beyond this the local head is considered lost (tab was hidden, packet burst) and snaps. */
const SNAP_DISTANCE = 160;
/** Share of the angle error to pull toward the server's (older) heading on each state event. */
const ANGLE_PULL = 0.12;
/** A wire speed this far above the normal speed means the snake is boosting. */
const BOOST_DETECT_MARGIN = 10;

export class Mirror {
  selfId = -1;
  readonly snakes = new Map<number, SnakeView>();
  readonly foods = new Map<number, FoodView>();
  leaderboard: { myRank: number; total: number; entries: LeaderEntry[] } | null = null;
  /** Global rank per snake id, refreshed with each leaderboard message (about 1 Hz). */
  ranks = new Map<number, number>();
  minimap: Uint8Array | null = null;
  death: { killerId: number; finalScore: number } | null = null;

  reset(): void {
    this.selfId = -1;
    this.snakes.clear();
    this.foods.clear();
    this.leaderboard = null;
    this.ranks.clear();
    this.minimap = null;
    this.death = null;
  }

  selfSnake(): SnakeView | undefined {
    return this.snakes.get(this.selfId);
  }

  setLocalWang(angle: number): void {
    const self = this.selfSnake();
    if (self) self.wang = normAngle(angle);
  }

  headOf(s: SnakeView): Vec {
    return { x: s.hx, y: s.hy };
  }

  tailFraction(s: SnakeView): number {
    return Math.max(0, Math.min(1, s.progress / SEG_SPACING));
  }

  /** Where the server's head probably was when it committed `iang`: just past the new point. */
  private scheduleCorrection(s: SnakeView, iang: number): void {
    const p = s.body.head;
    const a = dequantizeAngle16(iang);
    const lead = (speedOf(s.body.points.length, s.boosting) * TICK_DT) / 2;
    const ex = p.x + Math.cos(a) * lead - s.hx;
    const ey = p.y + Math.sin(a) * lead - s.hy;
    if (Math.hypot(ex, ey) > SNAP_DISTANCE) {
      s.hx += ex;
      s.hy += ey;
      s.pendX = 0;
      s.pendY = 0;
      return;
    }
    s.pendX = s.pendX * (1 - CORRECTION_GAIN) + ex * CORRECTION_GAIN;
    s.pendY = s.pendY * (1 - CORRECTION_GAIN) + ey * CORRECTION_GAIN;
  }

  private addFood(sx: number, sy: number, rx: number, ry: number, size: number, color: number): void {
    const id = foodId(sx, sy, rx, ry);
    this.foods.set(id, { id, sector: sectorKey(sx, sy), ...foodPos(sx, sy, rx, ry), size, color });
  }

  apply(msg: ServerMsg): void {
    switch (msg.t) {
      case 'welcome':
        this.selfId = msg.selfId;
        this.death = null;
        return;
      case 'snakeAdd': {
        const body = new BodyReplica(msg.tailX, msg.tailY, msg.iangs);
        const n = body.points.length;
        this.snakes.set(msg.id, {
          id: msg.id,
          name: msg.name,
          skin: msg.skin,
          animal: msg.animal,
          body,
          ang: dequantizeAngle16(msg.ang),
          wang: dequantizeAngle16(msg.wang),
          boosting: fromWireSpeed(msg.speed) > speedOf(n, false) + BOOST_DETECT_MARGIN,
          fam: fromWireFam(msg.fam),
          progress: 0,
          hx: body.head.x,
          hy: body.head.y,
          pendX: 0,
          pendY: 0,
        });
        return;
      }
      case 'snakeRemove':
        this.snakes.delete(msg.id);
        return;
      case 'snakeMove':
      case 'snakeGrow': {
        const s = this.snakes.get(msg.id);
        if (!s) return;
        if (msg.t === 'snakeMove') s.body.applyMove(msg.iang);
        else s.body.applyGrow(msg.iang);
        s.progress = Math.max(0, s.progress - SEG_SPACING);
        this.scheduleCorrection(s, msg.iang);
        if (msg.t === 'snakeGrow') s.fam = fromWireFam(msg.fam);
        return;
      }
      case 'snakeShrink': {
        const s = this.snakes.get(msg.id);
        if (!s) return;
        s.body.applyShrink();
        s.fam = fromWireFam(msg.fam);
        return;
      }
      case 'snakeState': {
        const s = this.snakes.get(msg.id);
        if (!s) return;
        s.boosting = fromWireSpeed(msg.speed) > speedOf(s.body.points.length, false) + BOOST_DETECT_MARGIN;
        if (msg.id === this.selfId) return;
        // The server's heading is one network trip old; pull toward it instead of jumping so turns stay smooth.
        s.ang = normAngle(s.ang + angleDiff(s.ang, dequantizeAngle16(msg.ang)) * ANGLE_PULL);
        s.wang = dequantizeAngle16(msg.wang);
        return;
      }
      case 'snakeFam': {
        const s = this.snakes.get(msg.id);
        if (s) s.fam = fromWireFam(msg.fam);
        return;
      }
      case 'sectorFood':
        for (const f of msg.foods) this.addFood(msg.sx, msg.sy, f.rx, f.ry, f.size, f.color);
        return;
      case 'foodAdd':
        this.addFood(msg.sx, msg.sy, msg.rx, msg.ry, msg.size, msg.color);
        return;
      case 'foodEat':
        this.foods.delete(foodId(msg.sx, msg.sy, msg.rx, msg.ry));
        return;
      case 'sectorLeave': {
        const key = sectorKey(msg.sx, msg.sy);
        for (const [id, f] of this.foods) if (f.sector === key) this.foods.delete(id);
        return;
      }
      case 'leaderboard':
        this.leaderboard = { myRank: msg.myRank, total: msg.total, entries: msg.entries };
        this.ranks = new Map(msg.ranks.map((e) => [e.id, e.rank]));
        return;
      case 'minimap':
        this.minimap = msg.bits;
        return;
      case 'death':
        this.death = { killerId: msg.killerId, finalScore: msg.finalScore };
        return;
      case 'pong':
        return;
    }
  }

  advance(dt: number): void {
    const ease = 1 - Math.exp(-dt / CORRECTION_TAU);
    for (const s of this.snakes.values()) {
      const sct = s.body.points.length;
      const speed = speedOf(sct, s.boosting);
      s.ang = turnToward(s.ang, s.wang, maxTurnRate(sct, s.boosting) * dt);
      s.progress = Math.min(MAX_EXTRAPOLATION, s.progress + speed * dt);
      if (s.boosting) s.fam = Math.max(0, s.fam - BOOST_COST * dt);

      // Integrate the head like the server does, then ease in the scheduled correction.
      const fx = s.pendX * ease;
      const fy = s.pendY * ease;
      s.pendX -= fx;
      s.pendY -= fy;
      s.hx += Math.cos(s.ang) * speed * dt + fx;
      s.hy += Math.sin(s.ang) * speed * dt + fy;

      // With no events (stalled link) never run further ahead of the last known point than one segment and a half.
      const last = s.body.head;
      const dx = s.hx - last.x;
      const dy = s.hy - last.y;
      const d = Math.hypot(dx, dy);
      if (d > MAX_EXTRAPOLATION) {
        s.hx = last.x + (dx / d) * MAX_EXTRAPOLATION;
        s.hy = last.y + (dy / d) * MAX_EXTRAPOLATION;
      }
    }
  }
}

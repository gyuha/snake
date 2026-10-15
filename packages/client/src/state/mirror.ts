import {
  BOOST_COST, BodyReplica, SEG_SPACING, dequantizeAngle16, foodId, foodPos, fromWireFam,
  fromWireSpeed, maxTurnRate, normAngle, sectorKey, speedOf, turnToward,
  type LeaderEntry, type ServerMsg, type Vec,
} from '@snake/shared';

export interface SnakeView {
  id: number;
  name: string;
  skin: number;
  body: BodyReplica;
  ang: number;
  wang: number;
  boosting: boolean;
  fam: number;
  progress: number;
  corrX: number;
  corrY: number;
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
const CORRECTION_TIME = 0.15;
/** A wire speed this far above the normal speed means the snake is boosting. */
const BOOST_DETECT_MARGIN = 10;

export class Mirror {
  selfId = -1;
  readonly snakes = new Map<number, SnakeView>();
  readonly foods = new Map<number, FoodView>();
  leaderboard: { myRank: number; total: number; entries: LeaderEntry[] } | null = null;
  minimap: Uint8Array | null = null;
  death: { killerId: number; finalScore: number } | null = null;

  reset(): void {
    this.selfId = -1;
    this.snakes.clear();
    this.foods.clear();
    this.leaderboard = null;
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

  private rawHead(s: SnakeView): Vec {
    const last = s.body.head;
    return { x: last.x + Math.cos(s.ang) * s.progress, y: last.y + Math.sin(s.ang) * s.progress };
  }

  headOf(s: SnakeView): Vec {
    const h = this.rawHead(s);
    return { x: h.x + s.corrX, y: h.y + s.corrY };
  }

  tailFraction(s: SnakeView): number {
    return Math.max(0, Math.min(1, s.progress / SEG_SPACING));
  }

  /** Runs `change` and folds any jump of the raw head into the decaying correction offset. */
  private keepContinuous(s: SnakeView, change: () => void): void {
    const before = this.rawHead(s);
    change();
    const after = this.rawHead(s);
    s.corrX += before.x - after.x;
    s.corrY += before.y - after.y;
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
          body,
          ang: dequantizeAngle16(msg.ang),
          wang: dequantizeAngle16(msg.wang),
          boosting: fromWireSpeed(msg.speed) > speedOf(n, false) + BOOST_DETECT_MARGIN,
          fam: fromWireFam(msg.fam),
          progress: 0,
          corrX: 0,
          corrY: 0,
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
        this.keepContinuous(s, () => {
          if (msg.t === 'snakeMove') s.body.applyMove(msg.iang);
          else s.body.applyGrow(msg.iang);
          s.progress = Math.max(0, s.progress - SEG_SPACING);
        });
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
        this.keepContinuous(s, () => {
          s.ang = dequantizeAngle16(msg.ang);
        });
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
    const decay = Math.max(0, 1 - dt / CORRECTION_TIME);
    for (const s of this.snakes.values()) {
      const sct = s.body.points.length;
      s.ang = turnToward(s.ang, s.wang, maxTurnRate(sct, s.boosting) * dt);
      s.progress = Math.min(MAX_EXTRAPOLATION, s.progress + speedOf(sct, s.boosting) * dt);
      if (s.boosting) s.fam = Math.max(0, s.fam - BOOST_COST * dt);
      s.corrX *= decay;
      s.corrY *= decay;
    }
  }
}

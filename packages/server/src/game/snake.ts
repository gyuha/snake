import {
  BOOST_COST, BOOST_DROP_INTERVAL, FAM_CAP, MAX_SEGMENTS, SEG_SPACING, START_SEGMENTS,
  bodyRadius, dequantizeAngle16, maxTurnRate, nextPoint, normAngle, quantizeAngle16, score,
  speedOf, turnToward, type Vec,
} from '@snake/shared';

export interface BodyPoint {
  x: number;
  y: number;
  iang: number;
}

export type SnakeEvent =
  | { k: 'move'; iang: number }
  | { k: 'grow'; iang: number; fam: number }
  | { k: 'shrink'; fam: number };

export class Snake {
  points: BodyPoint[] = [];
  headX: number;
  headY: number;
  ang: number;
  wang: number;
  wantBoost = false;
  boosting = false;
  fam = 0;
  kills = 0;
  alive = true;
  events: SnakeEvent[] = [];
  stateDirty = false;
  famDirty = false;
  private boostDropTimer = 0;

  constructor(
    readonly id: number,
    readonly name: string,
    readonly skin: number,
    readonly isBot: boolean,
    x: number,
    y: number,
    ang: number,
  ) {
    const q = quantizeAngle16(ang);
    const a = dequantizeAngle16(q);
    const back = SEG_SPACING * (START_SEGMENTS - 1);
    let p: BodyPoint = { x: x - Math.cos(a) * back, y: y - Math.sin(a) * back, iang: q };
    this.points.push(p);
    for (let i = 1; i < START_SEGMENTS; i++) {
      const n = nextPoint(p, q);
      p = { x: n.x, y: n.y, iang: q };
      this.points.push(p);
    }
    this.headX = p.x;
    this.headY = p.y;
    this.ang = a;
    this.wang = a;
  }

  get sct(): number {
    return this.points.length;
  }

  get radius(): number {
    return bodyRadius(this.sct);
  }

  get speed(): number {
    return speedOf(this.sct, this.boosting);
  }

  get score(): number {
    return score(this.sct, this.fam);
  }

  get tail(): BodyPoint {
    return this.points[0];
  }

  get lastPoint(): BodyPoint {
    return this.points[this.points.length - 1];
  }

  setInput(wang: number, boost: boolean): void {
    const w = normAngle(wang);
    if (w !== this.wang) {
      this.wang = w;
      this.stateDirty = true;
    }
    this.wantBoost = boost;
  }

  /** Advances one tick. Returns tail positions where boost food should be dropped. */
  step(dt: number): Vec[] {
    const drops: Vec[] = [];
    const nowBoost = this.wantBoost && this.sct > START_SEGMENTS;
    if (nowBoost !== this.boosting) {
      this.boosting = nowBoost;
      this.stateDirty = true;
    }

    this.ang = turnToward(this.ang, this.wang, maxTurnRate(this.sct, this.boosting) * dt);
    const dist = this.speed * dt;
    this.headX += Math.cos(this.ang) * dist;
    this.headY += Math.sin(this.ang) * dist;

    const last = this.lastPoint;
    const dx = this.headX - last.x;
    const dy = this.headY - last.y;
    if (dx * dx + dy * dy >= SEG_SPACING * SEG_SPACING) {
      const iang = quantizeAngle16(Math.atan2(dy, dx));
      const n = nextPoint(last, iang);
      const canGrow = this.fam >= 1 && this.points.length < MAX_SEGMENTS;
      this.points.push({ x: n.x, y: n.y, iang });
      if (canGrow) {
        this.fam -= 1;
        this.events.push({ k: 'grow', iang, fam: this.fam });
      } else {
        this.points.shift();
        this.events.push({ k: 'move', iang });
      }
    }

    if (this.boosting) {
      this.fam -= BOOST_COST * dt;
      this.boostDropTimer += dt;
      if (this.boostDropTimer >= BOOST_DROP_INTERVAL) {
        this.boostDropTimer -= BOOST_DROP_INTERVAL;
        drops.push({ x: this.tail.x, y: this.tail.y });
      }
      while (this.fam < 0 && this.points.length > START_SEGMENTS) {
        this.points.shift();
        this.fam += 1;
        this.events.push({ k: 'shrink', fam: this.fam });
      }
      if (this.fam < 0) this.fam = 0;
    } else {
      this.boostDropTimer = 0;
    }
    return drops;
  }

  eat(value: number): void {
    this.fam += value;
    if (this.points.length >= MAX_SEGMENTS) this.fam = Math.min(this.fam, FAM_CAP);
    this.famDirty = true;
  }

  clearEvents(): void {
    this.events = [];
    this.stateDirty = false;
    this.famDirty = false;
  }

  addSnapshot(): { tailX: number; tailY: number; iangs: number[] } {
    return {
      tailX: this.points[0].x,
      tailY: this.points[0].y,
      iangs: this.points.slice(1).map((p) => p.iang),
    };
  }
}

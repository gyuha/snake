import { MINIMAP_SIZE, TAU, WORLD_RADIUS, score } from '@snake/shared';
import type { Mirror } from '../state/mirror';

const MINIMAP_PX = 128;

export class Hud {
  private lastBoard: Mirror['leaderboard'] = null;
  private lastBits: Uint8Array | null = null;
  private readonly mmCtx: CanvasRenderingContext2D;
  private readonly bitsCanvas: HTMLCanvasElement;

  constructor(
    private readonly board: HTMLOListElement,
    private readonly rank: HTMLElement,
    private readonly stats: HTMLElement,
    minimap: HTMLCanvasElement,
  ) {
    minimap.width = MINIMAP_PX;
    minimap.height = MINIMAP_PX;
    this.mmCtx = minimap.getContext('2d')!;
    this.bitsCanvas = document.createElement('canvas');
    this.bitsCanvas.width = MINIMAP_SIZE;
    this.bitsCanvas.height = MINIMAP_SIZE;
  }

  update(m: Mirror): void {
    const self = m.selfSnake();
    this.stats.textContent = self ? `점수 ${score(self.body.points.length, self.fam)}` : '';
    if (m.leaderboard !== this.lastBoard) {
      this.lastBoard = m.leaderboard;
      this.renderBoard();
    }
    if (m.minimap !== this.lastBits) {
      this.lastBits = m.minimap;
      this.renderBits();
    }
    this.drawMinimap(m);
  }

  private renderBoard(): void {
    const lb = this.lastBoard;
    this.board.replaceChildren();
    if (!lb) {
      this.rank.textContent = '';
      return;
    }
    for (const e of lb.entries) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = e.name; // textContent: player names are untrusted
      const pts = document.createElement('span');
      pts.textContent = String(e.score);
      li.append(name, pts);
      this.board.append(li);
    }
    this.rank.textContent = lb.myRank > 0 ? `내 순위 ${lb.myRank} / ${lb.total}` : `참가자 ${lb.total}`;
  }

  private renderBits(): void {
    const g = this.bitsCanvas.getContext('2d')!;
    const img = g.createImageData(MINIMAP_SIZE, MINIMAP_SIZE);
    const bits = this.lastBits;
    if (bits) {
      for (let idx = 0; idx < MINIMAP_SIZE * MINIMAP_SIZE; idx++) {
        if ((bits[idx >> 3] & (0x80 >> (idx & 7))) === 0) continue;
        img.data[idx * 4] = 255;
        img.data[idx * 4 + 1] = 255;
        img.data[idx * 4 + 2] = 255;
        img.data[idx * 4 + 3] = 150;
      }
    }
    g.putImageData(img, 0, 0);
  }

  private drawMinimap(m: Mirror): void {
    const g = this.mmCtx;
    g.clearRect(0, 0, MINIMAP_PX, MINIMAP_PX);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.bitsCanvas, 0, 0, MINIMAP_PX, MINIMAP_PX);
    g.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(MINIMAP_PX / 2, MINIMAP_PX / 2, MINIMAP_PX / 2 - 1, 0, TAU);
    g.stroke();
    const self = m.selfSnake();
    if (!self) return;
    const h = m.headOf(self);
    const k = MINIMAP_PX / (2 * WORLD_RADIUS);
    g.fillStyle = '#ff4d5e';
    g.beginPath();
    g.arc(h.x * k, h.y * k, 3, 0, TAU);
    g.fill();
  }
}

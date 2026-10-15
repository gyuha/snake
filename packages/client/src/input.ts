const KEY_TURN_RATE = 3; // rad/s while an arrow key is held

export class Input {
  angle = 0;
  private mouseBoost = false;
  private keyBoost = false;
  private keyTurn = 0;

  constructor(canvas: HTMLCanvasElement) {
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.angle = Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2);
    });
    canvas.addEventListener('mousedown', () => {
      this.mouseBoost = true;
    });
    window.addEventListener('mouseup', () => {
      this.mouseBoost = false;
    });
    window.addEventListener('blur', () => {
      this.mouseBoost = false;
      this.keyBoost = false;
      this.keyTurn = 0;
    });
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') this.keyBoost = true;
      else if (e.code === 'ArrowLeft') this.keyTurn = -1;
      else if (e.code === 'ArrowRight') this.keyTurn = 1;
      else return;
      e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.keyBoost = false;
      else if ((e.code === 'ArrowLeft' && this.keyTurn < 0) || (e.code === 'ArrowRight' && this.keyTurn > 0)) this.keyTurn = 0;
    });
  }

  get boost(): boolean {
    return this.mouseBoost || this.keyBoost;
  }

  update(dt: number): void {
    if (this.keyTurn !== 0) this.angle += this.keyTurn * KEY_TURN_RATE * dt;
  }
}

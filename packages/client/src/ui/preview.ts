import { drawEyes, drawHead, drawTail } from '../render/animals';
import { SKINS } from '../render/palette';

const R = 26;

/** A short straight snake with the chosen animal's tail and head, centred on the canvas. */
export function drawPreview(canvas: HTMLCanvasElement, animal: number, skin: number): void {
  const ctx = canvas.getContext('2d')!;
  const [main, stripe] = SKINS[skin % SKINS.length];
  const y = canvas.height / 2;
  const tail = { x: canvas.width * 0.22, y };
  const head = { x: canvas.width * 0.72, y };
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tail.x, y);
  ctx.lineTo(head.x, y);
  ctx.strokeStyle = main;
  ctx.lineWidth = 2 * R;
  ctx.stroke();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = stripe;
  ctx.lineWidth = R * 0.7;
  ctx.stroke();
  ctx.globalAlpha = 1;
  drawTail(ctx, animal, tail, 0, R, main, stripe);
  drawHead(ctx, animal, head, 0, R, main, stripe);
  drawEyes(ctx, head, 0, R);
}

/** A head-only icon for the animal picker buttons. */
export function drawAnimalIcon(canvas: HTMLCanvasElement, animal: number, skin: number): void {
  const ctx = canvas.getContext('2d')!;
  const [main, stripe] = SKINS[skin % SKINS.length];
  const head = { x: canvas.width * 0.42, y: canvas.height / 2 };
  const r = canvas.height * 0.26;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = main;
  ctx.beginPath();
  ctx.arc(head.x, head.y, r, 0, 2 * Math.PI);
  ctx.fill();
  drawHead(ctx, animal, head, 0, r, main, stripe);
  drawEyes(ctx, head, 0, r);
}

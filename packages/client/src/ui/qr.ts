import qrcode from 'qrcode-generator';

/** QR modules for `text` (true = dark), smallest version that fits, medium error correction. */
export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** Draws the code on a canvas with a whole number of pixels per module so edges stay crisp. */
export function drawQr(canvas: HTMLCanvasElement, text: string, targetPx: number): void {
  const modules = qrModules(text);
  const n = modules.length;
  const cell = Math.max(1, Math.floor(targetPx / n));
  canvas.width = cell * n;
  canvas.height = cell * n;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#10141c';
  modules.forEach((row, r) => row.forEach((dark, c) => {
    if (dark) g.fillRect(c * cell, r * cell, cell, cell);
  }));
}

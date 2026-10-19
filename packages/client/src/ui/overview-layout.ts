import { WORLD_RADIUS } from '@snake/shared';

export interface MapLayout {
  cx: number;
  cy: number;
  radius: number;
  scale: number;
}

/** Fits the circular world into a width × height area, centered, leaving `margin` px around it. */
export function fitWorld(width: number, height: number, margin: number): MapLayout {
  const radius = Math.max(1, Math.min(width, height) / 2 - margin);
  return { cx: width / 2, cy: height / 2, radius, scale: radius / WORLD_RADIUS };
}

export function worldToScreen(layout: MapLayout, x: number, y: number): { x: number; y: number } {
  return {
    x: layout.cx + (x - WORLD_RADIUS) * layout.scale,
    y: layout.cy + (y - WORLD_RADIUS) * layout.scale,
  };
}

export interface RankStyle {
  dotRadius: number;
  labelPx: number;
  ring: string | null;
  bold: boolean;
}

const PLAIN: RankStyle = { dotRadius: 5, labelPx: 11, ring: null, bold: false };
const PODIUM: readonly RankStyle[] = [
  { dotRadius: 10, labelPx: 16, ring: '#ffd54a', bold: true },
  { dotRadius: 8, labelPx: 14, ring: '#cfd8e3', bold: true },
  { dotRadius: 7, labelPx: 13, ring: '#d98b4a', bold: true },
];

/** Map style for the snake at 0-based rank `index`; only the top three stand out. */
export function rankStyle(index: number): RankStyle {
  return PODIUM[index] ?? PLAIN;
}

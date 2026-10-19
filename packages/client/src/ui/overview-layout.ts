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

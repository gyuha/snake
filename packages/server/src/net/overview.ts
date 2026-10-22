import { quantizeAngle16, quantizeCoord, type ServerMsg } from '@snake/shared';
import type { World } from '../game/world';

const MAX_U24 = 0xffffff;

/** Every snake in the world (players and bots), best score first, for spectator screens. */
export function buildOverview(world: World): ServerMsg {
  return {
    t: 'overview',
    snakes: world.leaderboard().map((s) => ({
      id: s.id,
      skin: s.skin,
      animal: s.animal,
      name: s.name,
      x: quantizeCoord(s.headX),
      y: quantizeCoord(s.headY),
      ang: quantizeAngle16(s.ang),
      score: Math.min(s.score, MAX_U24),
    })),
  };
}

export const TICK_HZ = 30;
export const TICK_DT = 1 / TICK_HZ;

export const WORLD_RADIUS = 8000;
export const SECTOR_SIZE = 480;
export const SECTORS_PER_EDGE = Math.ceil((2 * WORLD_RADIUS) / SECTOR_SIZE); // 34

export const SEG_SPACING = 42;
export const MSCPS = 411;
export const MAX_SEGMENTS = 300;
export const START_SEGMENTS = 2;

export const NSP1 = 4.25;
export const NSP2 = 0.5;
export const BOOST_SP = 12;
/** The original moves sp/4 units per 8 ms frame → 31.25·sp units per second. */
export const SPEED_SCALE = 31.25;
export const MAMU = 0.033;
/** 8 ms frames per second; MAMU·TURN_SCALE = 4.125 rad/s. */
export const TURN_SCALE = 125;
export const SPANGDV = 4.8;
export const BODY_RADIUS_PER_SC = 14;

export const BOOST_COST = 0.8;
export const BOOST_RECYCLE = 0.6;
export const BOOST_DROP_INTERVAL = 0.25;
export const BOOST_FOOD_SIZE = 3;

export const NATURAL_FOOD_TARGET = 4000;
export const FOOD_RESPAWN_PER_TICK = 50;
export const NATURAL_FOOD_VALUE_PER_SIZE = 0.05;
export const DEATH_FOOD_SIZE = 8;
export const DEATH_FOOD_VALUE = 0.4;
export const EAT_MARGIN = 25;
export const FOOD_COLORS = 9;

export const BOT_TARGET = 30;
export const SPAWN_RADIUS_FRAC = 0.7;
export const SPAWN_CLEARANCE = 300;
export const FAM_CAP = 0.999;

export const MAX_NAME_BYTES = 24;
export const SKIN_COUNT = 8;
/** Head/tail shapes; the wire carries the index. */
export const ANIMALS = ['default', 'dog', 'cat', 'snake', 'panda', 'rabbit'] as const;
export const ANIMAL_COUNT = ANIMALS.length;
export const NO_KILLER = 0xffff;
export const MINIMAP_SIZE = 64;
export const LEADERBOARD_SIZE = 10;

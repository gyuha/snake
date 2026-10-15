# Snake 클론 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** slither.io 메커니즘을 독자 구현한 멀티플레이 뱀 게임(권위 서버 + Canvas 클라이언트 + 서버 봇)을 만든다.

**Architecture:** npm workspaces 모노레포. `@snake/shared`(상수·물리·프로토콜·몸통 재구성)를 서버와 클라이언트가 함께 쓴다. 서버는 30 Hz 고정 틱 권위 시뮬레이션을 돌리고, 섹터 기반 AOI 차분을 세그먼트 단위 바이너리 이벤트로 보낸다. 클라이언트는 이벤트로 몸통을 정확히 재구성하고 이벤트 사이는 외삽한다.

**Tech Stack:** Node.js 22, TypeScript 5, `ws` 8, Vite 5, Vitest 2, `tsx`, `concurrently`, HTML5 Canvas 2D.

**Spec:** `docs/superpowers/specs/2026-10-15-snake-clone-design.md`

## Global Constraints

- 원본 slither.io의 코드·에셋·프로토콜 바이트 포맷을 복제하지 않는다. 메커니즘 공식만 재구현한다.
- 상수는 스펙 §4 값을 그대로 쓴다: `TICK_HZ=30`, `WORLD_RADIUS=8000`, `SECTOR_SIZE=480`, `SEG_SPACING=42`, `MSCPS=411`, `MAX_SEGMENTS=300`, `START_SEGMENTS=2`, `NSP1=4.25`, `NSP2=0.5`, `BOOST_SP=12`, `SPEED_SCALE=31.25`, `MAMU=0.033`, `SPANGDV=4.8`, `BODY_RADIUS=14·sc`, `BOOST_COST=0.8`, `BOOST_RECYCLE=0.6`, `NATURAL_FOOD_TARGET=4000`, `FOOD_RESPAWN_PER_TICK=50`, `BOT_TARGET=30`.
- 프로토콜 정수는 빅엔디언. 각도 u16 = `round(a·65536/2π) mod 65536`, 입력 각도 u8, 속도 u8 = 유닛/s ÷ 2, `fam` u16 = `round(min(fam,1)·65535)`, 이름 최대 24 UTF-8 바이트.
- 서버는 틱당 접속별 WebSocket 프레임 1개에 메시지를 이어 붙인다(WELCOME·PONG은 즉시 단독 프레임).
- 렌더링 라이브러리 없음(Canvas 2D 직접). 런타임 의존성은 `ws`뿐.
- 테스트는 `packages/<pkg>/test/*.test.ts`에 둔다. 소스 옆에 두지 않는다.
- 모든 작업은 `feature/snake-clone` 브랜치. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 성공 기준(스펙 §1): 헤드리스 100 + 봇 30에서 틱 평균 ≤ 10 ms, 클라이언트당 평균 수신 ≤ 10 KB/s. 재구성 점 오차 ≤ 1e-3.

## Review Focus

1. 깨진/악의적 클라이언트 프레임(빈 프레임, 쓰레기 바이트, 잘린 JOIN) → 해당 접속만 1008로 종료되고 서버와 다른 접속은 계속 동작해야 한다. → Task 7 테스트 `garbage frame closes only that socket`.
2. 살아 있는 상태에서 연결 종료 → 뱀이 먹이로 바뀌고 다른 뷰어는 `reason=1`로 제거를 받아야 하며 서버가 죽지 않아야 한다. → Task 5 `killSnake outside tick is reported in next tick deaths`, Task 7 `disconnect while alive drops food`.
3. 월드 가장자리 섹터(34번째 섹터는 원 밖으로 일부 나감) → 좌표 클램프, 원 밖 먹이 생성 거부. → Task 1 `sectorCoord clamps`, Task 4 `rejects food outside world`.
4. 이모지·한글 등 다중 바이트 이름과 제어 문자 → 24바이트에서 문자 경계를 깨지 않고 자르고 제어 문자를 제거해야 한다. → Task 2 `sanitizeName`.
5. 한 섹터 먹이 255개 초과(사망 먹이 밀집) → `SECTOR_FOOD`가 여러 메시지로 나뉘어 모두 전달돼야 한다. → Task 6 `splits sector food over 255`.

## 파일 구조

| 파일 | 책임 |
|---|---|
| `package.json`, `tsconfig.base.json`, `vitest.config.ts` | 워크스페이스, 공통 TS 설정, 테스트 러너 |
| `packages/shared/src/constants.ts` | 게임 상수 |
| `packages/shared/src/physics.ts` | 크기·속도·회전·점수·줌 공식, 각도 양자화, `nextPoint`, 섹터/먹이 좌표 |
| `packages/shared/src/protocol.ts` | opcode, 메시지 타입, `Writer`/`Reader`, 인코더/디코더, `sanitizeName` |
| `packages/shared/src/body.ts` | `BodyReplica` — 이벤트로 몸통 점 재구성 (클라이언트 미러·동기화 테스트 공용) |
| `packages/shared/src/index.ts` | 재export |
| `packages/server/src/game/snake.ts` | 뱀 상태, 회전·전진·커밋·성장·부스트, 이벤트 기록 |
| `packages/server/src/game/food.ts` | 섹터별 먹이 저장소, 스폰, 틱 이벤트 |
| `packages/server/src/game/collision.ts` | 몸통 점 공간 해시(충돌·봇 탐침·스폰 여유 검사) + 섹터→뱀 인덱스 |
| `packages/server/src/game/world.ts` | 월드 틱: 이동→섭취→해시 재구성→충돌→사망→리스폰 |
| `packages/server/src/net/interest.ts` | 세션별 AOI 차분 → 프레임 직렬화, 리더보드·미니맵 메시지 |
| `packages/server/src/net/session.ts` | 접속 상태, 입력 레이트 리밋 |
| `packages/server/src/server.ts` | HTTP+WS 서버, 틱 루프, 백프레셔, 통계 |
| `packages/server/src/bots/bot.ts` | 봇 보충과 의사결정 |
| `packages/server/src/index.ts` | 실행 진입점 |
| `packages/client/index.html`, `vite.config.ts` | 페이지와 개발 서버 |
| `packages/client/src/state/mirror.ts` | 서버 상태 미러 + 외삽 (순수 로직) |
| `packages/client/src/net/connection.ts` | WebSocket 래퍼 |
| `packages/client/src/input.ts` | 마우스·키보드 입력 |
| `packages/client/src/render/renderer.ts` | 카메라, 배경, 먹이, 뱀 그리기 |
| `packages/client/src/ui/hud.ts` | 리더보드, 미니맵, 점수 |
| `packages/client/src/main.ts` | 화면 전환과 메인 루프 |
| `scripts/loadtest.ts` | 헤드리스 부하 테스트 |

## 스펙과의 차이 (의도적)

| 스펙 | 이 계획 | 이유 |
|---|---|---|
| §6.1 섹터→뱀 인덱스 증분 갱신 | 충돌 해시와 함께 매 틱 재구성 (Task 5) | 점 약 13,000개 재삽입으로 코드가 단순해지고 결과는 같다. 성능은 Task 11에서 검증 |
| §8 "접속 → WELCOME → JOIN" | JOIN으로 스폰할 때마다 WELCOME 전송 (Task 7) | `selfId`는 스폰 전에 정할 수 없다. JOIN 전에는 월드 중심 관전 프레임을 받는다 |
| §9.2 먹이 글로우 "사전 렌더 스프라이트" | 반투명 큰 원 + 불투명 원 2회 그리기 (Task 10) | 화면 내 먹이 수백 개 수준에서 충분하고 코드가 짧다. 프레임 저하가 보이면 스프라이트로 바꾼다 |
| §6.1, §11에 없음 | 부스트 중 `fam` 감소는 `SNAKE_FAM`으로 보내지 않고 클라이언트가 같은 공식으로 감소, `SNAKE_SHRINK`가 권위값 전달 (Task 3, 9) | 부스트 중인 뱀마다 틱당 5바이트 × 뷰어 수를 아낀다 |
| §7 `SNAKE_STATE.speed` | 클라이언트는 이 값을 부스트 여부 판정에만 쓰고 실제 속도는 `speedOf(sct, boosting)`으로 계산 (Task 9) | 성장에 따른 미세한 속도 변화를 별도 메시지 없이 양쪽이 같게 계산 |

---

### Task 1: 모노레포 스캐폴드 + shared 상수·물리

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Create: `packages/shared/src/constants.ts`, `packages/shared/src/physics.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/test/physics.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces (`@snake/shared`):
  - 상수: `TICK_HZ, TICK_DT, WORLD_RADIUS, SECTOR_SIZE, SECTORS_PER_EDGE, SEG_SPACING, MSCPS, MAX_SEGMENTS, START_SEGMENTS, NSP1, NSP2, BOOST_SP, SPEED_SCALE, MAMU, TURN_SCALE, SPANGDV, BODY_RADIUS_PER_SC, BOOST_COST, BOOST_RECYCLE, BOOST_DROP_INTERVAL, NATURAL_FOOD_TARGET, FOOD_RESPAWN_PER_TICK, BOT_TARGET, EAT_MARGIN, NATURAL_FOOD_VALUE_PER_SIZE, DEATH_FOOD_SIZE, DEATH_FOOD_VALUE, BOOST_FOOD_SIZE, MAX_NAME_BYTES, SPAWN_RADIUS_FRAC, SPAWN_CLEARANCE, FAM_CAP, NO_KILLER, SKIN_COUNT, FOOD_COLORS, MINIMAP_SIZE, LEADERBOARD_SIZE`
  - `TAU: number`, `interface Vec { x: number; y: number }`
  - `sizeScale(sct: number): number`, `turnScale(sc: number): number`, `speedOf(sct: number, boosting: boolean): number` (유닛/s), `maxTurnRate(sct: number, boosting: boolean): number` (rad/s), `bodyRadius(sct: number): number`, `score(sct: number, fam: number): number`
  - `normAngle(a: number): number` ([0, 2π)), `angleDiff(from: number, to: number): number` ((−π, π]), `turnToward(ang: number, wang: number, maxDelta: number): number`
  - `quantizeAngle16(a: number): number`, `dequantizeAngle16(q: number): number`, `quantizeAngle8(a: number): number`, `dequantizeAngle8(q: number): number`
  - `nextPoint(prev: Vec, iang: number): Vec`
  - `zoom(sct: number): number`, `viewRadius(sct: number): number`
  - `sectorCoord(v: number): number` (0..SECTORS_PER_EDGE−1로 클램프), `sectorKey(sx: number, sy: number): number`, `foodId(sx: number, sy: number, rx: number, ry: number): number`, `foodPos(sx: number, sy: number, rx: number, ry: number): Vec`

- [ ] **Step 1: 루트 워크스페이스 파일 작성**

`package.json`:
```json
{
  "name": "snake",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "concurrently -n server,client -c green,yellow \"npm run dev -w @snake/server\" \"npm run dev -w @snake/client\"",
    "test": "vitest run",
    "typecheck": "tsc -p packages/shared && tsc -p packages/server && tsc -p packages/client",
    "loadtest": "tsx scripts/loadtest.ts"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "lib": ["ES2022"]
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    testTimeout: 20000,
  },
});
```

`.gitignore`:
```
node_modules/
dist/
*.log
```

- [ ] **Step 2: shared 패키지 파일 작성**

`packages/shared/package.json`:
```json
{
  "name": "@snake/shared",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

- [ ] **Step 3: 개발 의존성 설치**

Run:
```bash
npm install -D typescript@^5.6.3 vitest@^2.1.4 tsx@^4.19.2 concurrently@^9.1.0 @types/node@^22.9.0
```
Expected: `node_modules/` 생성, `package-lock.json` 생성, 오류 없음.

- [ ] **Step 4: 실패하는 물리 테스트 작성**

`packages/shared/test/physics.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  SEG_SPACING, TAU, angleDiff, bodyRadius, dequantizeAngle16, foodId, foodPos, maxTurnRate,
  nextPoint, quantizeAngle16, quantizeAngle8, score, sectorCoord, sectorKey, sizeScale,
  speedOf, turnToward, viewRadius, dequantizeAngle8,
} from '../src/index';

describe('size and speed formulas (spec §2.1)', () => {
  it('sizeScale follows the original curve and caps at 6', () => {
    expect(sizeScale(2)).toBe(1);
    expect(sizeScale(108)).toBe(2);
    expect(sizeScale(10000)).toBe(6);
  });
  it('speedOf converts sp to units per second', () => {
    expect(speedOf(2, false)).toBeCloseTo(4.75 * 31.25, 6);
    expect(speedOf(2, true)).toBe(375);
  });
  it('maxTurnRate = 4.125 * scang * min(1, sp/4.8)', () => {
    expect(maxTurnRate(2, false)).toBeCloseTo(4.125 * (4.75 / 4.8), 6);
    expect(maxTurnRate(2, true)).toBeCloseTo(4.125, 6);
    expect(maxTurnRate(300, false)).toBeLessThan(maxTurnRate(2, false));
  });
  it('bodyRadius is 14 * sc', () => {
    expect(bodyRadius(2)).toBe(14);
    expect(bodyRadius(108)).toBe(28);
  });
});

describe('score (spec §5.1 check values)', () => {
  it.each([
    [2, 10], [10, 133], [100, 2029], [300, 20245],
  ])('score(%i, 0) = %i', (sct, expected) => {
    expect(score(sct, 0)).toBe(expected);
  });
  it('caps segments at MAX_SEGMENTS', () => {
    expect(score(400, 0)).toBe(score(300, 0));
  });
  it('fam adds fractional score and is clamped to [0,1]', () => {
    expect(score(10, 0.5)).toBeGreaterThan(score(10, 0));
    expect(score(10, 5)).toBe(score(10, 1));
  });
});

describe('angles', () => {
  it('quantize16 round trip error is at most half a step', () => {
    for (let i = 0; i < 1000; i++) {
      const a = (i / 1000) * TAU * 3 - TAU;
      const back = dequantizeAngle16(quantizeAngle16(a));
      expect(Math.abs(angleDiff(a, back))).toBeLessThanOrEqual(TAU / 65536 / 2 + 1e-12);
    }
  });
  it('quantize wraps at 2π', () => {
    expect(quantizeAngle16(TAU - 1e-9)).toBe(0);
    expect(quantizeAngle8(TAU - 1e-9)).toBe(0);
    expect(dequantizeAngle8(64)).toBeCloseTo(Math.PI / 2, 12);
  });
  it('angleDiff returns the shortest signed difference', () => {
    expect(angleDiff(0.1, TAU - 0.1)).toBeCloseTo(-0.2, 12);
    expect(angleDiff(TAU - 0.1, 0.1)).toBeCloseTo(0.2, 12);
  });
  it('turnToward clamps to maxDelta and takes the short way', () => {
    expect(turnToward(0, 1, 0.5)).toBeCloseTo(0.5, 12);
    expect(turnToward(0, 0.2, 0.5)).toBeCloseTo(0.2, 12);
    expect(turnToward(0.1, TAU - 0.1, 0.05)).toBeCloseTo(0.05, 12);
  });
});

describe('geometry helpers', () => {
  it('nextPoint moves exactly SEG_SPACING', () => {
    const p = nextPoint({ x: 100, y: 200 }, quantizeAngle16(1.234));
    expect(Math.hypot(p.x - 100, p.y - 200)).toBeCloseTo(SEG_SPACING, 9);
  });
  it('sectorCoord clamps to the grid', () => {
    expect(sectorCoord(-5)).toBe(0);
    expect(sectorCoord(480)).toBe(1);
    expect(sectorCoord(99999)).toBe(33);
  });
  it('sectorKey and foodId pack coordinates', () => {
    expect(sectorKey(2, 3)).toBe(2 * 34 + 3);
    expect(foodId(33, 33, 255, 255)).toBe(0x2121ffff);
  });
  it('foodPos maps sector-relative bytes to world units', () => {
    expect(foodPos(1, 2, 128, 0)).toEqual({ x: 720, y: 960 });
  });
  it('viewRadius grows with size', () => {
    expect(viewRadius(2)).toBe(1300);
    expect(viewRadius(300)).toBeGreaterThan(1300);
  });
});
```

- [ ] **Step 5: 테스트 실패 확인**

Run: `npx vitest run packages/shared/test/physics.test.ts`
Expected: FAIL — `Failed to resolve import "../src/index"`.

- [ ] **Step 6: 상수 작성**

`packages/shared/src/constants.ts`:
```ts
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
export const NO_KILLER = 0xffff;
export const MINIMAP_SIZE = 64;
export const LEADERBOARD_SIZE = 10;
```

- [ ] **Step 7: 물리 공식 작성**

`packages/shared/src/physics.ts`:
```ts
import {
  BODY_RADIUS_PER_SC, BOOST_SP, MAMU, MAX_SEGMENTS, MSCPS, NSP1, NSP2, SECTORS_PER_EDGE,
  SECTOR_SIZE, SEG_SPACING, SPANGDV, SPEED_SCALE, TURN_SCALE,
} from './constants';

export const TAU = Math.PI * 2;

export interface Vec {
  x: number;
  y: number;
}

export function sizeScale(sct: number): number {
  return Math.min(6, 1 + (sct - 2) / 106);
}

export function turnScale(sc: number): number {
  return 0.13 + 0.87 * ((7 - sc) / 6) ** 2;
}

function spOf(sct: number, boosting: boolean): number {
  return boosting ? BOOST_SP : NSP1 + NSP2 * sizeScale(sct);
}

export function speedOf(sct: number, boosting: boolean): number {
  return spOf(sct, boosting) * SPEED_SCALE;
}

export function maxTurnRate(sct: number, boosting: boolean): number {
  const sp = spOf(sct, boosting);
  return MAMU * TURN_SCALE * turnScale(sizeScale(sct)) * Math.min(1, sp / SPANGDV);
}

export function bodyRadius(sct: number): number {
  return BODY_RADIUS_PER_SC * sizeScale(sct);
}

const FMLTS: number[] = [];
const FPSLS: number[] = [0];
for (let i = 0; i < MSCPS; i++) FMLTS.push((1 - i / MSCPS) ** 2.25);
FMLTS.push(FMLTS[MSCPS - 1]);
for (let i = 1; i <= MSCPS; i++) FPSLS.push(FPSLS[i - 1] + 1 / FMLTS[i - 1]);

export function score(sct: number, fam: number): number {
  const s = Math.max(1, Math.min(sct, MAX_SEGMENTS));
  const f = Math.max(0, Math.min(fam, 1));
  return Math.floor((FPSLS[s] + f / FMLTS[s] - 1) * 15 - 5);
}

export function normAngle(a: number): number {
  const r = a % TAU;
  return r < 0 ? r + TAU : r;
}

export function angleDiff(from: number, to: number): number {
  let d = normAngle(to - from);
  if (d > Math.PI) d -= TAU;
  return d;
}

export function turnToward(ang: number, wang: number, maxDelta: number): number {
  const d = angleDiff(ang, wang);
  if (Math.abs(d) <= maxDelta) return normAngle(wang);
  return normAngle(ang + Math.sign(d) * maxDelta);
}

export function quantizeAngle16(a: number): number {
  return Math.round((normAngle(a) * 65536) / TAU) & 0xffff;
}

export function dequantizeAngle16(q: number): number {
  return ((q & 0xffff) * TAU) / 65536;
}

export function quantizeAngle8(a: number): number {
  return Math.round((normAngle(a) * 256) / TAU) & 0xff;
}

export function dequantizeAngle8(q: number): number {
  return ((q & 0xff) * TAU) / 256;
}

/** Every body point is prev + SEG_SPACING·dir(iang); server and client share this exact arithmetic. */
export function nextPoint(prev: Vec, iang: number): Vec {
  const a = dequantizeAngle16(iang);
  return { x: prev.x + Math.cos(a) * SEG_SPACING, y: prev.y + Math.sin(a) * SEG_SPACING };
}

export function zoom(sct: number): number {
  return 1 + 0.25 * (sizeScale(sct) - 1);
}

export function viewRadius(sct: number): number {
  return 1100 * zoom(sct) + 200;
}

export function sectorCoord(v: number): number {
  return Math.max(0, Math.min(SECTORS_PER_EDGE - 1, Math.floor(v / SECTOR_SIZE)));
}

export function sectorKey(sx: number, sy: number): number {
  return sx * SECTORS_PER_EDGE + sy;
}

export function foodId(sx: number, sy: number, rx: number, ry: number): number {
  return ((sx << 24) | (sy << 16) | (rx << 8) | ry) >>> 0;
}

export function foodPos(sx: number, sy: number, rx: number, ry: number): Vec {
  return {
    x: sx * SECTOR_SIZE + (rx * SECTOR_SIZE) / 256,
    y: sy * SECTOR_SIZE + (ry * SECTOR_SIZE) / 256,
  };
}
```

`packages/shared/src/index.ts`:
```ts
export * from './constants';
export * from './physics';
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `npx vitest run packages/shared/test/physics.test.ts`
Expected: PASS (전체 통과). `score` 검산값이 다르면 `FMLTS`/`FPSLS` 인덱싱을 스펙 §2.1과 대조한다.

Run: `npx tsc -p packages/shared`
Expected: 출력 없음(오류 0).

- [ ] **Step 9: 커밋**

```bash
git add package.json package-lock.json tsconfig.base.json vitest.config.ts .gitignore packages/shared
git commit -m "feat(shared): add game constants and physics formulas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: 바이너리 프로토콜 코덱

**Files:**
- Create: `packages/shared/src/protocol.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/protocol.test.ts`

**Interfaces:**
- Consumes: Task 1 상수 `MAX_NAME_BYTES`, `SKIN_COUNT`, `MINIMAP_SIZE`
- Produces (`@snake/shared`):
  - `class ProtocolError extends Error`
  - `C2S = { JOIN: 0x01, STEER: 0x02, BOOST: 0x03, PING: 0x04 }`, `S2C = { WELCOME: 0x10, SNAKE_ADD: 0x11, SNAKE_REMOVE: 0x12, SNAKE_MOVE: 0x13, SNAKE_GROW: 0x14, SNAKE_SHRINK: 0x15, SNAKE_STATE: 0x16, SNAKE_FAM: 0x17, SECTOR_FOOD: 0x20, FOOD_ADD: 0x21, FOOD_EAT: 0x22, SECTOR_LEAVE: 0x23, LEADERBOARD: 0x30, MINIMAP: 0x31, DEATH: 0x32, PONG: 0x33 }`
  - `type ClientMsg`, `type ServerMsg`, `interface FoodWire { rx; ry; size; color }`, `interface LeaderEntry { score; name }` (정확한 필드는 아래 코드)
  - `class Writer { length: number; u8(v): this; u16(v): this; u24(v): this; f64(v): this; bytes(b: Uint8Array): this; str(s: string): this; finish(): Uint8Array }`
  - `class Reader { constructor(buf: Uint8Array); remaining: number; u8(); u16(); u24(); f64(); bytes(n); str() }`
  - `encodeClient(msg: ClientMsg): Uint8Array`, `decodeClient(buf: Uint8Array): ClientMsg`
  - `encodeServer(w: Writer, msg: ServerMsg): void`, `decodeServerFrame(buf: Uint8Array): ServerMsg[]`
  - `sanitizeName(raw: string): string`
  - 메시지의 각도·속도·fam 필드는 **이미 양자화된 정수**다. 변환은 호출자가 Task 1 함수로 한다.

- [ ] **Step 1: 실패하는 프로토콜 테스트 작성**

`packages/shared/test/protocol.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  C2S, ProtocolError, Writer, decodeClient, decodeServerFrame, encodeClient, encodeServer,
  sanitizeName, type ClientMsg, type ServerMsg,
} from '../src/index';

const clientMsgs: ClientMsg[] = [
  { t: 'join', name: '뱀왕😀', skin: 7 },
  { t: 'steer', angle: 200 },
  { t: 'boost', on: true },
  { t: 'boost', on: false },
  { t: 'ping' },
];

const serverMsgs: ServerMsg[] = [
  { t: 'welcome', selfId: 3, worldRadius: 8000, sectorSize: 480, segSpacing: 42, tickHz: 30, mscps: 411, maxSegments: 300 },
  { t: 'snakeAdd', id: 65000, name: 'bot', skin: 2, ang: 1, wang: 65535, speed: 188, fam: 32768, tailX: 1234.567891234, tailY: 9876.54321, iangs: [0, 100, 65535] },
  { t: 'snakeAdd', id: 1, name: '', skin: 0, ang: 0, wang: 0, speed: 74, fam: 0, tailX: 8000, tailY: 8000, iangs: [] },
  { t: 'snakeRemove', id: 9, reason: 1 },
  { t: 'snakeMove', id: 9, iang: 40000 },
  { t: 'snakeGrow', id: 9, iang: 12, fam: 65535 },
  { t: 'snakeShrink', id: 9, fam: 7 },
  { t: 'snakeState', id: 9, ang: 5, wang: 6, speed: 74 },
  { t: 'snakeFam', id: 9, fam: 100 },
  { t: 'sectorFood', sx: 33, sy: 0, foods: [{ rx: 0, ry: 255, size: 8, color: 8 }, { rx: 1, ry: 2, size: 1, color: 0 }] },
  { t: 'sectorFood', sx: 1, sy: 1, foods: [] },
  { t: 'foodAdd', sx: 2, sy: 3, rx: 4, ry: 5, size: 3, color: 6 },
  { t: 'foodEat', sx: 2, sy: 3, rx: 4, ry: 5, eaterId: 77 },
  { t: 'sectorLeave', sx: 10, sy: 11 },
  { t: 'leaderboard', myRank: 4, total: 31, entries: [{ score: 20245, name: 'a' }, { score: 10, name: '한글' }] },
  { t: 'minimap', bits: Uint8Array.from({ length: 512 }, (_, i) => i & 0xff) },
  { t: 'death', killerId: 0xffff, finalScore: 16777215 },
  { t: 'pong' },
];

describe('client messages', () => {
  it.each(clientMsgs.map((m) => [m.t, m] as const))('round trips %s', (_t, msg) => {
    expect(decodeClient(encodeClient(msg))).toEqual(msg);
  });

  it.each([
    ['empty frame', new Uint8Array([])],
    ['unknown opcode', new Uint8Array([0x7f])],
    ['trailing bytes', new Uint8Array([C2S.PING, 0])],
    ['truncated join', new Uint8Array([C2S.JOIN, 5, 0x61])],
    ['name over 24 bytes', new Uint8Array([C2S.JOIN, 25, ...new Array(25).fill(0x61), 0])],
    ['skin out of range', new Uint8Array([C2S.JOIN, 1, 0x61, 8])],
    ['boost not 0/1', new Uint8Array([C2S.BOOST, 2])],
    ['invalid utf-8 name', new Uint8Array([C2S.JOIN, 2, 0xff, 0xfe, 0])],
  ])('rejects %s', (_label, bytes) => {
    expect(() => decodeClient(bytes)).toThrow(ProtocolError);
  });
});

describe('server frames', () => {
  it('round trips every message type in one frame', () => {
    const w = new Writer();
    for (const m of serverMsgs) encodeServer(w, m);
    expect(decodeServerFrame(w.finish())).toEqual(serverMsgs);
  });

  it('keeps f64 tail anchors bit-exact', () => {
    const w = new Writer();
    encodeServer(w, { t: 'snakeAdd', id: 1, name: 'x', skin: 0, ang: 0, wang: 0, speed: 0, fam: 0, tailX: Math.PI * 1000, tailY: Math.E * 1000, iangs: [] });
    const [m] = decodeServerFrame(w.finish());
    expect(m.t === 'snakeAdd' && m.tailX).toBe(Math.PI * 1000);
    expect(m.t === 'snakeAdd' && m.tailY).toBe(Math.E * 1000);
  });

  it('grows the writer past its initial capacity', () => {
    const w = new Writer();
    const msgs: ServerMsg[] = Array.from({ length: 300 }, (_, i) => ({ t: 'snakeMove', id: i, iang: i }));
    for (const m of msgs) encodeServer(w, m);
    expect(decodeServerFrame(w.finish())).toEqual(msgs);
  });

  it('refuses more than 255 foods in one sectorFood message', () => {
    const foods = Array.from({ length: 256 }, () => ({ rx: 0, ry: 0, size: 1, color: 0 }));
    expect(() => encodeServer(new Writer(), { t: 'sectorFood', sx: 0, sy: 0, foods })).toThrow(ProtocolError);
  });

  it('refuses out-of-range integers instead of wrapping', () => {
    expect(() => encodeServer(new Writer(), { t: 'snakeMove', id: 70000, iang: 0 })).toThrow(ProtocolError);
    expect(() => encodeServer(new Writer(), { t: 'snakeMove', id: 1, iang: 1.5 })).toThrow(ProtocolError);
  });

  it('rejects a truncated frame', () => {
    const w = new Writer();
    encodeServer(w, { t: 'snakeMove', id: 1, iang: 2 });
    expect(() => decodeServerFrame(w.finish().subarray(0, 3))).toThrow(ProtocolError);
  });
});

describe('sanitizeName', () => {
  it('strips control characters and trims', () => {
    expect(sanitizeName('  ab\u0000c\u0007d\n ')).toBe('abcd');
  });
  it('falls back to Player when empty', () => {
    expect(sanitizeName('   ')).toBe('Player');
    expect(sanitizeName('\u0001')).toBe('Player');
  });
  it('truncates at 24 UTF-8 bytes on a code point boundary', () => {
    const ko = sanitizeName('가'.repeat(10));
    expect(ko).toBe('가'.repeat(8));
    const emoji = sanitizeName('😀'.repeat(7));
    expect(emoji).toBe('😀'.repeat(6));
    expect(new TextEncoder().encode(emoji).length).toBeLessThanOrEqual(24);
    expect(emoji.includes('�')).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run packages/shared/test/protocol.test.ts`
Expected: FAIL — `decodeClient`/`Writer` 등이 export되지 않음.

- [ ] **Step 3: 프로토콜 구현**

`packages/shared/src/protocol.ts`:
```ts
import { MAX_NAME_BYTES, MINIMAP_SIZE, SKIN_COUNT } from './constants';

export class ProtocolError extends Error {}

export const C2S = { JOIN: 0x01, STEER: 0x02, BOOST: 0x03, PING: 0x04 } as const;

export const S2C = {
  WELCOME: 0x10,
  SNAKE_ADD: 0x11,
  SNAKE_REMOVE: 0x12,
  SNAKE_MOVE: 0x13,
  SNAKE_GROW: 0x14,
  SNAKE_SHRINK: 0x15,
  SNAKE_STATE: 0x16,
  SNAKE_FAM: 0x17,
  SECTOR_FOOD: 0x20,
  FOOD_ADD: 0x21,
  FOOD_EAT: 0x22,
  SECTOR_LEAVE: 0x23,
  LEADERBOARD: 0x30,
  MINIMAP: 0x31,
  DEATH: 0x32,
  PONG: 0x33,
} as const;

export type ClientMsg =
  | { t: 'join'; name: string; skin: number }
  | { t: 'steer'; angle: number }
  | { t: 'boost'; on: boolean }
  | { t: 'ping' };

export interface FoodWire {
  rx: number;
  ry: number;
  size: number;
  color: number;
}

export interface LeaderEntry {
  score: number;
  name: string;
}

export type ServerMsg =
  | { t: 'welcome'; selfId: number; worldRadius: number; sectorSize: number; segSpacing: number; tickHz: number; mscps: number; maxSegments: number }
  | { t: 'snakeAdd'; id: number; name: string; skin: number; ang: number; wang: number; speed: number; fam: number; tailX: number; tailY: number; iangs: number[] }
  | { t: 'snakeRemove'; id: number; reason: number }
  | { t: 'snakeMove'; id: number; iang: number }
  | { t: 'snakeGrow'; id: number; iang: number; fam: number }
  | { t: 'snakeShrink'; id: number; fam: number }
  | { t: 'snakeState'; id: number; ang: number; wang: number; speed: number }
  | { t: 'snakeFam'; id: number; fam: number }
  | { t: 'sectorFood'; sx: number; sy: number; foods: FoodWire[] }
  | { t: 'foodAdd'; sx: number; sy: number; rx: number; ry: number; size: number; color: number }
  | { t: 'foodEat'; sx: number; sy: number; rx: number; ry: number; eaterId: number }
  | { t: 'sectorLeave'; sx: number; sy: number }
  | { t: 'leaderboard'; myRank: number; total: number; entries: LeaderEntry[] }
  | { t: 'minimap'; bits: Uint8Array }
  | { t: 'death'; killerId: number; finalScore: number }
  | { t: 'pong' };

const MINIMAP_BYTES = (MINIMAP_SIZE * MINIMAP_SIZE) / 8;
const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function checkUint(v: number, max: number): void {
  if (!Number.isInteger(v) || v < 0 || v > max) throw new ProtocolError(`value out of range: ${v}`);
}

export class Writer {
  private buf = new Uint8Array(256);
  private view = new DataView(this.buf.buffer);
  length = 0;

  private ensure(n: number): void {
    if (this.length + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.length + n) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  u8(v: number): this {
    checkUint(v, 0xff);
    this.ensure(1);
    this.view.setUint8(this.length, v);
    this.length += 1;
    return this;
  }

  u16(v: number): this {
    checkUint(v, 0xffff);
    this.ensure(2);
    this.view.setUint16(this.length, v);
    this.length += 2;
    return this;
  }

  u24(v: number): this {
    checkUint(v, 0xffffff);
    this.ensure(3);
    this.view.setUint8(this.length, (v >>> 16) & 0xff);
    this.view.setUint16(this.length + 1, v & 0xffff);
    this.length += 3;
    return this;
  }

  f64(v: number): this {
    this.ensure(8);
    this.view.setFloat64(this.length, v);
    this.length += 8;
    return this;
  }

  bytes(b: Uint8Array): this {
    this.ensure(b.length);
    this.buf.set(b, this.length);
    this.length += b.length;
    return this;
  }

  str(s: string): this {
    const b = utf8Encoder.encode(s);
    this.u8(b.length);
    return this.bytes(b);
  }

  finish(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

export class Reader {
  private readonly view: DataView;
  private pos = 0;

  constructor(private readonly buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  get remaining(): number {
    return this.buf.length - this.pos;
  }

  private need(n: number): void {
    if (this.pos + n > this.buf.length) throw new ProtocolError('truncated message');
  }

  u8(): number {
    this.need(1);
    return this.view.getUint8(this.pos++);
  }

  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos);
    this.pos += 2;
    return v;
  }

  u24(): number {
    this.need(3);
    const v = (this.view.getUint8(this.pos) << 16) | this.view.getUint16(this.pos + 1);
    this.pos += 3;
    return v;
  }

  f64(): number {
    this.need(8);
    const v = this.view.getFloat64(this.pos);
    this.pos += 8;
    return v;
  }

  bytes(n: number): Uint8Array {
    this.need(n);
    const b = this.buf.slice(this.pos, this.pos + n);
    this.pos += n;
    return b;
  }

  str(): string {
    const b = this.bytes(this.u8());
    try {
      return utf8Decoder.decode(b);
    } catch {
      throw new ProtocolError('invalid utf-8');
    }
  }
}

export function sanitizeName(raw: string): string {
  const cleaned = raw.replace(/\p{Cc}/gu, '').trim();
  let out = '';
  let used = 0;
  for (const ch of cleaned) {
    const n = utf8Encoder.encode(ch).length;
    if (used + n > MAX_NAME_BYTES) break;
    out += ch;
    used += n;
  }
  return out.length > 0 ? out : 'Player';
}

function checkName(name: string): void {
  if (utf8Encoder.encode(name).length > MAX_NAME_BYTES) throw new ProtocolError('name too long');
}

export function encodeClient(msg: ClientMsg): Uint8Array {
  const w = new Writer();
  switch (msg.t) {
    case 'join':
      checkName(msg.name);
      w.u8(C2S.JOIN).str(msg.name).u8(msg.skin);
      break;
    case 'steer':
      w.u8(C2S.STEER).u8(msg.angle);
      break;
    case 'boost':
      w.u8(C2S.BOOST).u8(msg.on ? 1 : 0);
      break;
    case 'ping':
      w.u8(C2S.PING);
      break;
  }
  return w.finish();
}

export function decodeClient(buf: Uint8Array): ClientMsg {
  const r = new Reader(buf);
  const op = r.u8();
  let msg: ClientMsg;
  switch (op) {
    case C2S.JOIN: {
      const name = r.str();
      checkName(name);
      const skin = r.u8();
      if (skin >= SKIN_COUNT) throw new ProtocolError(`skin out of range: ${skin}`);
      msg = { t: 'join', name, skin };
      break;
    }
    case C2S.STEER:
      msg = { t: 'steer', angle: r.u8() };
      break;
    case C2S.BOOST: {
      const v = r.u8();
      if (v > 1) throw new ProtocolError(`boost flag out of range: ${v}`);
      msg = { t: 'boost', on: v === 1 };
      break;
    }
    case C2S.PING:
      msg = { t: 'ping' };
      break;
    default:
      throw new ProtocolError(`unknown client opcode: ${op}`);
  }
  if (r.remaining !== 0) throw new ProtocolError('trailing bytes');
  return msg;
}

export function encodeServer(w: Writer, msg: ServerMsg): void {
  switch (msg.t) {
    case 'welcome':
      w.u8(S2C.WELCOME).u16(msg.selfId).u16(msg.worldRadius).u16(msg.sectorSize)
        .u8(msg.segSpacing).u8(msg.tickHz).u16(msg.mscps).u16(msg.maxSegments);
      break;
    case 'snakeAdd':
      w.u8(S2C.SNAKE_ADD).u16(msg.id).str(msg.name).u8(msg.skin).u16(msg.ang).u16(msg.wang)
        .u8(msg.speed).u16(msg.fam).u16(msg.iangs.length + 1).f64(msg.tailX).f64(msg.tailY);
      for (const a of msg.iangs) w.u16(a);
      break;
    case 'snakeRemove':
      w.u8(S2C.SNAKE_REMOVE).u16(msg.id).u8(msg.reason);
      break;
    case 'snakeMove':
      w.u8(S2C.SNAKE_MOVE).u16(msg.id).u16(msg.iang);
      break;
    case 'snakeGrow':
      w.u8(S2C.SNAKE_GROW).u16(msg.id).u16(msg.iang).u16(msg.fam);
      break;
    case 'snakeShrink':
      w.u8(S2C.SNAKE_SHRINK).u16(msg.id).u16(msg.fam);
      break;
    case 'snakeState':
      w.u8(S2C.SNAKE_STATE).u16(msg.id).u16(msg.ang).u16(msg.wang).u8(msg.speed);
      break;
    case 'snakeFam':
      w.u8(S2C.SNAKE_FAM).u16(msg.id).u16(msg.fam);
      break;
    case 'sectorFood':
      if (msg.foods.length > 255) throw new ProtocolError('too many foods in one sectorFood');
      w.u8(S2C.SECTOR_FOOD).u8(msg.sx).u8(msg.sy).u8(msg.foods.length);
      for (const f of msg.foods) w.u8(f.rx).u8(f.ry).u8(f.size).u8(f.color);
      break;
    case 'foodAdd':
      w.u8(S2C.FOOD_ADD).u8(msg.sx).u8(msg.sy).u8(msg.rx).u8(msg.ry).u8(msg.size).u8(msg.color);
      break;
    case 'foodEat':
      w.u8(S2C.FOOD_EAT).u8(msg.sx).u8(msg.sy).u8(msg.rx).u8(msg.ry).u16(msg.eaterId);
      break;
    case 'sectorLeave':
      w.u8(S2C.SECTOR_LEAVE).u8(msg.sx).u8(msg.sy);
      break;
    case 'leaderboard':
      w.u8(S2C.LEADERBOARD).u16(msg.myRank).u16(msg.total).u8(msg.entries.length);
      for (const e of msg.entries) w.u24(e.score).str(e.name);
      break;
    case 'minimap':
      if (msg.bits.length !== MINIMAP_BYTES) throw new ProtocolError('minimap size mismatch');
      w.u8(S2C.MINIMAP).bytes(msg.bits);
      break;
    case 'death':
      w.u8(S2C.DEATH).u16(msg.killerId).u24(msg.finalScore);
      break;
    case 'pong':
      w.u8(S2C.PONG);
      break;
  }
}

function decodeServerMsg(r: Reader): ServerMsg {
  const op = r.u8();
  switch (op) {
    case S2C.WELCOME:
      return { t: 'welcome', selfId: r.u16(), worldRadius: r.u16(), sectorSize: r.u16(), segSpacing: r.u8(), tickHz: r.u8(), mscps: r.u16(), maxSegments: r.u16() };
    case S2C.SNAKE_ADD: {
      const id = r.u16();
      const name = r.str();
      const skin = r.u8();
      const ang = r.u16();
      const wang = r.u16();
      const speed = r.u8();
      const fam = r.u16();
      const n = r.u16();
      if (n < 1) throw new ProtocolError('snake without points');
      const tailX = r.f64();
      const tailY = r.f64();
      const iangs: number[] = [];
      for (let i = 1; i < n; i++) iangs.push(r.u16());
      return { t: 'snakeAdd', id, name, skin, ang, wang, speed, fam, tailX, tailY, iangs };
    }
    case S2C.SNAKE_REMOVE:
      return { t: 'snakeRemove', id: r.u16(), reason: r.u8() };
    case S2C.SNAKE_MOVE:
      return { t: 'snakeMove', id: r.u16(), iang: r.u16() };
    case S2C.SNAKE_GROW:
      return { t: 'snakeGrow', id: r.u16(), iang: r.u16(), fam: r.u16() };
    case S2C.SNAKE_SHRINK:
      return { t: 'snakeShrink', id: r.u16(), fam: r.u16() };
    case S2C.SNAKE_STATE:
      return { t: 'snakeState', id: r.u16(), ang: r.u16(), wang: r.u16(), speed: r.u8() };
    case S2C.SNAKE_FAM:
      return { t: 'snakeFam', id: r.u16(), fam: r.u16() };
    case S2C.SECTOR_FOOD: {
      const sx = r.u8();
      const sy = r.u8();
      const count = r.u8();
      const foods: FoodWire[] = [];
      for (let i = 0; i < count; i++) foods.push({ rx: r.u8(), ry: r.u8(), size: r.u8(), color: r.u8() });
      return { t: 'sectorFood', sx, sy, foods };
    }
    case S2C.FOOD_ADD:
      return { t: 'foodAdd', sx: r.u8(), sy: r.u8(), rx: r.u8(), ry: r.u8(), size: r.u8(), color: r.u8() };
    case S2C.FOOD_EAT:
      return { t: 'foodEat', sx: r.u8(), sy: r.u8(), rx: r.u8(), ry: r.u8(), eaterId: r.u16() };
    case S2C.SECTOR_LEAVE:
      return { t: 'sectorLeave', sx: r.u8(), sy: r.u8() };
    case S2C.LEADERBOARD: {
      const myRank = r.u16();
      const total = r.u16();
      const n = r.u8();
      const entries: LeaderEntry[] = [];
      for (let i = 0; i < n; i++) entries.push({ score: r.u24(), name: r.str() });
      return { t: 'leaderboard', myRank, total, entries };
    }
    case S2C.MINIMAP:
      return { t: 'minimap', bits: r.bytes(MINIMAP_BYTES) };
    case S2C.DEATH:
      return { t: 'death', killerId: r.u16(), finalScore: r.u24() };
    case S2C.PONG:
      return { t: 'pong' };
    default:
      throw new ProtocolError(`unknown server opcode: ${op}`);
  }
}

export function decodeServerFrame(buf: Uint8Array): ServerMsg[] {
  const r = new Reader(buf);
  const out: ServerMsg[] = [];
  while (r.remaining > 0) out.push(decodeServerMsg(r));
  return out;
}
```

`packages/shared/src/index.ts`를 다음으로 교체:
```ts
export * from './constants';
export * from './physics';
export * from './protocol';
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run packages/shared/test/protocol.test.ts && npx tsc -p packages/shared`
Expected: PASS, 타입 오류 0.

- [ ] **Step 5: 커밋**

```bash
git add packages/shared
git commit -m "feat(shared): add binary protocol codec and name sanitizer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: 몸통 재구성(BodyReplica) + 서버 Snake 모델

**Files:**
- Create: `packages/shared/src/body.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/server/package.json`, `packages/server/tsconfig.json`
- Create: `packages/server/src/game/snake.ts`
- Create: `packages/server/test/helpers.ts`
- Test: `packages/shared/test/body.test.ts`, `packages/server/test/snake.test.ts`

**Interfaces:**
- Consumes: Task 1 `nextPoint`, `quantizeAngle16`, `dequantizeAngle16`, `turnToward`, `maxTurnRate`, `speedOf`, `bodyRadius`, `score`, `normAngle`, 상수
- Produces:
  - `@snake/shared`: `class BodyReplica { points: Vec[]; constructor(tailX: number, tailY: number, iangs: readonly number[]); head: Vec; applyMove(iang: number): void; applyGrow(iang: number): void; applyShrink(): void }`
  - `packages/server/src/game/snake.ts`:
    - `interface BodyPoint { x: number; y: number; iang: number }`
    - `type SnakeEvent = { k: 'move'; iang: number } | { k: 'grow'; iang: number; fam: number } | { k: 'shrink'; fam: number }`
    - `class Snake` — 필드 `id, name, skin, isBot, points: BodyPoint[], headX, headY, ang, wang, wantBoost, boosting, fam, kills, alive, events: SnakeEvent[], stateDirty, famDirty`; getter `sct, radius, speed, score, tail, lastPoint`; 메서드 `setInput(wang: number, boost: boolean): void`, `step(dt: number): Vec[]` (반환 = 이번 틱 부스트 먹이 배출 위치), `eat(value: number): void`, `clearEvents(): void`, `addSnapshot(): { tailX: number; tailY: number; iangs: number[] }`
    - 생성자: `new Snake(id, name, skin, isBot, x, y, ang)` — `(x, y)`가 머리 점.
  - `packages/server/test/helpers.ts`: `seededRng(seed: number): () => number`
- 규칙: 이벤트·dirty 플래그는 `step`에서 지우지 않는다. 지우는 것은 `clearEvents()`(Task 5의 `World.endTick`이 호출). 부스트 중 `fam` 감소는 `famDirty`를 세우지 않는다(클라이언트가 같은 공식으로 감소시키고 `SNAKE_SHRINK`가 권위값을 보낸다).

- [ ] **Step 1: 서버 패키지 스캐폴드 + 의존성**

`packages/server/package.json`:
```json
{
  "name": "@snake/server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "@snake/shared": "*",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.13"
  }
}
```

`packages/server/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "test"]
}
```

Run: `npm install`
Expected: `node_modules/@snake/shared` 심볼릭 링크와 `node_modules/ws` 생성.

`packages/server/test/helpers.ts`:
```ts
/** mulberry32 — deterministic RNG for reproducible simulations. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 2: 실패하는 BodyReplica 테스트 작성**

`packages/shared/test/body.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { BodyReplica, SEG_SPACING, quantizeAngle16 } from '../src/index';

describe('BodyReplica', () => {
  const q = quantizeAngle16(0);

  it('builds points from the tail anchor and angles', () => {
    const b = new BodyReplica(100, 100, [q, q]);
    expect(b.points).toHaveLength(3);
    expect(b.head.x).toBeCloseTo(100 + 2 * SEG_SPACING, 9);
  });

  it('move adds a head and drops the tail', () => {
    const b = new BodyReplica(0, 0, [q]);
    b.applyMove(q);
    expect(b.points).toHaveLength(2);
    expect(b.points[0].x).toBeCloseTo(SEG_SPACING, 9);
  });

  it('grow keeps the tail; shrink drops it but never the last point', () => {
    const b = new BodyReplica(0, 0, []);
    b.applyGrow(q);
    expect(b.points).toHaveLength(2);
    b.applyShrink();
    b.applyShrink();
    expect(b.points).toHaveLength(1);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run packages/shared/test/body.test.ts`
Expected: FAIL — `BodyReplica` is not exported.

- [ ] **Step 4: BodyReplica 구현**

`packages/shared/src/body.ts`:
```ts
import { nextPoint, type Vec } from './physics';

/** Rebuilds a snake body from the tail anchor and per-point quantized angles (spec §7). */
export class BodyReplica {
  points: Vec[];

  constructor(tailX: number, tailY: number, iangs: readonly number[]) {
    this.points = [{ x: tailX, y: tailY }];
    for (const a of iangs) this.points.push(nextPoint(this.head, a));
  }

  get head(): Vec {
    return this.points[this.points.length - 1];
  }

  applyMove(iang: number): void {
    this.points.push(nextPoint(this.head, iang));
    this.points.shift();
  }

  applyGrow(iang: number): void {
    this.points.push(nextPoint(this.head, iang));
  }

  applyShrink(): void {
    if (this.points.length > 1) this.points.shift();
  }
}
```

`packages/shared/src/index.ts`를 다음으로 교체:
```ts
export * from './constants';
export * from './physics';
export * from './protocol';
export * from './body';
```

Run: `npx vitest run packages/shared/test/body.test.ts`
Expected: PASS.

- [ ] **Step 5: 실패하는 Snake 테스트 작성**

`packages/server/test/snake.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  BOOST_DROP_INTERVAL, BodyReplica, FAM_CAP, MAX_SEGMENTS, SEG_SPACING, START_SEGMENTS, TAU,
  TICK_DT, maxTurnRate, nextPoint, speedOf,
} from '@snake/shared';
import { Snake, type SnakeEvent } from '../src/game/snake';
import { seededRng } from './helpers';

function run(s: Snake, ticks: number): { events: SnakeEvent[]; drops: number } {
  const events: SnakeEvent[] = [];
  let drops = 0;
  for (let i = 0; i < ticks; i++) {
    drops += s.step(TICK_DT).length;
    events.push(...s.events);
    s.clearEvents();
  }
  return { events, drops };
}

function applyEvents(b: BodyReplica, events: SnakeEvent[]): void {
  for (const e of events) {
    if (e.k === 'move') b.applyMove(e.iang);
    else if (e.k === 'grow') b.applyGrow(e.iang);
    else b.applyShrink();
  }
}

describe('Snake construction', () => {
  it('creates START_SEGMENTS points chained by nextPoint, head at (x, y)', () => {
    const s = new Snake(1, 'a', 0, false, 5000, 6000, 1.0);
    expect(s.sct).toBe(START_SEGMENTS);
    for (let i = 1; i < s.points.length; i++) {
      const n = nextPoint(s.points[i - 1], s.points[i].iang);
      expect(s.points[i].x).toBe(n.x);
      expect(s.points[i].y).toBe(n.y);
    }
    expect(s.lastPoint.x).toBeCloseTo(5000, 6);
    expect(s.lastPoint.y).toBeCloseTo(6000, 6);
  });
});

describe('Snake movement', () => {
  it('moves at speedOf units per second in a straight line', () => {
    const s = new Snake(1, 'a', 0, false, 5000, 5000, 0);
    run(s, 30);
    expect(s.headX - 5000).toBeCloseTo(speedOf(START_SEGMENTS, false), 6);
  });

  it('commits one point per SEG_SPACING travelled and keeps length without food', () => {
    const s = new Snake(1, 'a', 0, false, 5000, 5000, 0);
    const { events } = run(s, 30);
    expect(events).toHaveLength(Math.floor(speedOf(START_SEGMENTS, false) / SEG_SPACING));
    expect(events.every((e) => e.k === 'move')).toBe(true);
    expect(s.sct).toBe(START_SEGMENTS);
  });

  it('limits turning to maxTurnRate per second', () => {
    const s = new Snake(1, 'a', 0, false, 5000, 5000, 0);
    s.setInput(Math.PI / 2, false);
    expect(s.stateDirty).toBe(true);
    s.step(TICK_DT);
    expect(s.ang).toBeCloseTo(maxTurnRate(START_SEGMENTS, false) * TICK_DT, 9);
  });
});

describe('Snake growth and boost', () => {
  it('eating one segment worth of fam grows on the next commit', () => {
    const s = new Snake(1, 'a', 0, false, 5000, 5000, 0);
    s.eat(1);
    expect(s.famDirty).toBe(true);
    const { events } = run(s, 15);
    expect(events.filter((e) => e.k === 'grow')).toHaveLength(1);
    expect(s.sct).toBe(START_SEGMENTS + 1);
    expect(s.fam).toBeCloseTo(0, 9);
  });

  it('refuses to boost at START_SEGMENTS', () => {
    const s = new Snake(1, 'a', 0, false, 5000, 5000, 0);
    s.setInput(0, true);
    s.step(TICK_DT);
    expect(s.boosting).toBe(false);
  });

  it('boost speeds up, shrinks the tail, and drops food every interval', () => {
    const s = new Snake(1, 'a', 0, false, 5000, 5000, 0);
    s.eat(6);
    run(s, 90);
    const before = s.sct;
    expect(before).toBe(START_SEGMENTS + 6);
    s.setInput(0, true);
    const { events, drops } = run(s, 60);
    expect(s.boosting).toBe(true);
    expect(events.some((e) => e.k === 'shrink')).toBe(true);
    expect(s.sct).toBeLessThan(before);
    // 60 ticks of 1/30 s accumulate float error, so one boundary drop may land on either side.
    expect(drops).toBeGreaterThanOrEqual(Math.floor(2 / BOOST_DROP_INTERVAL) - 1);
    expect(drops).toBeLessThanOrEqual(Math.floor(2 / BOOST_DROP_INTERVAL));
  });

  it('stops boosting when it reaches START_SEGMENTS', () => {
    const s = new Snake(1, 'a', 0, false, 5000, 5000, 0);
    s.eat(1);
    run(s, 15);
    s.setInput(0, true);
    run(s, 300);
    expect(s.sct).toBe(START_SEGMENTS);
    expect(s.boosting).toBe(false);
    expect(s.fam).toBeGreaterThanOrEqual(0);
  });

  it('caps length at MAX_SEGMENTS and fam at FAM_CAP', () => {
    const s = new Snake(1, 'a', 0, false, 8000, 8000, 0);
    for (let i = 0; i < 4000 && s.sct < MAX_SEGMENTS; i++) {
      s.eat(1);
      s.setInput(s.ang + 0.3, false);
      run(s, 15);
    }
    expect(s.sct).toBe(MAX_SEGMENTS);
    s.eat(10);
    run(s, 60);
    expect(s.sct).toBe(MAX_SEGMENTS);
    expect(s.fam).toBeLessThanOrEqual(FAM_CAP);
  });
});

describe('client reconstruction stays in sync (spec §1 criterion 4)', () => {
  it('replicas built from events match server points within 1e-3', () => {
    const rng = seededRng(42);
    const s = new Snake(1, 'a', 0, false, 8000, 8000, 0);
    const snap0 = s.addSnapshot();
    const fromStart = new BodyReplica(snap0.tailX, snap0.tailY, snap0.iangs);
    let lateJoiner: BodyReplica | null = null;

    for (let i = 0; i < 1000; i++) {
      if (i % 20 === 0) s.setInput(rng() * TAU, rng() < 0.3);
      if (i % 7 === 0) s.eat(rng() * 0.6);
      s.step(TICK_DT);
      applyEvents(fromStart, s.events);
      if (lateJoiner) applyEvents(lateJoiner, s.events);
      s.clearEvents();
      if (i === 500) {
        const snap = s.addSnapshot();
        lateJoiner = new BodyReplica(snap.tailX, snap.tailY, snap.iangs);
      }
    }

    for (const replica of [fromStart, lateJoiner!]) {
      expect(replica.points).toHaveLength(s.points.length);
      replica.points.forEach((p, i) => {
        expect(Math.abs(p.x - s.points[i].x)).toBeLessThanOrEqual(1e-3);
        expect(Math.abs(p.y - s.points[i].y)).toBeLessThanOrEqual(1e-3);
      });
    }
  });
});
```

- [ ] **Step 6: 테스트 실패 확인**

Run: `npx vitest run packages/server/test/snake.test.ts`
Expected: FAIL — `Failed to resolve import "../src/game/snake"`.

- [ ] **Step 7: Snake 구현**

`packages/server/src/game/snake.ts`:
```ts
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
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `npx vitest run packages/shared packages/server && npx tsc -p packages/shared && npx tsc -p packages/server`
Expected: 전부 PASS, 타입 오류 0.

- [ ] **Step 9: 커밋**

```bash
git add packages/shared packages/server package.json package-lock.json
git commit -m "feat: add body replica and server snake model with sync test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: 먹이 저장소 (FoodStore)

**Files:**
- Create: `packages/server/src/game/food.ts`
- Test: `packages/server/test/food.test.ts`

**Interfaces:**
- Consumes: Task 1 `sectorCoord`, `sectorKey`, `foodId`, `foodPos`, `TAU`, 상수 `WORLD_RADIUS`, `SECTOR_SIZE`, `FOOD_COLORS`, `NATURAL_FOOD_VALUE_PER_SIZE`; Task 3 `seededRng`(테스트)
- Produces (`packages/server/src/game/food.ts`):
  - `type FoodKind = 'natural' | 'death' | 'boost'`
  - `interface Food { id: number; sx: number; sy: number; rx: number; ry: number; x: number; y: number; size: number; color: number; value: number; kind: FoodKind }` — `x, y`는 항상 `foodPos(sx, sy, rx, ry)`로 스냅된 값(클라이언트와 같은 좌표)
  - `interface FoodEaten { food: Food; eaterId: number }`
  - `class FoodStore { naturalCount: number; added: Food[]; eaten: FoodEaten[]; constructor(rng?: () => number); add(x, y, size, color, value, kind): Food | null; remove(food: Food, eaterId: number): void; sectorFoods(sx: number, sy: number): Food[]; queryCircle(x: number, y: number, r: number): Food[]; spawnNatural(count: number): number; clearEvents(): void }`
  - `add`은 월드 원 밖이거나 같은 바이트 칸에 먹이가 있으면 `null`.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/server/test/food.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { NATURAL_FOOD_VALUE_PER_SIZE, WORLD_RADIUS, foodId, foodPos } from '@snake/shared';
import { FoodStore } from '../src/game/food';
import { seededRng } from './helpers';

const C = WORLD_RADIUS;

describe('FoodStore.add', () => {
  it('snaps the position to the sector byte grid and records an add event', () => {
    const store = new FoodStore(seededRng(1));
    const f = store.add(C + 10.3, C + 20.7, 2, 3, 0.1, 'natural')!;
    expect(f).not.toBeNull();
    expect(f.id).toBe(foodId(f.sx, f.sy, f.rx, f.ry));
    expect({ x: f.x, y: f.y }).toEqual(foodPos(f.sx, f.sy, f.rx, f.ry));
    expect(Math.abs(f.x - (C + 10.3))).toBeLessThan(480 / 256);
    expect(store.added).toEqual([f]);
    expect(store.naturalCount).toBe(1);
  });

  it('rejects food outside the world circle', () => {
    const store = new FoodStore();
    expect(store.add(0, 0, 1, 0, 0.05, 'natural')).toBeNull();
    expect(store.add(2 * C - 1, C, 1, 0, 0.05, 'natural')).not.toBeNull();
  });

  it('rejects a second food in the same byte cell', () => {
    const store = new FoodStore();
    expect(store.add(C, C, 1, 0, 0.05, 'natural')).not.toBeNull();
    expect(store.add(C + 0.5, C + 0.5, 1, 0, 0.05, 'death')).toBeNull();
  });
});

describe('FoodStore.remove and query', () => {
  it('remove records the eater once and keeps naturalCount right', () => {
    const store = new FoodStore();
    const f = store.add(C, C, 1, 0, 0.05, 'natural')!;
    store.remove(f, 7);
    store.remove(f, 8);
    expect(store.eaten).toEqual([{ food: f, eaterId: 7 }]);
    expect(store.naturalCount).toBe(0);
    expect(store.sectorFoods(f.sx, f.sy)).toEqual([]);
  });

  it('queryCircle crosses sector boundaries and respects the radius', () => {
    const store = new FoodStore();
    const left = store.add(479 * 16, C, 1, 0, 0.05, 'natural')!; // x = 7664 (sector 15 / 16 boundary is 7680)
    const right = store.add(7690, C, 1, 0, 0.05, 'natural')!;
    const far = store.add(7900, C, 1, 0, 0.05, 'natural')!;
    const hits = store.queryCircle(7680, C, 30);
    expect(hits).toContain(left);
    expect(hits).toContain(right);
    expect(hits).not.toContain(far);
  });

  it('clearEvents empties added and eaten', () => {
    const store = new FoodStore();
    const f = store.add(C, C, 1, 0, 0.05, 'natural')!;
    store.remove(f, 1);
    store.clearEvents();
    expect(store.added).toEqual([]);
    expect(store.eaten).toEqual([]);
  });
});

describe('FoodStore.spawnNatural', () => {
  it('spawns the requested count inside the world with sizes 1..4', () => {
    const store = new FoodStore(seededRng(7));
    expect(store.spawnNatural(4000)).toBe(4000);
    expect(store.naturalCount).toBe(4000);
    for (const f of store.added) {
      expect(Math.hypot(f.x - C, f.y - C)).toBeLessThanOrEqual(WORLD_RADIUS);
      expect(f.size).toBeGreaterThanOrEqual(1);
      expect(f.size).toBeLessThanOrEqual(4);
      expect(f.value).toBeCloseTo(f.size * NATURAL_FOOD_VALUE_PER_SIZE, 12);
      expect(f.kind).toBe('natural');
    }
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run packages/server/test/food.test.ts`
Expected: FAIL — `Failed to resolve import "../src/game/food"`.

- [ ] **Step 3: FoodStore 구현**

`packages/server/src/game/food.ts`:
```ts
import {
  FOOD_COLORS, NATURAL_FOOD_VALUE_PER_SIZE, SECTOR_SIZE, TAU, WORLD_RADIUS, foodId, foodPos,
  sectorCoord, sectorKey,
} from '@snake/shared';

export type FoodKind = 'natural' | 'death' | 'boost';

export interface Food {
  id: number;
  sx: number;
  sy: number;
  rx: number;
  ry: number;
  x: number;
  y: number;
  size: number;
  color: number;
  value: number;
  kind: FoodKind;
}

export interface FoodEaten {
  food: Food;
  eaterId: number;
}

function toByte(offset: number): number {
  return Math.max(0, Math.min(255, Math.floor((offset * 256) / SECTOR_SIZE)));
}

export class FoodStore {
  private readonly sectors = new Map<number, Map<number, Food>>();
  naturalCount = 0;
  added: Food[] = [];
  eaten: FoodEaten[] = [];

  constructor(private readonly rng: () => number = Math.random) {}

  add(x: number, y: number, size: number, color: number, value: number, kind: FoodKind): Food | null {
    const dx = x - WORLD_RADIUS;
    const dy = y - WORLD_RADIUS;
    if (dx * dx + dy * dy > WORLD_RADIUS * WORLD_RADIUS) return null;
    const sx = sectorCoord(x);
    const sy = sectorCoord(y);
    const rx = toByte(x - sx * SECTOR_SIZE);
    const ry = toByte(y - sy * SECTOR_SIZE);
    const id = foodId(sx, sy, rx, ry);
    const key = sectorKey(sx, sy);
    let cell = this.sectors.get(key);
    if (!cell) {
      cell = new Map();
      this.sectors.set(key, cell);
    }
    if (cell.has(id)) return null;
    const p = foodPos(sx, sy, rx, ry);
    const food: Food = { id, sx, sy, rx, ry, x: p.x, y: p.y, size, color, value, kind };
    cell.set(id, food);
    if (kind === 'natural') this.naturalCount++;
    this.added.push(food);
    return food;
  }

  remove(food: Food, eaterId: number): void {
    const cell = this.sectors.get(sectorKey(food.sx, food.sy));
    if (!cell || !cell.delete(food.id)) return;
    if (food.kind === 'natural') this.naturalCount--;
    this.eaten.push({ food, eaterId });
  }

  sectorFoods(sx: number, sy: number): Food[] {
    const cell = this.sectors.get(sectorKey(sx, sy));
    return cell ? Array.from(cell.values()) : [];
  }

  queryCircle(x: number, y: number, r: number): Food[] {
    const out: Food[] = [];
    const r2 = r * r;
    const x1 = sectorCoord(x + r);
    const y0 = sectorCoord(y - r);
    const y1 = sectorCoord(y + r);
    for (let sx = sectorCoord(x - r); sx <= x1; sx++) {
      for (let sy = y0; sy <= y1; sy++) {
        const cell = this.sectors.get(sectorKey(sx, sy));
        if (!cell) continue;
        for (const f of cell.values()) {
          const dx = f.x - x;
          const dy = f.y - y;
          if (dx * dx + dy * dy <= r2) out.push(f);
        }
      }
    }
    return out;
  }

  /** Tries up to 2·count random points; returns how many foods were actually placed. */
  spawnNatural(count: number): number {
    let placed = 0;
    for (let i = 0; i < count * 2 && placed < count; i++) {
      const rr = (WORLD_RADIUS - 50) * Math.sqrt(this.rng());
      const a = this.rng() * TAU;
      const size = 1 + Math.floor(this.rng() * 4);
      const color = Math.floor(this.rng() * FOOD_COLORS);
      const f = this.add(
        WORLD_RADIUS + Math.cos(a) * rr,
        WORLD_RADIUS + Math.sin(a) * rr,
        size,
        color,
        size * NATURAL_FOOD_VALUE_PER_SIZE,
        'natural',
      );
      if (f) placed++;
    }
    return placed;
  }

  clearEvents(): void {
    this.added = [];
    this.eaten = [];
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run packages/server/test/food.test.ts && npx tsc -p packages/server`
Expected: PASS, 타입 오류 0.

- [ ] **Step 5: 커밋**

```bash
git add packages/server
git commit -m "feat(server): add sector-indexed food store

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: 공간 인덱스 + World 틱 (섭취·충돌·사망·스폰·리스폰)

**Files:**
- Create: `packages/server/src/game/collision.ts`
- Create: `packages/server/src/game/world.ts`
- Test: `packages/server/test/world.test.ts`

**Interfaces:**
- Consumes: Task 3 `Snake`; Task 4 `FoodStore`, `Food`; Task 1 상수·`sectorCoord`·`sectorKey`·`TAU`
- Produces:
  - `packages/server/src/game/collision.ts`:
    - `interface BodyEntry { snake: Snake; x: number; y: number }`
    - `class SpatialIndex { maxRadius: number; rebuild(snakes: Iterable<Snake>): void; forEachNear(x: number, y: number, r: number, cb: (e: BodyEntry) => boolean | void): void; snakesInSector(key: number): ReadonlySet<Snake> | undefined }` — 콜백이 `true`를 반환하면 순회 중단. 몸통 점 + 연속 머리 위치를 모두 넣는다.
  - `packages/server/src/game/world.ts`:
    - `interface DeathInfo { snake: Snake; killerId: number }`
    - `class World { snakes: Map<number, Snake>; food: FoodStore; index: SpatialIndex; deaths: DeathInfo[]; constructor(rng?: () => number, initialFood?: number); spawnSnake(name: string, skin: number, isBot: boolean): Snake; addSnake(s: Snake): void; killSnake(s: Snake, killerId: number): void; tick(dt: number): void; endTick(): void; leaderboard(): Snake[]; allocId(): number }`
- 틱 수명주기 규칙: `tick()`은 이벤트를 지우지 않는다. 브로드캐스트 후 `endTick()`이 뱀 이벤트·먹이 이벤트·`deaths`를 지운다. 틱 밖에서 `killSnake`한 사망은 다음 `tick()`이 끝날 때 `deaths`에 들어간다.
- 충돌 순서(스펙 §5.4): 모든 뱀 이동 → 섭취 → 인덱스 재구성 → 충돌 일괄 판정 → 킬 집계 → 사망 반영. 동시 사망한 가해자도 킬을 인정받는다.

- [ ] **Step 1: 실패하는 World 테스트 작성**

`packages/server/test/world.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  FOOD_RESPAWN_PER_TICK, NATURAL_FOOD_TARGET, NO_KILLER, SPAWN_CLEARANCE, SPAWN_RADIUS_FRAC,
  TICK_DT, WORLD_RADIUS,
} from '@snake/shared';
import { Snake } from '../src/game/snake';
import { World } from '../src/game/world';
import { seededRng } from './helpers';

const C = WORLD_RADIUS;

function emptyWorld(): World {
  return new World(seededRng(3), 0);
}

function place(w: World, x: number, y: number, ang: number): Snake {
  const s = new Snake(w.allocId(), 'test', 0, false, x, y, ang);
  w.addSnake(s);
  return s;
}

function tick(w: World, n = 1): void {
  for (let i = 0; i < n; i++) {
    w.tick(TICK_DT);
    w.endTick();
  }
}

/** Ticks until `cond` holds, returning the deaths seen; fails after `limit` ticks. */
function tickUntil(w: World, cond: () => boolean, limit: number) {
  const seen: World['deaths'] = [];
  for (let i = 0; i < limit && !cond(); i++) {
    w.tick(TICK_DT);
    seen.push(...w.deaths);
    w.endTick();
  }
  expect(cond()).toBe(true);
  return seen;
}

describe('spawning', () => {
  it('spawns inside 0.7R and away from existing bodies', () => {
    const w = emptyWorld();
    const first = w.spawnSnake('a', 0, false);
    tick(w);
    for (let i = 0; i < 30; i++) {
      const s = w.spawnSnake(`b${i}`, 1, false);
      expect(Math.hypot(s.headX - C, s.headY - C)).toBeLessThanOrEqual(C * SPAWN_RADIUS_FRAC + 1);
      for (const p of first.points) {
        expect(Math.hypot(s.headX - p.x, s.headY - p.y)).toBeGreaterThanOrEqual(SPAWN_CLEARANCE);
      }
      w.killSnake(s, NO_KILLER);
    }
  });

  it('allocates ids cyclically, never 0 or NO_KILLER', () => {
    const w = emptyWorld();
    const a = w.spawnSnake('a', 0, false);
    const b = w.spawnSnake('b', 0, false);
    w.killSnake(a, NO_KILLER);
    const c = w.spawnSnake('c', 0, false);
    expect([a.id, b.id, c.id]).toEqual([1, 2, 3]);
  });
});

describe('eating', () => {
  it('a head eats food within radius + margin', () => {
    const w = emptyWorld();
    const s = place(w, C, C, 0);
    const f = w.food.add(C + 20, C, 2, 0, 0.1, 'natural')!;
    w.tick(TICK_DT);
    expect(w.food.eaten).toEqual([{ food: f, eaterId: s.id }]);
    expect(s.fam).toBeCloseTo(0.1, 12);
    expect(s.famDirty).toBe(true);
    w.endTick();
  });
});

describe('collisions', () => {
  it('head into another body kills the attacker and credits the owner', () => {
    const w = emptyWorld();
    const owner = place(w, C, C, 0);
    const attacker = place(w, owner.tail.x, C - 50, Math.PI / 2);
    const deaths = tickUntil(w, () => !attacker.alive, 20);
    expect(deaths).toEqual([{ snake: attacker, killerId: owner.id }]);
    expect(owner.alive).toBe(true);
    expect(owner.kills).toBe(1);
  });

  it('a snake never collides with its own body', () => {
    const w = emptyWorld();
    const s = place(w, C, C, 0);
    s.eat(20);
    tick(w, 120);
    expect(s.sct).toBeGreaterThan(12);
    for (let i = 0; i < 150; i++) {
      s.setInput(s.ang + 1.5, false);
      tick(w);
    }
    expect(s.alive).toBe(true);
  });

  it('head-on collisions kill both and credit both', () => {
    const w = emptyWorld();
    const a = place(w, C - 100, C, 0);
    const b = place(w, C + 100, C, Math.PI);
    const deaths = tickUntil(w, () => !a.alive || !b.alive, 60);
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(false);
    expect(deaths.map((d) => [d.snake.id, d.killerId]).sort()).toEqual([[a.id, b.id], [b.id, a.id]].sort());
    expect(a.kills).toBe(1);
    expect(b.kills).toBe(1);
  });

  it('crossing the world edge kills with NO_KILLER', () => {
    const w = emptyWorld();
    const s = place(w, 2 * C - 40, C, 0);
    const deaths = tickUntil(w, () => !s.alive, 30);
    expect(deaths).toEqual([{ snake: s, killerId: NO_KILLER }]);
  });
});

describe('death handling', () => {
  it('drops one death food per body point', () => {
    const w = emptyWorld();
    const s = place(w, C, C, 0);
    s.eat(5);
    tick(w, 60);
    const points = s.sct;
    w.killSnake(s, NO_KILLER);
    expect(w.food.added.filter((f) => f.kind === 'death')).toHaveLength(points);
    expect(w.snakes.has(s.id)).toBe(false);
  });

  it('killSnake outside tick is reported in the next tick deaths', () => {
    const w = emptyWorld();
    const s = place(w, C, C, 0);
    w.killSnake(s, NO_KILLER);
    expect(w.deaths).toEqual([]);
    w.tick(TICK_DT);
    expect(w.deaths).toEqual([{ snake: s, killerId: NO_KILLER }]);
    w.endTick();
    expect(w.deaths).toEqual([]);
  });
});

describe('food respawn and tick bookkeeping', () => {
  it('respawns natural food up to the target, capped per tick', () => {
    const w = emptyWorld();
    tick(w);
    expect(w.food.naturalCount).toBe(FOOD_RESPAWN_PER_TICK);
    tick(w, Math.ceil(NATURAL_FOOD_TARGET / FOOD_RESPAWN_PER_TICK) + 5);
    expect(w.food.naturalCount).toBe(NATURAL_FOOD_TARGET);
  });

  it('constructor fills the initial food without leaving add events', () => {
    const w = new World(seededRng(1));
    expect(w.food.naturalCount).toBe(NATURAL_FOOD_TARGET);
    expect(w.food.added).toEqual([]);
  });

  it('endTick clears snake events and food events', () => {
    const w = emptyWorld();
    const s = place(w, C, C, 0);
    s.setInput(1, false);
    tick(w, 20);
    expect(s.events).toEqual([]);
    expect(s.stateDirty).toBe(false);
    expect(w.food.added).toEqual([]);
  });

  it('leaderboard sorts by score descending', () => {
    const w = emptyWorld();
    const small = place(w, C - 500, C, 0);
    const big = place(w, C + 500, C, 0);
    big.eat(10);
    tick(w, 120);
    expect(w.leaderboard()[0]).toBe(big);
    expect(w.leaderboard()[1]).toBe(small);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run packages/server/test/world.test.ts`
Expected: FAIL — `Failed to resolve import "../src/game/world"`.

- [ ] **Step 3: SpatialIndex 구현**

`packages/server/src/game/collision.ts`:
```ts
import { sectorCoord, sectorKey } from '@snake/shared';
import type { Snake } from './snake';

export interface BodyEntry {
  snake: Snake;
  x: number;
  y: number;
}

const CELL = 160;

function cellKey(cx: number, cy: number): number {
  return cx * 4096 + cy;
}

/** Rebuilt every tick: a fine grid of body points for collision/probing plus sector → snakes for AOI. */
export class SpatialIndex {
  private readonly cells = new Map<number, BodyEntry[]>();
  private readonly sectorSnakes = new Map<number, Set<Snake>>();
  maxRadius = 0;

  rebuild(snakes: Iterable<Snake>): void {
    this.cells.clear();
    this.sectorSnakes.clear();
    this.maxRadius = 0;
    for (const s of snakes) {
      if (!s.alive) continue;
      this.maxRadius = Math.max(this.maxRadius, s.radius);
      for (const p of s.points) this.insert(s, p.x, p.y);
      this.insert(s, s.headX, s.headY);
    }
  }

  private insert(snake: Snake, x: number, y: number): void {
    const key = cellKey(Math.floor(x / CELL), Math.floor(y / CELL));
    let list = this.cells.get(key);
    if (!list) {
      list = [];
      this.cells.set(key, list);
    }
    list.push({ snake, x, y });

    const sk = sectorKey(sectorCoord(x), sectorCoord(y));
    let set = this.sectorSnakes.get(sk);
    if (!set) {
      set = new Set();
      this.sectorSnakes.set(sk, set);
    }
    set.add(snake);
  }

  forEachNear(x: number, y: number, r: number, cb: (e: BodyEntry) => boolean | void): void {
    const cx0 = Math.floor((x - r) / CELL);
    const cx1 = Math.floor((x + r) / CELL);
    const cy0 = Math.floor((y - r) / CELL);
    const cy1 = Math.floor((y + r) / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const list = this.cells.get(cellKey(cx, cy));
        if (!list) continue;
        for (const e of list) if (cb(e) === true) return;
      }
    }
  }

  snakesInSector(key: number): ReadonlySet<Snake> | undefined {
    return this.sectorSnakes.get(key);
  }
}
```

- [ ] **Step 4: World 구현**

`packages/server/src/game/world.ts`:
```ts
import {
  BOOST_COST, BOOST_DROP_INTERVAL, BOOST_FOOD_SIZE, BOOST_RECYCLE, DEATH_FOOD_SIZE,
  DEATH_FOOD_VALUE, EAT_MARGIN, FOOD_COLORS, FOOD_RESPAWN_PER_TICK, NATURAL_FOOD_TARGET,
  NO_KILLER, SPAWN_CLEARANCE, SPAWN_RADIUS_FRAC, TAU, WORLD_RADIUS, type Vec,
} from '@snake/shared';
import { SpatialIndex } from './collision';
import { FoodStore } from './food';
import { Snake } from './snake';

export interface DeathInfo {
  snake: Snake;
  killerId: number;
}

const MAX_ID = 0xfffe; // 0xffff is NO_KILLER, 0 is never used

export class World {
  readonly snakes = new Map<number, Snake>();
  readonly food: FoodStore;
  readonly index = new SpatialIndex();
  deaths: DeathInfo[] = [];
  private pendingDeaths: DeathInfo[] = [];
  private lastId = 0;

  constructor(private readonly rng: () => number = Math.random, initialFood = NATURAL_FOOD_TARGET) {
    this.food = new FoodStore(rng);
    this.food.spawnNatural(initialFood);
    this.food.clearEvents();
  }

  allocId(): number {
    for (let i = 0; i < MAX_ID; i++) {
      this.lastId = (this.lastId % MAX_ID) + 1;
      if (!this.snakes.has(this.lastId)) return this.lastId;
    }
    throw new Error('no free snake id');
  }

  addSnake(s: Snake): void {
    this.snakes.set(s.id, s);
  }

  spawnSnake(name: string, skin: number, isBot: boolean): Snake {
    const p = this.findSpawn();
    const s = new Snake(this.allocId(), name, skin, isBot, p.x, p.y, this.rng() * TAU);
    this.addSnake(s);
    return s;
  }

  private findSpawn(): Vec {
    let p: Vec = { x: WORLD_RADIUS, y: WORLD_RADIUS };
    const c2 = SPAWN_CLEARANCE * SPAWN_CLEARANCE;
    for (let attempt = 0; attempt < 20; attempt++) {
      const rr = WORLD_RADIUS * SPAWN_RADIUS_FRAC * Math.sqrt(this.rng());
      const a = this.rng() * TAU;
      p = { x: WORLD_RADIUS + Math.cos(a) * rr, y: WORLD_RADIUS + Math.sin(a) * rr };
      const box = { clear: true };
      this.index.forEachNear(p.x, p.y, SPAWN_CLEARANCE, (e) => {
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        if (dx * dx + dy * dy < c2) {
          box.clear = false;
          return true;
        }
        return false;
      });
      if (box.clear) return p;
    }
    return p;
  }

  killSnake(s: Snake, killerId: number): void {
    if (!s.alive) return;
    if (killerId !== NO_KILLER) {
      const killer = this.snakes.get(killerId);
      if (killer) killer.kills++;
    }
    this.removeSnake(s, killerId);
  }

  private removeSnake(s: Snake, killerId: number): void {
    if (!s.alive) return;
    s.alive = false;
    this.snakes.delete(s.id);
    for (const p of s.points) this.dropDeathFood(p.x, p.y, s.skin);
    this.pendingDeaths.push({ snake: s, killerId });
  }

  private dropDeathFood(x: number, y: number, skin: number): void {
    for (let attempt = 0; attempt < 2; attempt++) {
      const jx = x + (this.rng() * 2 - 1) * 10;
      const jy = y + (this.rng() * 2 - 1) * 10;
      if (this.food.add(jx, jy, DEATH_FOOD_SIZE, skin % FOOD_COLORS, DEATH_FOOD_VALUE, 'death')) return;
    }
  }

  tick(dt: number): void {
    const boostValue = BOOST_COST * BOOST_DROP_INTERVAL * BOOST_RECYCLE;
    for (const s of this.snakes.values()) {
      for (const d of s.step(dt)) {
        this.food.add(d.x, d.y, BOOST_FOOD_SIZE, s.skin % FOOD_COLORS, boostValue, 'boost');
      }
    }

    for (const s of this.snakes.values()) {
      for (const f of this.food.queryCircle(s.headX, s.headY, s.radius + EAT_MARGIN)) {
        this.food.remove(f, s.id);
        s.eat(f.value);
      }
    }

    this.index.rebuild(this.snakes.values());
    const hits = this.detectCollisions();
    for (const h of hits) {
      if (h.killerId !== NO_KILLER) {
        const killer = this.snakes.get(h.killerId);
        if (killer) killer.kills++;
      }
    }
    for (const h of hits) this.removeSnake(h.victim, h.killerId);

    const missing = NATURAL_FOOD_TARGET - this.food.naturalCount;
    if (missing > 0) this.food.spawnNatural(Math.min(FOOD_RESPAWN_PER_TICK, missing));

    this.deaths.push(...this.pendingDeaths);
    this.pendingDeaths = [];
  }

  private detectCollisions(): Array<{ victim: Snake; killerId: number }> {
    const out: Array<{ victim: Snake; killerId: number }> = [];
    for (const a of this.snakes.values()) {
      const ra = a.radius;
      if (Math.hypot(a.headX - WORLD_RADIUS, a.headY - WORLD_RADIUS) + ra > WORLD_RADIUS) {
        out.push({ victim: a, killerId: NO_KILLER });
        continue;
      }
      const hit: { by: Snake | null } = { by: null };
      this.index.forEachNear(a.headX, a.headY, 0.6 * ra + this.index.maxRadius, (e) => {
        if (e.snake === a) return false;
        const limit = 0.6 * ra + e.snake.radius;
        const dx = e.x - a.headX;
        const dy = e.y - a.headY;
        if (dx * dx + dy * dy < limit * limit) {
          hit.by = e.snake;
          return true;
        }
        return false;
      });
      if (hit.by) out.push({ victim: a, killerId: hit.by.id });
    }
    return out;
  }

  endTick(): void {
    for (const s of this.snakes.values()) s.clearEvents();
    this.food.clearEvents();
    this.deaths = [];
  }

  leaderboard(): Snake[] {
    return Array.from(this.snakes.values()).sort((a, b) => b.score - a.score);
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run packages/server && npx tsc -p packages/server`
Expected: 전부 PASS, 타입 오류 0.

- [ ] **Step 6: 커밋**

```bash
git add packages/server
git commit -m "feat(server): add spatial index and world tick with collisions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: 관심 영역(AOI) 프레임 빌더 + 리더보드·미니맵

**Files:**
- Create: `packages/shared/src/wire.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/server/src/net/interest.ts`
- Test: `packages/server/test/interest.test.ts`

**Interfaces:**
- Consumes: Task 2 `Writer`, `encodeServer`, `ServerMsg`, `decodeServerFrame`(테스트); Task 3 `Snake`, `BodyReplica`(테스트); Task 4 `Food`; Task 5 `World`, `DeathInfo`; Task 1 `viewRadius`, `sectorCoord`, `sectorKey`, `quantizeAngle16`, 상수
- Produces:
  - `@snake/shared` (`wire.ts`): `toWireSpeed(unitsPerSec: number): number`, `fromWireSpeed(w: number): number`, `toWireFam(fam: number): number`, `fromWireFam(w: number): number`
  - `packages/server/src/net/interest.ts`:
    - `interface ViewState { snake: Snake | null; viewX: number; viewY: number; sectors: Set<number>; snakes: Set<number> }`
    - `newViewState(): ViewState`
    - `interface FrameExtras { ranked?: Snake[]; minimap?: Uint8Array; death?: DeathInfo }`
    - `buildFrame(view: ViewState, world: World, extras: FrameExtras): Uint8Array | null` — 상태 없는 차분 계산 후 `view.sectors`/`view.snakes`를 갱신. 보낼 것이 없으면 `null`.
    - `visibleSectors(cx: number, cy: number, radius: number): Set<number>`
    - `snakeAddMsg(s: Snake): ServerMsg`
    - `buildMinimap(world: World): Uint8Array` (512바이트)
- 호출 순서 규칙: `world.tick()` → 세션마다 `buildFrame()` → `world.endTick()`. `death`를 넘긴 뒤 `view.snake = null`은 호출자(Task 7)가 한다.

- [ ] **Step 1: 와이어 변환 헬퍼 작성**

`packages/shared/src/wire.ts`:
```ts
/** Speed travels as u8 = units/s ÷ 2 (spec §7). */
export function toWireSpeed(unitsPerSec: number): number {
  return Math.max(0, Math.min(255, Math.round(unitsPerSec / 2)));
}

export function fromWireSpeed(w: number): number {
  return w * 2;
}

/** fam travels as u16 = round(min(fam, 1)·65535). */
export function toWireFam(fam: number): number {
  return Math.round(Math.max(0, Math.min(fam, 1)) * 65535);
}

export function fromWireFam(w: number): number {
  return w / 65535;
}
```

`packages/shared/src/index.ts`를 다음으로 교체:
```ts
export * from './constants';
export * from './physics';
export * from './protocol';
export * from './body';
export * from './wire';
```

- [ ] **Step 2: 실패하는 AOI 테스트 작성**

`packages/server/test/interest.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  BodyReplica, MINIMAP_SIZE, NO_KILLER, SECTORS_PER_EDGE, TICK_DT, WORLD_RADIUS,
  decodeServerFrame, sectorKey, type ServerMsg,
} from '@snake/shared';
import { Snake } from '../src/game/snake';
import { World } from '../src/game/world';
import { buildFrame, buildMinimap, newViewState, visibleSectors, type FrameExtras, type ViewState } from '../src/net/interest';
import { seededRng } from './helpers';

const C = WORLD_RADIUS;

function setup() {
  const world = new World(seededRng(5), 0);
  const view = newViewState();
  const self = new Snake(world.allocId(), 'me', 0, false, C, C, 0);
  world.addSnake(self);
  view.snake = self;
  return { world, view, self };
}

/** One server tick for one viewer; returns decoded messages. */
function step(world: World, view: ViewState, extras: FrameExtras = {}): ServerMsg[] {
  world.tick(TICK_DT);
  const frame = buildFrame(view, world, extras);
  world.endTick();
  return frame ? decodeServerFrame(frame) : [];
}

describe('visibleSectors', () => {
  it('covers a (2k+1)² square at the center', () => {
    expect(visibleSectors(C, C, 1300).size).toBe(49);
  });
  it('clips to the grid and the world circle near the edge', () => {
    const set = visibleSectors(100, C, 1300);
    expect(set.size).toBeLessThan(49);
    for (const key of set) {
      expect(key).toBeGreaterThanOrEqual(0);
      expect(key).toBeLessThan(SECTORS_PER_EDGE * SECTORS_PER_EDGE);
    }
  });
});

describe('first frame', () => {
  it('sends self as snakeAdd and the food of visible sectors', () => {
    const { world, view, self } = setup();
    const food = world.food.add(C + 300, C + 300, 2, 1, 0.1, 'natural')!;
    world.food.clearEvents();
    const msgs = step(world, view);
    const add = msgs.find((m) => m.t === 'snakeAdd');
    expect(add && add.t === 'snakeAdd' && add.id).toBe(self.id);
    const sectorFood = msgs.filter((m) => m.t === 'sectorFood');
    expect(sectorFood.some((m) => m.t === 'sectorFood' && m.sx === food.sx && m.sy === food.sy
      && m.foods.some((f) => f.rx === food.rx && f.ry === food.ry))).toBe(true);
  });

  it('snakeAdd decodes into a replica equal to the server body', () => {
    const { world, view, self } = setup();
    self.eat(4);
    for (let i = 0; i < 60; i++) {
      world.tick(TICK_DT);
      world.endTick();
    }
    const add = step(world, view).find((m) => m.t === 'snakeAdd' && m.id === self.id);
    if (!add || add.t !== 'snakeAdd') throw new Error('missing snakeAdd');
    const replica = new BodyReplica(add.tailX, add.tailY, add.iangs);
    expect(replica.points).toHaveLength(self.points.length);
    replica.points.forEach((p, i) => {
      expect(p.x).toBeCloseTo(self.points[i].x, 9);
      expect(p.y).toBeCloseTo(self.points[i].y, 9);
    });
  });
});

describe('incremental frames', () => {
  it('sends only move events for a visible snake after the first frame', () => {
    const { world, view, self } = setup();
    step(world, view);
    const later: ServerMsg[] = [];
    for (let i = 0; i < 30; i++) later.push(...step(world, view));
    const own = later.filter((m) => 'id' in m && m.id === self.id);
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((m) => m.t === 'snakeMove')).toBe(true);
  });

  it('sends state when input changes and fam when eating', () => {
    const { world, view, self } = setup();
    step(world, view);
    self.setInput(1, false);
    world.food.add(C + 15, C, 2, 0, 0.1, 'natural');
    const msgs = step(world, view);
    expect(msgs.some((m) => m.t === 'snakeState' && m.id === self.id)).toBe(true);
    expect(msgs.some((m) => m.t === 'snakeFam' && m.id === self.id)).toBe(true);
  });

  it('sends foodAdd and foodEat only for sectors that stayed visible', () => {
    const { world, view } = setup();
    step(world, view);
    const f = world.food.add(C + 600, C + 600, 2, 0, 0.1, 'natural')!;
    const added = step(world, view);
    expect(added.some((m) => m.t === 'foodAdd' && m.rx === f.rx && m.ry === f.ry)).toBe(true);
    world.food.remove(f, NO_KILLER);
    const eaten = step(world, view);
    expect(eaten.some((m) => m.t === 'foodEat' && m.rx === f.rx && m.ry === f.ry)).toBe(true);
  });

  it('crossing a sector boundary leaves the old column and loads the new one', () => {
    const { world, view } = setup();
    const ahead = world.food.add(20 * 480 + 10, C, 3, 0, 0.15, 'natural')!; // sector column 20
    step(world, view);
    const msgs: ServerMsg[] = [];
    for (let i = 0; i < 45; i++) msgs.push(...step(world, view));
    expect(msgs.some((m) => m.t === 'sectorLeave' && m.sx === 13)).toBe(true);
    expect(msgs.some((m) => m.t === 'sectorFood' && m.sx === ahead.sx
      && m.foods.some((f) => f.rx === ahead.rx && f.ry === ahead.ry))).toBe(true);
  });
});

describe('other snakes', () => {
  it('adds a snake entering view and removes it with reason 1 when it dies', () => {
    const { world, view } = setup();
    const far = new Snake(world.allocId(), 'far', 1, true, C + 4000, C, Math.PI / 2);
    world.addSnake(far);
    expect(step(world, view).some((m) => m.t === 'snakeAdd' && m.id === far.id)).toBe(false);

    const near = new Snake(world.allocId(), 'near', 2, true, C, C + 600, 0);
    world.addSnake(near);
    expect(step(world, view).some((m) => m.t === 'snakeAdd' && m.id === near.id)).toBe(true);

    world.killSnake(near, NO_KILLER);
    const msgs = step(world, view);
    expect(msgs).toContainEqual({ t: 'snakeRemove', id: near.id, reason: 1 });
  });
});

describe('dense sectors and extras', () => {
  it('splits sector food over 255 into several messages', () => {
    const { world, view } = setup();
    // Sector (17,17) spans 8160..8640, away from the head at (8000, 8000) so nothing gets eaten.
    for (let i = 0; i < 300; i++) {
      world.food.add(8161 + (i % 20) * 20, 8161 + Math.floor(i / 20) * 20, 1, 0, 0.05, 'natural');
    }
    world.food.clearEvents();
    const chunks = step(world, view).filter((m) => m.t === 'sectorFood' && m.sx === 17 && m.sy === 17);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const total = chunks.reduce((n, m) => n + (m.t === 'sectorFood' ? m.foods.length : 0), 0);
    expect(total).toBe(300);
  });

  it('encodes leaderboard rank, death, and minimap when requested', () => {
    const { world, view, self } = setup();
    world.tick(TICK_DT);
    const ranked = world.leaderboard();
    const minimap = buildMinimap(world);
    const frame = buildFrame(view, world, { ranked, minimap, death: { snake: self, killerId: NO_KILLER } });
    world.endTick();
    const msgs = decodeServerFrame(frame!);
    expect(msgs).toContainEqual({ t: 'leaderboard', myRank: 1, total: 1, entries: [{ score: self.score, name: 'me' }] });
    expect(msgs).toContainEqual({ t: 'death', killerId: NO_KILLER, finalScore: self.score });
    expect(msgs.some((m) => m.t === 'minimap')).toBe(true);
  });

  it('buildMinimap sets the bit of each occupied cell', () => {
    const { world, self } = setup();
    const bits = buildMinimap(world);
    expect(bits.length).toBe((MINIMAP_SIZE * MINIMAP_SIZE) / 8);
    const cell = (2 * WORLD_RADIUS) / MINIMAP_SIZE;
    const idx = Math.floor(self.headY / cell) * MINIMAP_SIZE + Math.floor(self.headX / cell);
    expect(bits[idx >> 3] & (0x80 >> (idx & 7))).not.toBe(0);
  });

  it('a viewer without a snake keeps watching its last view center', () => {
    const world = new World(seededRng(9), 0);
    const view = newViewState();
    view.viewX = 200;
    view.viewY = C;
    step(world, view);
    step(world, view);
    expect(view.sectors).toEqual(visibleSectors(200, C, 1300));
    expect(view.sectors.has(sectorKey(0, 16))).toBe(true);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run packages/server/test/interest.test.ts`
Expected: FAIL — `Failed to resolve import "../src/net/interest"`.

- [ ] **Step 4: interest 구현**

`packages/server/src/net/interest.ts`:
```ts
import {
  LEADERBOARD_SIZE, MINIMAP_SIZE, SECTORS_PER_EDGE, SECTOR_SIZE, START_SEGMENTS, WORLD_RADIUS,
  Writer, encodeServer, quantizeAngle16, sectorCoord, sectorKey, toWireFam, toWireSpeed,
  viewRadius, type FoodWire, type ServerMsg,
} from '@snake/shared';
import type { Food } from '../game/food';
import type { Snake } from '../game/snake';
import type { DeathInfo, World } from '../game/world';

export interface ViewState {
  snake: Snake | null;
  viewX: number;
  viewY: number;
  sectors: Set<number>;
  snakes: Set<number>;
}

export interface FrameExtras {
  ranked?: Snake[];
  minimap?: Uint8Array;
  death?: DeathInfo;
}

const MAX_U24 = 0xffffff;

export function newViewState(): ViewState {
  return { snake: null, viewX: WORLD_RADIUS, viewY: WORLD_RADIUS, sectors: new Set(), snakes: new Set() };
}

export function visibleSectors(cx: number, cy: number, radius: number): Set<number> {
  const out = new Set<number>();
  const k = Math.ceil(radius / SECTOR_SIZE);
  const csx = sectorCoord(cx);
  const csy = sectorCoord(cy);
  const r2 = WORLD_RADIUS * WORLD_RADIUS;
  for (let sx = Math.max(0, csx - k); sx <= Math.min(SECTORS_PER_EDGE - 1, csx + k); sx++) {
    for (let sy = Math.max(0, csy - k); sy <= Math.min(SECTORS_PER_EDGE - 1, csy + k); sy++) {
      const nx = Math.max(sx * SECTOR_SIZE, Math.min(WORLD_RADIUS, (sx + 1) * SECTOR_SIZE));
      const ny = Math.max(sy * SECTOR_SIZE, Math.min(WORLD_RADIUS, (sy + 1) * SECTOR_SIZE));
      const dx = nx - WORLD_RADIUS;
      const dy = ny - WORLD_RADIUS;
      if (dx * dx + dy * dy <= r2) out.add(sectorKey(sx, sy));
    }
  }
  return out;
}

export function snakeAddMsg(s: Snake): ServerMsg {
  const snap = s.addSnapshot();
  return {
    t: 'snakeAdd',
    id: s.id,
    name: s.name,
    skin: s.skin,
    ang: quantizeAngle16(s.ang),
    wang: quantizeAngle16(s.wang),
    speed: toWireSpeed(s.speed),
    fam: toWireFam(s.fam),
    tailX: snap.tailX,
    tailY: snap.tailY,
    iangs: snap.iangs,
  };
}

function toWireFood(f: Food): FoodWire {
  return { rx: f.rx, ry: f.ry, size: f.size, color: f.color };
}

function encodeSectorFood(w: Writer, sx: number, sy: number, foods: Food[]): void {
  for (let i = 0; i < foods.length; i += 255) {
    encodeServer(w, { t: 'sectorFood', sx, sy, foods: foods.slice(i, i + 255).map(toWireFood) });
  }
}

export function buildFrame(view: ViewState, world: World, extras: FrameExtras): Uint8Array | null {
  const w = new Writer();
  const self = view.snake && view.snake.alive ? view.snake : null;
  if (self) {
    view.viewX = self.headX;
    view.viewY = self.headY;
  }

  // Sectors and food
  const nextSectors = visibleSectors(view.viewX, view.viewY, viewRadius(self ? self.sct : START_SEGMENTS));
  for (const key of view.sectors) {
    if (!nextSectors.has(key)) {
      encodeServer(w, { t: 'sectorLeave', sx: Math.floor(key / SECTORS_PER_EDGE), sy: key % SECTORS_PER_EDGE });
    }
  }
  for (const key of nextSectors) {
    if (view.sectors.has(key)) continue;
    const sx = Math.floor(key / SECTORS_PER_EDGE);
    const sy = key % SECTORS_PER_EDGE;
    encodeSectorFood(w, sx, sy, world.food.sectorFoods(sx, sy));
  }
  const stayed = (sx: number, sy: number): boolean => {
    const key = sectorKey(sx, sy);
    return view.sectors.has(key) && nextSectors.has(key);
  };
  for (const f of world.food.added) {
    if (stayed(f.sx, f.sy)) {
      encodeServer(w, { t: 'foodAdd', sx: f.sx, sy: f.sy, rx: f.rx, ry: f.ry, size: f.size, color: f.color });
    }
  }
  for (const e of world.food.eaten) {
    const f = e.food;
    if (stayed(f.sx, f.sy)) {
      encodeServer(w, { t: 'foodEat', sx: f.sx, sy: f.sy, rx: f.rx, ry: f.ry, eaterId: e.eaterId });
    }
  }

  // Snakes
  const nextSnakes = new Map<number, Snake>();
  for (const key of nextSectors) {
    const set = world.index.snakesInSector(key);
    if (!set) continue;
    for (const s of set) if (s.alive) nextSnakes.set(s.id, s);
  }
  if (self) nextSnakes.set(self.id, self);

  const died = new Set(world.deaths.map((d) => d.snake.id));
  for (const id of view.snakes) {
    if (!nextSnakes.has(id)) encodeServer(w, { t: 'snakeRemove', id, reason: died.has(id) ? 1 : 0 });
  }
  for (const [id, s] of nextSnakes) {
    if (!view.snakes.has(id)) {
      encodeServer(w, snakeAddMsg(s));
      continue;
    }
    for (const e of s.events) {
      if (e.k === 'move') encodeServer(w, { t: 'snakeMove', id, iang: e.iang });
      else if (e.k === 'grow') encodeServer(w, { t: 'snakeGrow', id, iang: e.iang, fam: toWireFam(e.fam) });
      else encodeServer(w, { t: 'snakeShrink', id, fam: toWireFam(e.fam) });
    }
    if (s.stateDirty) {
      encodeServer(w, { t: 'snakeState', id, ang: quantizeAngle16(s.ang), wang: quantizeAngle16(s.wang), speed: toWireSpeed(s.speed) });
    }
    if (s.famDirty) encodeServer(w, { t: 'snakeFam', id, fam: toWireFam(s.fam) });
  }

  // Extras
  if (extras.ranked) {
    const ranked = extras.ranked;
    const myRank = self ? ranked.indexOf(self) + 1 : 0;
    encodeServer(w, {
      t: 'leaderboard',
      myRank,
      total: ranked.length,
      entries: ranked.slice(0, LEADERBOARD_SIZE).map((s) => ({ score: Math.min(s.score, MAX_U24), name: s.name })),
    });
  }
  if (extras.minimap) encodeServer(w, { t: 'minimap', bits: extras.minimap });
  if (extras.death) {
    encodeServer(w, { t: 'death', killerId: extras.death.killerId, finalScore: Math.max(0, Math.min(extras.death.snake.score, MAX_U24)) });
  }

  view.sectors = nextSectors;
  view.snakes = new Set(nextSnakes.keys());
  return w.length > 0 ? w.finish() : null;
}

export function buildMinimap(world: World): Uint8Array {
  const bits = new Uint8Array((MINIMAP_SIZE * MINIMAP_SIZE) / 8);
  const cell = (2 * WORLD_RADIUS) / MINIMAP_SIZE;
  const clamp = (v: number) => Math.max(0, Math.min(MINIMAP_SIZE - 1, Math.floor(v / cell)));
  for (const s of world.snakes.values()) {
    for (const p of [...s.points, { x: s.headX, y: s.headY }]) {
      const idx = clamp(p.y) * MINIMAP_SIZE + clamp(p.x);
      bits[idx >> 3] |= 0x80 >> (idx & 7);
    }
  }
  return bits;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run packages/shared packages/server && npx tsc -p packages/shared && npx tsc -p packages/server`
Expected: 전부 PASS, 타입 오류 0.

- [ ] **Step 6: 커밋**

```bash
git add packages/shared packages/server
git commit -m "feat(server): add AOI frame builder, leaderboard and minimap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: WebSocket 서버, 틱 루프, 세션 입력 검증

스펙과의 차이 1건: 스펙 §8 수명주기는 "접속 → WELCOME → JOIN"이지만, WELCOME의 `selfId`는 스폰 전에는 정할 수 없다. 그래서 **WELCOME은 JOIN으로 스폰할 때마다** 단독 프레임으로 보낸다. 접속 직후 JOIN 전에는 월드 중심을 관전하는 프레임(먹이·뱀)을 받는다. 시작 화면 뒤 배경으로 쓴다.

**Files:**
- Create: `packages/server/src/net/session.ts`
- Create: `packages/server/src/server.ts`
- Create: `packages/server/src/index.ts`
- Test: `packages/server/test/session.test.ts`, `packages/server/test/server.test.ts`

**Interfaces:**
- Consumes: Task 2 `decodeClient`, `encodeServer`, `Writer`, `ProtocolError`, `sanitizeName`, `decodeServerFrame`/`encodeClient`(테스트); Task 5 `World`; Task 6 `buildFrame`, `buildMinimap`, `newViewState`, `ViewState`; Task 1 `dequantizeAngle8`, 상수
- Produces:
  - `packages/server/src/net/session.ts`: `MAX_MSGS_PER_SEC = 60`, `MAX_OVER_LIMIT_WINDOWS = 3`, `class Session { readonly view: ViewState; constructor(socket: WebSocket); readonly socket: WebSocket; admit(nowMs: number): 'ok' | 'drop' | 'close' }`
  - `packages/server/src/server.ts`:
    - `interface ServerStats { ticks: number; lastTickMs: number; avgTickMs: number; maxTickMs: number; bytesSent: number }`
    - `interface ServerOptions { port: number; rng?: () => number; initialFood?: number; beforeTick?: (world: World, tick: number) => void }`
    - `interface GameServer { port: number; world: World; stats: ServerStats; sessions: Set<Session>; close(): Promise<void> }`
    - `startServer(opts: ServerOptions): Promise<GameServer>` — `port: 0`이면 빈 포트를 잡고 실제 포트를 `port`로 돌려준다. `beforeTick`은 Task 8 봇이 연결하는 지점.

- [ ] **Step 1: 실패하는 Session 테스트 작성**

`packages/server/test/session.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { MAX_MSGS_PER_SEC, Session } from '../src/net/session';

const fakeSocket = {} as WebSocket;

describe('Session.admit', () => {
  it('drops messages beyond the per-second limit', () => {
    const s = new Session(fakeSocket);
    const verdicts = Array.from({ length: MAX_MSGS_PER_SEC + 5 }, () => s.admit(10_000));
    expect(verdicts.filter((v) => v === 'ok')).toHaveLength(MAX_MSGS_PER_SEC);
    expect(verdicts.slice(MAX_MSGS_PER_SEC).every((v) => v === 'drop')).toBe(true);
  });

  it('closes after three consecutive over-limit seconds', () => {
    const s = new Session(fakeSocket);
    let t = 10_000;
    for (let w = 0; w < 3; w++, t += 1000) for (let i = 0; i < 100; i++) s.admit(t);
    expect(s.admit(t)).toBe('close');
  });

  it('a calm second resets the over-limit streak', () => {
    const s = new Session(fakeSocket);
    let t = 10_000;
    for (let w = 0; w < 2; w++, t += 1000) for (let i = 0; i < 100; i++) s.admit(t);
    s.admit(t);
    t += 1000;
    for (let i = 0; i < 100; i++) s.admit(t);
    t += 1000;
    expect(s.admit(t)).toBe('ok');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인 후 Session 구현**

Run: `npx vitest run packages/server/test/session.test.ts`
Expected: FAIL — `Failed to resolve import "../src/net/session"`.

`packages/server/src/net/session.ts`:
```ts
import type { WebSocket } from 'ws';
import { newViewState, type ViewState } from './interest';

export const MAX_MSGS_PER_SEC = 60;
export const MAX_OVER_LIMIT_WINDOWS = 3;

export class Session {
  readonly view: ViewState = newViewState();
  private windowStart = 0;
  private windowCount = 0;
  private overLimitWindows = 0;

  constructor(readonly socket: WebSocket) {}

  /** Fixed one-second windows: excess messages are dropped; three over-limit windows in a row close the socket. */
  admit(nowMs: number): 'ok' | 'drop' | 'close' {
    if (nowMs - this.windowStart >= 1000) {
      this.overLimitWindows = this.windowCount > MAX_MSGS_PER_SEC ? this.overLimitWindows + 1 : 0;
      this.windowStart = nowMs;
      this.windowCount = 0;
    }
    this.windowCount++;
    if (this.overLimitWindows >= MAX_OVER_LIMIT_WINDOWS) return 'close';
    return this.windowCount > MAX_MSGS_PER_SEC ? 'drop' : 'ok';
  }
}
```

Run: `npx vitest run packages/server/test/session.test.ts`
Expected: PASS.

- [ ] **Step 3: 실패하는 서버 통합 테스트 작성**

`packages/server/test/server.test.ts`:
```ts
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  NO_KILLER, decodeServerFrame, encodeClient, quantizeAngle16, type ClientMsg, type ServerMsg,
} from '@snake/shared';
import { startServer, type GameServer } from '../src/server';
import { seededRng } from './helpers';

interface TestClient {
  ws: WebSocket;
  msgs: ServerMsg[];
  closed: Promise<number>;
  send(msg: ClientMsg): void;
}

let server: GameServer | null = null;
const clients: TestClient[] = [];

afterEach(async () => {
  for (const c of clients.splice(0)) c.ws.terminate();
  await server?.close();
  server = null;
});

async function boot(): Promise<GameServer> {
  server = await startServer({ port: 0, rng: seededRng(11), initialFood: 500 });
  return server;
}

async function connect(port: number): Promise<TestClient> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const msgs: ServerMsg[] = [];
  ws.on('message', (data: Buffer) => msgs.push(...decodeServerFrame(new Uint8Array(data))));
  const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
  await once(ws, 'open');
  const client: TestClient = { ws, msgs, closed, send: (m) => ws.send(encodeClient(m)) };
  clients.push(client);
  return client;
}

async function waitFor(cond: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

function welcomeOf(c: TestClient) {
  const w = c.msgs.find((m) => m.t === 'welcome');
  return w && w.t === 'welcome' ? w : null;
}

describe('game server', () => {
  it('join sends welcome, then self snakeAdd and sector food', async () => {
    const { port } = await boot();
    const c = await connect(port);
    c.send({ t: 'join', name: 'tester', skin: 3 });
    await waitFor(() => welcomeOf(c) !== null);
    const selfId = welcomeOf(c)!.selfId;
    await waitFor(() => c.msgs.some((m) => m.t === 'snakeAdd' && m.id === selfId));
    expect(c.msgs.some((m) => m.t === 'sectorFood')).toBe(true);
    const add = c.msgs.find((m) => m.t === 'snakeAdd' && m.id === selfId);
    expect(add && add.t === 'snakeAdd' && add.name).toBe('tester');
  });

  it('answers ping with pong', async () => {
    const { port } = await boot();
    const c = await connect(port);
    c.send({ t: 'ping' });
    await waitFor(() => c.msgs.some((m) => m.t === 'pong'));
  });

  it('steer changes the target angle', async () => {
    const { port } = await boot();
    const c = await connect(port);
    c.send({ t: 'join', name: 'a', skin: 0 });
    await waitFor(() => welcomeOf(c) !== null);
    const selfId = welcomeOf(c)!.selfId;
    c.send({ t: 'steer', angle: 64 });
    await waitFor(() => c.msgs.some((m) => m.t === 'snakeState' && m.id === selfId && m.wang === quantizeAngle16(Math.PI / 2)));
  });

  it('ignores join while already alive', async () => {
    const srv = await boot();
    const c = await connect(srv.port);
    c.send({ t: 'join', name: 'a', skin: 0 });
    c.send({ t: 'join', name: 'b', skin: 0 });
    await waitFor(() => welcomeOf(c) !== null);
    await new Promise((r) => setTimeout(r, 100));
    expect(c.msgs.filter((m) => m.t === 'welcome')).toHaveLength(1);
    expect(srv.world.snakes.size).toBe(1);
  });

  it('garbage frame closes only that socket', async () => {
    const { port } = await boot();
    const good = await connect(port);
    good.send({ t: 'join', name: 'good', skin: 0 });
    await waitFor(() => welcomeOf(good) !== null);
    const bad = await connect(port);
    bad.ws.send(new Uint8Array([0x7f, 1, 2]));
    expect(await bad.closed).toBe(1008);
    const before = good.msgs.length;
    await waitFor(() => good.msgs.length > before + 3);
    expect(good.ws.readyState).toBe(WebSocket.OPEN);
  });

  it('text frames are rejected with 1008', async () => {
    const { port } = await boot();
    const c = await connect(port);
    c.ws.send('hello');
    expect(await c.closed).toBe(1008);
  });

  it('disconnect while alive turns the snake into food', async () => {
    const srv = await boot();
    const c = await connect(srv.port);
    c.send({ t: 'join', name: 'quitter', skin: 1 });
    await waitFor(() => welcomeOf(c) !== null);
    const id = welcomeOf(c)!.selfId;
    const snake = srv.world.snakes.get(id)!;
    c.ws.close();
    await waitFor(() => !srv.world.snakes.has(id));
    const nearby = srv.world.food.queryCircle(snake.headX, snake.headY, 100);
    expect(nearby.some((f) => f.kind === 'death')).toBe(true);
  });

  it('a killed player gets death and its own removal with reason 1', async () => {
    const srv = await boot();
    const c = await connect(srv.port);
    c.send({ t: 'join', name: 'victim', skin: 2 });
    await waitFor(() => welcomeOf(c) !== null);
    const id = welcomeOf(c)!.selfId;
    await waitFor(() => c.msgs.some((m) => m.t === 'snakeAdd' && m.id === id));
    srv.world.killSnake(srv.world.snakes.get(id)!, NO_KILLER);
    await waitFor(() => c.msgs.some((m) => m.t === 'death'));
    expect(c.msgs).toContainEqual({ t: 'snakeRemove', id, reason: 1 });
    c.send({ t: 'join', name: 'again', skin: 2 });
    await waitFor(() => c.msgs.filter((m) => m.t === 'welcome').length === 2);
  });

  it('sends leaderboard and minimap about once per second', async () => {
    const { port } = await boot();
    const c = await connect(port);
    c.send({ t: 'join', name: 'a', skin: 0 });
    await waitFor(() => c.msgs.some((m) => m.t === 'leaderboard') && c.msgs.some((m) => m.t === 'minimap'), 2500);
  });

  it('records tick statistics', async () => {
    const srv = await boot();
    await waitFor(() => srv.stats.ticks >= 10);
    expect(srv.stats.avgTickMs).toBeGreaterThan(0);
    expect(srv.stats.maxTickMs).toBeGreaterThanOrEqual(srv.stats.avgTickMs);
  });
});
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `npx vitest run packages/server/test/server.test.ts`
Expected: FAIL — `Failed to resolve import "../src/server"`.

- [ ] **Step 5: 서버 구현**

`packages/server/src/server.ts`:
```ts
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import {
  MAX_SEGMENTS, MSCPS, NO_KILLER, ProtocolError, SECTOR_SIZE, SEG_SPACING, TICK_DT, TICK_HZ,
  WORLD_RADIUS, Writer, decodeClient, dequantizeAngle8, encodeServer, sanitizeName,
  type ClientMsg, type ServerMsg,
} from '@snake/shared';
import { World } from './game/world';
import { buildFrame, buildMinimap } from './net/interest';
import { Session } from './net/session';

export interface ServerStats {
  ticks: number;
  lastTickMs: number;
  avgTickMs: number;
  maxTickMs: number;
  bytesSent: number;
}

export interface ServerOptions {
  port: number;
  rng?: () => number;
  initialFood?: number;
  beforeTick?: (world: World, tick: number) => void;
}

export interface GameServer {
  port: number;
  world: World;
  stats: ServerStats;
  sessions: Set<Session>;
  close(): Promise<void>;
}

const SOFT_BUFFER_LIMIT = 256 * 1024;
const HARD_BUFFER_LIMIT = 2 * 1024 * 1024;
const SLOW_TICK_MS = 50;
const POLICY_VIOLATION = 1008;

function toBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function single(msg: ServerMsg): Uint8Array {
  const w = new Writer();
  encodeServer(w, msg);
  return w.finish();
}

export async function startServer(opts: ServerOptions): Promise<GameServer> {
  const world = new World(opts.rng ?? Math.random, opts.initialFood);
  const sessions = new Set<Session>();
  const stats: ServerStats = { ticks: 0, lastTickMs: 0, avgTickMs: 0, maxTickMs: 0, bytesSent: 0 };

  const send = (session: Session, bytes: Uint8Array): void => {
    if (session.socket.readyState !== WebSocket.OPEN) return;
    session.socket.send(bytes);
    stats.bytesSent += bytes.length;
  };

  const handle = (session: Session, msg: ClientMsg): void => {
    const own = session.view.snake && session.view.snake.alive ? session.view.snake : null;
    switch (msg.t) {
      case 'join': {
        if (own) return;
        const s = world.spawnSnake(sanitizeName(msg.name), msg.skin, false);
        session.view.snake = s;
        send(session, single({
          t: 'welcome', selfId: s.id, worldRadius: WORLD_RADIUS, sectorSize: SECTOR_SIZE,
          segSpacing: SEG_SPACING, tickHz: TICK_HZ, mscps: MSCPS, maxSegments: MAX_SEGMENTS,
        }));
        return;
      }
      case 'steer':
        own?.setInput(dequantizeAngle8(msg.angle), own.wantBoost);
        return;
      case 'boost':
        own?.setInput(own.wang, msg.on);
        return;
      case 'ping':
        send(session, single({ t: 'pong' }));
        return;
    }
  };

  const http = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('snake server\n');
  });
  const wss = new WebSocketServer({ server: http, maxPayload: 1024 });

  wss.on('connection', (socket) => {
    const session = new Session(socket);
    sessions.add(session);

    socket.on('message', (data: RawData, isBinary: boolean) => {
      if (!isBinary) {
        socket.close(POLICY_VIOLATION, 'binary frames only');
        return;
      }
      const verdict = session.admit(Date.now());
      if (verdict === 'close') {
        socket.close(POLICY_VIOLATION, 'rate limit');
        return;
      }
      if (verdict === 'drop') return;
      let msg: ClientMsg;
      try {
        msg = decodeClient(toBytes(data));
      } catch (err) {
        if (err instanceof ProtocolError) {
          socket.close(POLICY_VIOLATION, 'protocol error');
          return;
        }
        throw err;
      }
      handle(session, msg);
    });

    socket.on('close', () => {
      sessions.delete(session);
      const s = session.view.snake;
      if (s && s.alive) world.killSnake(s, NO_KILLER);
      session.view.snake = null;
    });

    socket.on('error', () => socket.terminate());
  });

  const tick = (): void => {
    const t0 = performance.now();
    opts.beforeTick?.(world, stats.ticks);
    world.tick(TICK_DT);
    stats.ticks++;

    const extrasDue = stats.ticks % TICK_HZ === 0;
    const ranked = extrasDue ? world.leaderboard() : undefined;
    const minimap = extrasDue ? buildMinimap(world) : undefined;
    const deaths = new Map(world.deaths.map((d) => [d.snake.id, d]));

    for (const session of sessions) {
      const buffered = session.socket.bufferedAmount;
      if (buffered > HARD_BUFFER_LIMIT) {
        session.socket.terminate();
        continue;
      }
      const light = buffered > SOFT_BUFFER_LIMIT;
      const own = session.view.snake;
      const death = own ? deaths.get(own.id) : undefined;
      const frame = buildFrame(session.view, world, {
        ranked: light ? undefined : ranked,
        minimap: light ? undefined : minimap,
        death,
      });
      if (death) session.view.snake = null;
      if (frame) send(session, frame);
    }
    world.endTick();

    const dt = performance.now() - t0;
    stats.lastTickMs = dt;
    stats.avgTickMs += (dt - stats.avgTickMs) / stats.ticks;
    stats.maxTickMs = Math.max(stats.maxTickMs, dt);
    if (dt > SLOW_TICK_MS) console.warn(`[server] slow tick: ${dt.toFixed(1)} ms`);
  };

  let running = true;
  let timer: NodeJS.Timeout | null = null;
  let next = performance.now();
  const loop = (): void => {
    if (!running) return;
    tick();
    next += 1000 / TICK_HZ;
    const now = performance.now();
    if (now - next > SLOW_TICK_MS) next = now;
    timer = setTimeout(loop, Math.max(0, next - now));
  };

  await new Promise<void>((resolve) => http.listen(opts.port, resolve));
  const port = (http.address() as AddressInfo).port;
  timer = setTimeout(loop, 0);

  const close = async (): Promise<void> => {
    running = false;
    if (timer) clearTimeout(timer);
    for (const s of sessions) s.socket.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => http.close(() => resolve()));
  };

  return { port, world, stats, sessions, close };
}
```

`packages/server/src/index.ts`:
```ts
import { startServer } from './server';

const port = Number(process.env.PORT ?? 8080);
const server = await startServer({ port });
console.log(`[server] listening on ws://localhost:${server.port}`);

const shutdown = (): void => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npx vitest run packages/server && npx tsc -p packages/server`
Expected: 전부 PASS, 타입 오류 0.

- [ ] **Step 7: 실제 기동 확인**

macOS에는 `timeout`이 기본으로 없으므로 백그라운드로 띄워 확인한다.

Run: `PORT=8090 npx tsx packages/server/src/index.ts` (백그라운드 실행)
Expected: `[server] listening on ws://localhost:8090` 출력.

Run: `curl -s http://localhost:8090/`
Expected: `snake server`

그 다음 백그라운드 프로세스를 종료한다. 로그에 스택 트레이스가 없어야 한다.

- [ ] **Step 8: 커밋**

```bash
git add packages/server
git commit -m "feat(server): add websocket server, tick loop and input validation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: 서버 봇

**Files:**
- Create: `packages/server/src/bots/bot.ts`
- Modify: `packages/server/src/index.ts`
- Test: `packages/server/test/bot.test.ts`

**Interfaces:**
- Consumes: Task 5 `World`(`snakes`, `food.queryCircle`, `index.forEachNear`, `index.maxRadius`, `spawnSnake`); Task 3 `Snake`; Task 7 `ServerOptions.beforeTick`; Task 1 상수·`normAngle`
- Produces (`packages/server/src/bots/bot.ts`):
  - `interface Brain { wanderAngle: number; wanderLeft: number }`
  - `interface BotDecision { wang: number; boost: boolean }`
  - `class BotController { constructor(target?: number, rng?: () => number); update(world: World, tick: number): void; readonly count: number }` — 매 틱 호출. 죽은 봇을 정리하고 `target`까지 보충한 뒤, `(id + tick) % 3 === 0`인 봇만 결정한다(10 Hz 분산).
  - `decide(world: World, s: Snake, brain: Brain, rng: () => number): BotDecision`
- 결정 우선순위(스펙 §10): 경계 회피 → 위험 회피(±90° 9방향 탐침) → 먹이 추적(`value/거리` 최대) → 배회. 부스트는 먹이 추적 단계에서 반경 300 내 사망 먹이 value 합 ≥ 1이고 `sct > START_SEGMENTS + 3`일 때만.

- [ ] **Step 1: 실패하는 봇 테스트 작성**

`packages/server/test/bot.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DEATH_FOOD_VALUE, NO_KILLER, TICK_DT, WORLD_RADIUS, angleDiff, quantizeAngle16 } from '@snake/shared';
import { BotController, decide, type Brain } from '../src/bots/bot';
import { Snake } from '../src/game/snake';
import { World } from '../src/game/world';
import { seededRng } from './helpers';

const C = WORLD_RADIUS;

function emptyWorld(): World {
  return new World(seededRng(21), 0);
}

function brain(): Brain {
  return { wanderAngle: 0, wanderLeft: 0 };
}

function placeBot(w: World, x: number, y: number, ang: number): Snake {
  const s = new Snake(w.allocId(), 'bot', 0, true, x, y, ang);
  w.addSnake(s);
  return s;
}

describe('BotController', () => {
  it('fills up to the target and replaces dead bots', () => {
    const w = emptyWorld();
    const bots = new BotController(5, seededRng(1));
    bots.update(w, 0);
    expect(bots.count).toBe(5);
    expect([...w.snakes.values()].every((s) => s.isBot)).toBe(true);
    const victim = w.snakes.values().next().value as Snake;
    w.killSnake(victim, NO_KILLER);
    bots.update(w, 1);
    expect(bots.count).toBe(5);
    expect(w.snakes.has(victim.id)).toBe(false);
    expect(w.snakes.size).toBe(5);
  });
});

describe('decide', () => {
  it('turns toward the center near the world edge', () => {
    const w = emptyWorld();
    const s = placeBot(w, 2 * C - 300, C, 0);
    const d = decide(w, s, brain(), seededRng(2));
    expect(Math.abs(angleDiff(Math.PI, d.wang))).toBeLessThan(0.01);
    expect(d.boost).toBe(false);
  });

  it('steers away from a body directly ahead', () => {
    const w = emptyWorld();
    const s = placeBot(w, C, C, 0);
    const wall = new Snake(w.allocId(), 'wall', 1, false, C + 80, C + 120, Math.PI / 2);
    wall.points = Array.from({ length: 13 }, (_, i) => ({ x: C + 80, y: C - 120 + i * 20, iang: quantizeAngle16(Math.PI / 2) }));
    wall.headX = C + 80;
    wall.headY = C + 120;
    w.addSnake(wall);
    w.index.rebuild(w.snakes.values());
    const d = decide(w, s, brain(), seededRng(3));
    expect(Math.abs(angleDiff(0, d.wang))).toBeGreaterThanOrEqual(Math.PI / 4);
    expect(d.boost).toBe(false);
  });

  it('heads for the most valuable nearby food', () => {
    const w = emptyWorld();
    const s = placeBot(w, C, C, 0);
    w.food.add(C + 100, C + 100, 8, 0, DEATH_FOOD_VALUE, 'death');
    w.food.add(C - 400, C, 1, 0, 0.05, 'natural');
    w.index.rebuild(w.snakes.values());
    const d = decide(w, s, brain(), seededRng(4));
    expect(d.wang).toBeCloseTo(Math.PI / 4, 1);
  });

  it('boosts toward a rich pile of death food when long enough', () => {
    const w = emptyWorld();
    const s = placeBot(w, C, C, 0);
    s.eat(6);
    for (let i = 0; i < 90; i++) s.step(TICK_DT);
    s.clearEvents();
    for (let i = 0; i < 3; i++) w.food.add(s.headX + 100 + i * 15, s.headY + 30, 8, 0, DEATH_FOOD_VALUE, 'death');
    w.index.rebuild(w.snakes.values());
    expect(decide(w, s, brain(), seededRng(5)).boost).toBe(true);
  });

  it('wanders when there is nothing to do', () => {
    const w = emptyWorld();
    const s = placeBot(w, C, C, 0);
    w.index.rebuild(w.snakes.values());
    const b = brain();
    const d = decide(w, s, b, seededRng(6));
    expect(d.wang).toBe(b.wanderAngle);
    expect(b.wanderLeft).toBeGreaterThanOrEqual(2);
    expect(b.wanderLeft).toBeLessThanOrEqual(4);
  });
});

describe('bot survival (spec §12)', () => {
  it('bots never die at the world edge over 60 simulated seconds', () => {
    const w = new World(seededRng(77));
    const bots = new BotController(5, seededRng(78));
    let edgeDeaths = 0;
    for (let t = 0; t < 60 * 30; t++) {
      bots.update(w, t);
      w.tick(TICK_DT);
      edgeDeaths += w.deaths.filter((d) => d.killerId === NO_KILLER).length;
      w.endTick();
    }
    expect(edgeDeaths).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run packages/server/test/bot.test.ts`
Expected: FAIL — `Failed to resolve import "../src/bots/bot"`.

- [ ] **Step 3: 봇 구현**

`packages/server/src/bots/bot.ts`:
```ts
import { BOT_TARGET, SKIN_COUNT, START_SEGMENTS, TAU, TICK_HZ, WORLD_RADIUS, normAngle } from '@snake/shared';
import type { Food } from '../game/food';
import type { Snake } from '../game/snake';
import type { World } from '../game/world';

const BOT_NAMES = [
  'Viper', 'Mamba', 'Cobra', 'Python', 'Boa', 'Krait', 'Adder', 'Taipan',
  'Asp', 'Racer', 'Garter', 'Kingsnake', 'Sidewinder', 'Rattler', 'Copperhead', 'Anaconda',
];
const DECIDE_EVERY = 3;
const DECISION_DT = DECIDE_EVERY / TICK_HZ;
const EDGE_MARGIN = 600;
const PROBE_COUNT = 9;
const PROBE_SPAN = Math.PI / 2;
const FOOD_SEARCH = 500;
const BOOST_SEARCH = 300;

export interface Brain {
  wanderAngle: number;
  wanderLeft: number;
}

export interface BotDecision {
  wang: number;
  boost: boolean;
}

export class BotController {
  private readonly brains = new Map<number, Brain>();

  constructor(
    private readonly target = BOT_TARGET,
    private readonly rng: () => number = Math.random,
  ) {}

  get count(): number {
    return this.brains.size;
  }

  update(world: World, tick: number): void {
    for (const id of this.brains.keys()) if (!world.snakes.has(id)) this.brains.delete(id);
    while (this.brains.size < this.target) {
      const name = BOT_NAMES[Math.floor(this.rng() * BOT_NAMES.length)];
      const s = world.spawnSnake(name, Math.floor(this.rng() * SKIN_COUNT), true);
      this.brains.set(s.id, { wanderAngle: s.ang, wanderLeft: 0 });
    }
    for (const [id, b] of this.brains) {
      if ((id + tick) % DECIDE_EVERY !== 0) continue;
      const s = world.snakes.get(id);
      if (!s) continue;
      const d = decide(world, s, b, this.rng);
      s.setInput(d.wang, d.boost);
    }
  }
}

/** Distance along `angle` to the first body point of another snake, or `len` if the path is clear. */
function clearance(world: World, s: Snake, angle: number, len: number): number {
  const step = Math.max(10, s.radius);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  for (let d = step; d <= len; d += step) {
    const px = s.headX + ux * d;
    const py = s.headY + uy * d;
    const hit = { found: false };
    world.index.forEachNear(px, py, s.radius + world.index.maxRadius, (e) => {
      if (e.snake === s) return false;
      const limit = s.radius + e.snake.radius;
      const ex = e.x - px;
      const ey = e.y - py;
      if (ex * ex + ey * ey < limit * limit) {
        hit.found = true;
        return true;
      }
      return false;
    });
    if (hit.found) return d;
  }
  return len;
}

export function decide(world: World, s: Snake, brain: Brain, rng: () => number): BotDecision {
  const cx = s.headX - WORLD_RADIUS;
  const cy = s.headY - WORLD_RADIUS;
  if (Math.hypot(cx, cy) > WORLD_RADIUS - EDGE_MARGIN) {
    return { wang: normAngle(Math.atan2(-cy, -cx)), boost: false };
  }

  const probeLen = 150 + 2 * s.radius;
  const ahead = clearance(world, s, s.ang, probeLen);
  if (ahead < probeLen) {
    let best = s.ang;
    let bestClear = ahead;
    let bestOffset = 0;
    for (let i = 0; i < PROBE_COUNT; i++) {
      const offset = -PROBE_SPAN + (2 * PROBE_SPAN * i) / (PROBE_COUNT - 1);
      const c = clearance(world, s, s.ang + offset, probeLen);
      if (c > bestClear || (c === bestClear && Math.abs(offset) < Math.abs(bestOffset))) {
        best = s.ang + offset;
        bestClear = c;
        bestOffset = offset;
      }
    }
    return { wang: normAngle(best), boost: false };
  }

  let target: Food | null = null;
  let bestScore = 0;
  let deathValue = 0;
  for (const f of world.food.queryCircle(s.headX, s.headY, FOOD_SEARCH)) {
    const d = Math.max(1, Math.hypot(f.x - s.headX, f.y - s.headY));
    const value = f.value / d;
    if (value > bestScore) {
      bestScore = value;
      target = f;
    }
    if (f.kind === 'death' && d <= BOOST_SEARCH) deathValue += f.value;
  }
  if (target) {
    return {
      wang: normAngle(Math.atan2(target.y - s.headY, target.x - s.headX)),
      boost: deathValue >= 1 && s.sct > START_SEGMENTS + 3,
    };
  }

  brain.wanderLeft -= DECISION_DT;
  if (brain.wanderLeft <= 0) {
    brain.wanderAngle = rng() * TAU;
    brain.wanderLeft = 2 + rng() * 2;
  }
  return { wang: brain.wanderAngle, boost: false };
}
```

- [ ] **Step 4: 서버 진입점에 봇 연결**

`packages/server/src/index.ts`를 다음으로 교체:
```ts
import { BOT_TARGET } from '@snake/shared';
import { BotController } from './bots/bot';
import { startServer } from './server';

const port = Number(process.env.PORT ?? 8080);
const bots = new BotController();
const server = await startServer({ port, beforeTick: (world, tick) => bots.update(world, tick) });
// Bots spawn on the first tick, so report the target rather than the current count.
console.log(`[server] listening on ws://localhost:${server.port} (bots: ${BOT_TARGET})`);

const shutdown = (): void => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run packages/server && npx tsc -p packages/server`
Expected: 전부 PASS, 타입 오류 0. `bot survival`이 실패하면 사망 시점의 머리 위치와 결정 분기를 로그로 찍어 원인(결정 주기 0.1 s 동안의 이동, 회전 반경)을 확인한 뒤 `EDGE_MARGIN`이 아닌 결정 로직을 고친다.

- [ ] **Step 6: 커밋**

```bash
git add packages/server
git commit -m "feat(server): add bots with edge, danger, food and wander behaviors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: 클라이언트 상태 미러 + 외삽

**Files:**
- Create: `packages/client/package.json`, `packages/client/tsconfig.json`
- Create: `packages/client/src/state/mirror.ts`
- Test: `packages/client/test/mirror.test.ts`

**Interfaces:**
- Consumes: Task 2 `ServerMsg`, `LeaderEntry`; Task 3 `BodyReplica`; Task 6 `fromWireSpeed`, `fromWireFam`; Task 1 `dequantizeAngle16`, `turnToward`, `maxTurnRate`, `speedOf`, `foodId`, `foodPos`, `sectorKey`, `normAngle`, 상수
- Produces (`packages/client/src/state/mirror.ts`):
  - `interface SnakeView { id: number; name: string; skin: number; body: BodyReplica; ang: number; wang: number; boosting: boolean; fam: number; progress: number; corrX: number; corrY: number }`
  - `interface FoodView { id: number; sector: number; x: number; y: number; size: number; color: number }`
  - `class Mirror { selfId: number; snakes: Map<number, SnakeView>; foods: Map<number, FoodView>; leaderboard: { myRank: number; total: number; entries: LeaderEntry[] } | null; minimap: Uint8Array | null; death: { killerId: number; finalScore: number } | null; apply(msg: ServerMsg): void; advance(dt: number): void; headOf(s: SnakeView): Vec; tailFraction(s: SnakeView): number; selfSnake(): SnakeView | undefined; setLocalWang(angle: number): void; reset(): void }`
- 외삽 규칙(스펙 §9.1): 머리 = 마지막 커밋 점 + `progress`·방향(`ang`) + 보정 오프셋. `progress`는 `1.5·SEG_SPACING`에서 멈춘다. 이벤트 적용 순간 화면상 머리가 튀지 않도록 차이를 보정 오프셋에 넣고 0.15 s 동안 0으로 줄인다.
- 자기 뱀 예측: `setLocalWang`으로 목표각을 즉시 바꾸고, 자기 뱀에 대한 `snakeState`는 `boosting`만 반영한다(오래된 `wang`으로 되돌아가는 떨림 방지).

- [ ] **Step 1: 클라이언트 패키지 스캐폴드**

`packages/client/package.json`:
```json
{
  "name": "@snake/client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@snake/shared": "*"
  },
  "devDependencies": {
    "vite": "^5.4.10"
  }
}
```

`packages/client/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["src", "test"]
}
```

Run: `npm install`
Expected: `node_modules/vite` 존재, 오류 없음.

- [ ] **Step 2: 실패하는 미러 테스트 작성**

`packages/client/test/mirror.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  SEG_SPACING, foodId, foodPos, maxTurnRate, quantizeAngle16, sectorKey, speedOf, toWireFam,
  toWireSpeed, type ServerMsg,
} from '@snake/shared';
import { Mirror } from '../src/state/mirror';

const q0 = quantizeAngle16(0);

function addMsg(id: number, speedUnits = speedOf(3, false)): ServerMsg {
  return {
    t: 'snakeAdd', id, name: `s${id}`, skin: 1, ang: q0, wang: q0, speed: toWireSpeed(speedUnits),
    fam: toWireFam(0.25), tailX: 1000, tailY: 2000, iangs: [q0, q0],
  };
}

function headDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('snakes', () => {
  it('snakeAdd rebuilds the body and reads state', () => {
    const m = new Mirror();
    m.apply(addMsg(5));
    const s = m.snakes.get(5)!;
    expect(s.body.points).toHaveLength(3);
    expect(s.body.head.x).toBeCloseTo(1000 + 2 * SEG_SPACING, 9);
    expect(s.fam).toBeCloseTo(0.25, 4);
    expect(s.boosting).toBe(false);
    m.apply(addMsg(6, 375));
    expect(m.snakes.get(6)!.boosting).toBe(true);
  });

  it('advance extrapolates the head at the snake speed, capped at 1.5 segments', () => {
    const m = new Mirror();
    m.apply(addMsg(5));
    const s = m.snakes.get(5)!;
    m.advance(0.1);
    expect(m.headOf(s).x - s.body.head.x).toBeCloseTo(speedOf(3, false) * 0.1, 6);
    m.advance(5);
    expect(m.headOf(s).x - s.body.head.x).toBeCloseTo(1.5 * SEG_SPACING, 6);
  });

  it('advance turns toward wang no faster than maxTurnRate', () => {
    const m = new Mirror();
    m.apply(addMsg(5));
    m.apply({ t: 'snakeState', id: 5, ang: q0, wang: quantizeAngle16(Math.PI / 2), speed: toWireSpeed(speedOf(3, false)) });
    m.advance(0.05);
    expect(m.snakes.get(5)!.ang).toBeCloseTo(maxTurnRate(3, false) * 0.05, 6);
  });

  it('applying a move keeps the visual head continuous, then the correction decays', () => {
    const m = new Mirror();
    m.apply(addMsg(5));
    const s = m.snakes.get(5)!;
    m.advance(0.3);
    const before = m.headOf(s);
    m.apply({ t: 'snakeMove', id: 5, iang: quantizeAngle16(0.3) });
    expect(headDistance(before, m.headOf(s))).toBeLessThan(1e-9);
    expect(s.body.points).toHaveLength(3);
    m.advance(0.2);
    expect(Math.hypot(s.corrX, s.corrY)).toBeLessThan(1e-9);
  });

  it('grow keeps the tail and updates fam; shrink drops the tail', () => {
    const m = new Mirror();
    m.apply(addMsg(5));
    m.apply({ t: 'snakeGrow', id: 5, iang: q0, fam: toWireFam(0.1) });
    const s = m.snakes.get(5)!;
    expect(s.body.points).toHaveLength(4);
    expect(s.fam).toBeCloseTo(0.1, 4);
    m.apply({ t: 'snakeShrink', id: 5, fam: toWireFam(0.9) });
    expect(s.body.points).toHaveLength(3);
    expect(s.fam).toBeCloseTo(0.9, 4);
  });

  it('boosting snakes lose fam locally between server updates', () => {
    const m = new Mirror();
    m.apply(addMsg(5, 375));
    m.advance(0.1);
    expect(m.snakes.get(5)!.fam).toBeLessThan(0.25);
  });

  it('events for unknown snakes are ignored and snakeRemove deletes', () => {
    const m = new Mirror();
    m.apply({ t: 'snakeMove', id: 99, iang: 0 });
    m.apply(addMsg(5));
    m.apply({ t: 'snakeRemove', id: 5, reason: 0 });
    expect(m.snakes.size).toBe(0);
  });
});

describe('self prediction', () => {
  it('setLocalWang steers immediately and stale server wang does not override it', () => {
    const m = new Mirror();
    m.apply({ t: 'welcome', selfId: 5, worldRadius: 8000, sectorSize: 480, segSpacing: 42, tickHz: 30, mscps: 411, maxSegments: 300 });
    m.apply(addMsg(5));
    m.setLocalWang(1.0);
    m.apply({ t: 'snakeState', id: 5, ang: q0, wang: q0, speed: toWireSpeed(375) });
    const self = m.selfSnake()!;
    expect(self.wang).toBeCloseTo(1.0, 12);
    expect(self.boosting).toBe(true);
  });

  it('other snakes take wang from snakeState', () => {
    const m = new Mirror();
    m.apply(addMsg(7));
    m.apply({ t: 'snakeState', id: 7, ang: q0, wang: quantizeAngle16(2), speed: toWireSpeed(speedOf(3, false)) });
    expect(m.snakes.get(7)!.wang).toBeCloseTo(2, 3);
  });
});

describe('food', () => {
  it('sectorFood, foodAdd, foodEat and sectorLeave keep the food map in sync', () => {
    const m = new Mirror();
    m.apply({ t: 'sectorFood', sx: 3, sy: 4, foods: [{ rx: 10, ry: 20, size: 2, color: 1 }, { rx: 11, ry: 21, size: 3, color: 2 }] });
    m.apply({ t: 'sectorFood', sx: 5, sy: 5, foods: [{ rx: 0, ry: 0, size: 1, color: 0 }] });
    const id = foodId(3, 4, 10, 20);
    expect(m.foods.get(id)).toEqual({ id, sector: sectorKey(3, 4), ...foodPos(3, 4, 10, 20), size: 2, color: 1 });

    m.apply({ t: 'foodEat', sx: 3, sy: 4, rx: 10, ry: 20, eaterId: 1 });
    expect(m.foods.has(id)).toBe(false);
    m.apply({ t: 'foodAdd', sx: 3, sy: 4, rx: 12, ry: 22, size: 1, color: 3 });
    expect(m.foods.has(foodId(3, 4, 12, 22))).toBe(true);

    m.apply({ t: 'sectorLeave', sx: 3, sy: 4 });
    expect([...m.foods.values()].map((f) => f.sector)).toEqual([sectorKey(5, 5)]);
  });
});

describe('session messages', () => {
  it('stores leaderboard, minimap and death; welcome clears death; reset clears all', () => {
    const m = new Mirror();
    m.apply({ t: 'leaderboard', myRank: 2, total: 9, entries: [{ score: 50, name: 'x' }] });
    m.apply({ t: 'minimap', bits: new Uint8Array(512) });
    m.apply({ t: 'death', killerId: 3, finalScore: 120 });
    expect(m.leaderboard?.myRank).toBe(2);
    expect(m.minimap).not.toBeNull();
    expect(m.death).toEqual({ killerId: 3, finalScore: 120 });
    m.apply({ t: 'welcome', selfId: 8, worldRadius: 8000, sectorSize: 480, segSpacing: 42, tickHz: 30, mscps: 411, maxSegments: 300 });
    expect(m.death).toBeNull();
    expect(m.selfId).toBe(8);
    m.apply(addMsg(8));
    m.reset();
    expect(m.snakes.size).toBe(0);
    expect(m.selfId).toBe(-1);
  });

  it('tailFraction tracks progress through the current segment', () => {
    const m = new Mirror();
    m.apply(addMsg(5));
    const s = m.snakes.get(5)!;
    expect(m.tailFraction(s)).toBe(0);
    m.advance(SEG_SPACING / 2 / speedOf(3, false));
    expect(m.tailFraction(s)).toBeCloseTo(0.5, 6);
    m.advance(10);
    expect(m.tailFraction(s)).toBe(1);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run packages/client/test/mirror.test.ts`
Expected: FAIL — `Failed to resolve import "../src/state/mirror"`.

- [ ] **Step 4: 미러 구현**

`packages/client/src/state/mirror.ts`:
```ts
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
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run packages/client && npx tsc -p packages/client`
Expected: PASS, 타입 오류 0.

- [ ] **Step 6: 커밋**

```bash
git add packages/client package.json package-lock.json
git commit -m "feat(client): add server state mirror with extrapolation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: 클라이언트 앱 (연결·입력·렌더링·HUD·화면)

이 태스크의 코드는 DOM/Canvas 의존이라 단위 테스트 대신 타입 검사, 프로덕션 빌드, 실제 브라우저 검증(Step 8)으로 확인한다. 게임 로직은 Task 9 미러에 있고 이미 테스트됐다.

**Files:**
- Create: `packages/client/vite.config.ts`, `packages/client/index.html`
- Create: `packages/client/src/render/palette.ts`, `packages/client/src/net/connection.ts`, `packages/client/src/input.ts`, `packages/client/src/render/renderer.ts`, `packages/client/src/ui/hud.ts`, `packages/client/src/main.ts`

**Interfaces:**
- Consumes: Task 9 `Mirror`, `SnakeView`; Task 2 `encodeClient`, `decodeServerFrame`, `sanitizeName`, `ClientMsg`, `ServerMsg`; Task 1 `quantizeAngle8`, `dequantizeAngle8`, `bodyRadius`, `zoom`, `score`, 상수
- Produces (앱 내부):
  - `palette.ts`: `SKINS: ReadonlyArray<readonly [string, string]>` (8개, [몸통색, 줄무늬색]), `FOOD_COLORS_CSS: readonly string[]` (9개)
  - `connection.ts`: `class Connection { constructor(url: string, onMessages: (msgs: ServerMsg[]) => void, onClose: () => void); whenOpen(): Promise<void>; send(msg: ClientMsg): void; close(): void }`
  - `input.ts`: `class Input { angle: number; readonly boost: boolean; constructor(canvas: HTMLCanvasElement); update(dt: number): void }`
  - `renderer.ts`: `interface Camera { x: number; y: number; scale: number }`, `cameraScale(sct: number, width: number, height: number): number`, `class Renderer { width: number; height: number; constructor(canvas: HTMLCanvasElement); draw(m: Mirror, cam: Camera): void }`
  - `hud.ts`: `class Hud { constructor(board: HTMLOListElement, rank: HTMLElement, stats: HTMLElement, minimap: HTMLCanvasElement); update(m: Mirror): void }`
- 화면 배율: 화면 반대각선 = `1100·zoom(sct)` 월드 유닛. 서버 AOI 반경(`1100·zoom + 200`)과 맞춘 값이다(스펙 §8).
- 접속 서버 주소: `import.meta.env.VITE_WS_URL`, 없으면 `ws://<페이지 호스트>:8080`.

- [ ] **Step 1: Vite 설정과 팔레트**

`packages/client/vite.config.ts`:
```ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, host: true },
});
```

`packages/client/src/render/palette.ts`:
```ts
/** [body, stripe] per skin id. */
export const SKINS: ReadonlyArray<readonly [string, string]> = [
  ['#ff5a5f', '#ffb3b5'],
  ['#3ec1d3', '#b4ecf3'],
  ['#f6c90e', '#fff1a8'],
  ['#8fd14f', '#d6f5b8'],
  ['#a66cff', '#dcc6ff'],
  ['#ff8c42', '#ffd2b0'],
  ['#f15bb5', '#fbc4e5'],
  ['#00bbf9', '#a9e9ff'],
];

export const FOOD_COLORS_CSS: readonly string[] = [
  '#ff5a5f', '#3ec1d3', '#f6c90e', '#8fd14f', '#a66cff', '#ff8c42', '#f15bb5', '#00bbf9', '#ffffff',
];
```

- [ ] **Step 2: WebSocket 연결 래퍼**

`packages/client/src/net/connection.ts`:
```ts
import { decodeServerFrame, encodeClient, type ClientMsg, type ServerMsg } from '@snake/shared';

export class Connection {
  private readonly ws: WebSocket;

  constructor(url: string, onMessages: (msgs: ServerMsg[]) => void, onClose: () => void) {
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onmessage = (ev: MessageEvent) => {
      try {
        onMessages(decodeServerFrame(new Uint8Array(ev.data as ArrayBuffer)));
      } catch (err) {
        console.error('[client] failed to decode server frame', err);
        this.ws.close();
      }
    };
    this.ws.onclose = () => onClose();
  }

  whenOpen(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('close', () => reject(new Error('connection closed')), { once: true });
    });
  }

  send(msg: ClientMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(encodeClient(msg));
  }

  close(): void {
    this.ws.close();
  }
}
```

- [ ] **Step 3: 입력**

`packages/client/src/input.ts`:
```ts
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
```

- [ ] **Step 4: 렌더러**

`packages/client/src/render/renderer.ts`:
```ts
import { TAU, WORLD_RADIUS, bodyRadius, zoom, type Vec } from '@snake/shared';
import type { Mirror, SnakeView } from '../state/mirror';
import { FOOD_COLORS_CSS, SKINS } from './palette';

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

interface ViewRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const VIEW_UNITS = 1100;

/** Pixels per world unit so the screen half-diagonal shows 1100·zoom(sct) units (matches the server AOI). */
export function cameraScale(sct: number, width: number, height: number): number {
  return Math.hypot(width, height) / 2 / (VIEW_UNITS * zoom(sct));
}

function makeHexPattern(ctx: CanvasRenderingContext2D): CanvasPattern {
  const s = 30;
  const w = 3 * s;
  const h = Math.sqrt(3) * s;
  const tile = document.createElement('canvas');
  tile.width = w;
  tile.height = Math.round(h);
  const g = tile.getContext('2d')!;
  g.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  g.lineWidth = 2;
  const hex = (cx: number, cy: number) => {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      const x = cx + s * Math.cos(a);
      const y = cy + s * Math.sin(a);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.stroke();
  };
  hex(s, h / 2);
  hex(2.5 * s, 0);
  hex(2.5 * s, h);
  hex(-0.5 * s, 0);
  hex(-0.5 * s, h);
  return ctx.createPattern(tile, 'repeat')!;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly hexPattern: CanvasPattern;
  private dpr = 1;
  width = 0;
  height = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
    this.hexPattern = makeHexPattern(ctx);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  }

  draw(m: Mirror, cam: Camera): void {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1a0b10';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const k = this.dpr * cam.scale;
    ctx.setTransform(k, 0, 0, k, (this.dpr * this.width) / 2 - cam.x * k, (this.dpr * this.height) / 2 - cam.y * k);
    this.drawWorld();

    const halfW = this.width / 2 / cam.scale + 60;
    const halfH = this.height / 2 / cam.scale + 60;
    this.drawFoods(m, { x0: cam.x - halfW, x1: cam.x + halfW, y0: cam.y - halfH, y1: cam.y + halfH });

    const self = m.selfSnake();
    for (const s of m.snakes.values()) if (s !== self) this.drawSnake(m, s, cam.scale);
    if (self) this.drawSnake(m, self, cam.scale);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawWorld(): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(WORLD_RADIUS, WORLD_RADIUS, WORLD_RADIUS, 0, TAU);
    ctx.fillStyle = '#161c26';
    ctx.fill();
    ctx.fillStyle = this.hexPattern;
    ctx.fill();
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#ff4d5e';
    ctx.stroke();
  }

  private drawFoods(m: Mirror, v: ViewRect): void {
    const { ctx } = this;
    for (const f of m.foods.values()) {
      if (f.x < v.x0 || f.x > v.x1 || f.y < v.y0 || f.y > v.y1) continue;
      const r = 3 + f.size * 1.5;
      ctx.fillStyle = FOOD_COLORS_CSS[f.color % FOOD_COLORS_CSS.length];
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r * 2, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, TAU);
      ctx.fill();
    }
  }

  private drawSnake(m: Mirror, s: SnakeView, scale: number): void {
    const { ctx } = this;
    const pts = s.body.points;
    const r = bodyRadius(pts.length);
    const head = m.headOf(s);
    const [main, stripe] = SKINS[s.skin % SKINS.length];

    // The tail glides toward the next point unless the next commit will be a grow (fam ≥ 1).
    let tail: Vec = pts[0];
    if (pts.length > 1 && s.fam < 0.999) {
      const f = m.tailFraction(s);
      tail = { x: pts[0].x + (pts[1].x - pts[0].x) * f, y: pts[0].y + (pts[1].y - pts[0].y) * f };
    }
    const path = new Path2D();
    path.moveTo(tail.x, tail.y);
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
    path.lineTo(head.x, head.y);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (s.boosting) {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = main;
      ctx.lineWidth = 2 * r + 12;
      ctx.stroke(path);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = main;
    ctx.lineWidth = 2 * r;
    ctx.stroke(path);
    ctx.strokeStyle = stripe;
    ctx.lineWidth = r * 1.1;
    ctx.setLineDash([r * 1.2, r * 1.2]);
    ctx.stroke(path);
    ctx.setLineDash([]);

    this.drawEyes(head, s.ang, r);

    ctx.font = `${14 / scale}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText(s.name, head.x, head.y - r - 8 / scale);
  }

  private drawEyes(head: Vec, ang: number, r: number): void {
    const { ctx } = this;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    for (const side of [-1, 1]) {
      const ex = head.x + cos * r * 0.35 - sin * side * r * 0.45;
      const ey = head.y + sin * r * 0.35 + cos * side * r * 0.45;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.32, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.arc(ex + cos * r * 0.12, ey + sin * r * 0.12, r * 0.16, 0, TAU);
      ctx.fill();
    }
  }
}
```

- [ ] **Step 5: HUD (리더보드·점수·미니맵)**

`packages/client/src/ui/hud.ts`:
```ts
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
```

- [ ] **Step 6: 메인 루프와 화면 전환, HTML**

`packages/client/src/main.ts`:
```ts
import { SKIN_COUNT, START_SEGMENTS, WORLD_RADIUS, dequantizeAngle8, quantizeAngle8, sanitizeName } from '@snake/shared';
import { Input } from './input';
import { Connection } from './net/connection';
import { SKINS } from './render/palette';
import { Renderer, cameraScale, type Camera } from './render/renderer';
import { Mirror } from './state/mirror';
import { Hud } from './ui/hud';

const WS_URL: string = import.meta.env.VITE_WS_URL ?? `ws://${location.hostname}:8080`;
const STEER_INTERVAL_MS = 1000 / 30;
const NAME_KEY = 'snake.name';

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
}

const canvas = el<HTMLCanvasElement>('game');
const startScreen = el('start');
const nameInput = el<HTMLInputElement>('name');
const skinPicker = el('skins');
const deathScreen = el('death');
const finalScore = el('final-score');
const lostScreen = el('lost');

const mirror = new Mirror();
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const hud = new Hud(el<HTMLOListElement>('board'), el('rank'), el('stats'), el<HTMLCanvasElement>('minimap'));

let conn: Connection | null = null;
let skin = Math.floor(Math.random() * SKIN_COUNT);
let camera: Camera = { x: WORLD_RADIUS, y: WORLD_RADIUS, scale: 0.5 };
let lastSteer = -1;
let lastSteerAt = 0;
let lastBoost = false;
let deathShown = false;

function show(screen: HTMLElement | null): void {
  for (const s of [startScreen, deathScreen, lostScreen]) s.hidden = s !== screen;
}

function connect(): void {
  mirror.reset();
  deathShown = false;
  conn = new Connection(
    WS_URL,
    (msgs) => {
      for (const msg of msgs) mirror.apply(msg);
    },
    () => {
      conn = null;
      show(lostScreen);
    },
  );
}

function join(): void {
  const name = sanitizeName(nameInput.value);
  try {
    localStorage.setItem(NAME_KEY, nameInput.value);
  } catch {
    // Storage can be unavailable (private mode); the name is only a convenience.
  }
  const c = conn;
  if (!c) return;
  c.whenOpen()
    .then(() => {
      c.send({ t: 'join', name, skin });
      lastSteer = -1;
      lastBoost = false;
      deathShown = false;
      show(null);
    })
    .catch(() => show(lostScreen));
}

function buildSkinPicker(): void {
  SKINS.forEach(([main, stripe], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = `linear-gradient(135deg, ${main} 50%, ${stripe} 50%)`;
    b.setAttribute('aria-label', `skin ${i + 1}`);
    if (i === skin) b.classList.add('selected');
    b.addEventListener('click', () => {
      skin = i;
      for (const other of skinPicker.children) other.classList.toggle('selected', other === b);
    });
    skinPicker.append(b);
  });
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  input.update(dt);

  const self = mirror.selfSnake();
  if (self && conn) {
    const q = quantizeAngle8(input.angle);
    mirror.setLocalWang(dequantizeAngle8(q));
    if (q !== lastSteer && now - lastSteerAt >= STEER_INTERVAL_MS) {
      conn.send({ t: 'steer', angle: q });
      lastSteer = q;
      lastSteerAt = now;
    }
    if (input.boost !== lastBoost) {
      conn.send({ t: 'boost', on: input.boost });
      lastBoost = input.boost;
    }
  }

  mirror.advance(dt);
  if (mirror.death && !deathShown) {
    deathShown = true;
    finalScore.textContent = String(mirror.death.finalScore);
    show(deathScreen);
  }

  const focus = self ? mirror.headOf(self) : camera;
  const sct = self ? self.body.points.length : START_SEGMENTS;
  camera = { x: focus.x, y: focus.y, scale: cameraScale(sct, renderer.width, renderer.height) };
  renderer.draw(mirror, camera);
  hud.update(mirror);
  requestAnimationFrame(frame);
}

el('play').addEventListener('click', join);
el('again').addEventListener('click', join);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') join();
});
el('reconnect').addEventListener('click', () => {
  connect();
  show(startScreen);
});

try {
  nameInput.value = localStorage.getItem(NAME_KEY) ?? '';
} catch {
  nameInput.value = '';
}
buildSkinPicker();
connect();
show(startScreen);
requestAnimationFrame(frame);
```

`packages/client/index.html`:
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Snake</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; background: #10141c; font-family: system-ui, sans-serif; color: #e8ecf3; }
      #game { display: block; }
      .overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(8, 10, 16, 0.55); }
      .overlay[hidden] { display: none; }
      .panel { background: #1c2330; padding: 28px 32px; border-radius: 14px; min-width: 280px; text-align: center; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5); }
      .panel h1 { margin: 0 0 16px; font-size: 28px; }
      #name { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; border: 1px solid #3a4558; background: #0f141c; color: inherit; font-size: 16px; }
      #skins { display: flex; gap: 8px; justify-content: center; margin: 14px 0; flex-wrap: wrap; }
      #skins button { width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }
      #skins button.selected { border-color: #ffffff; }
      .primary { padding: 10px 28px; font-size: 16px; border: 0; border-radius: 8px; background: #4fbf73; color: #08130b; font-weight: 700; cursor: pointer; }
      #hud { position: fixed; inset: 0; pointer-events: none; }
      #leaderboard { position: absolute; top: 12px; right: 16px; width: 200px; font-size: 13px; background: rgba(0, 0, 0, 0.25); padding: 8px 12px; border-radius: 8px; }
      #leaderboard ol { margin: 4px 0; padding-left: 20px; }
      #leaderboard li span:last-child { float: right; opacity: 0.8; }
      #stats { position: absolute; left: 16px; bottom: 14px; font-size: 16px; }
      #minimap { position: absolute; right: 16px; bottom: 16px; width: 128px; height: 128px; border-radius: 50%; background: rgba(0, 0, 0, 0.35); }
    </style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <div id="hud">
      <div id="leaderboard"><strong>리더보드</strong><ol id="board"></ol><div id="rank"></div></div>
      <div id="stats"></div>
      <canvas id="minimap"></canvas>
    </div>
    <div id="start" class="overlay">
      <div class="panel">
        <h1>Snake</h1>
        <input id="name" maxlength="24" placeholder="닉네임" autocomplete="off" />
        <div id="skins"></div>
        <button id="play" class="primary" type="button">플레이</button>
      </div>
    </div>
    <div id="death" class="overlay" hidden>
      <div class="panel">
        <h1>게임 오버</h1>
        <p>최종 점수 <strong id="final-score">0</strong></p>
        <button id="again" class="primary" type="button">다시 하기</button>
      </div>
    </div>
    <div id="lost" class="overlay" hidden>
      <div class="panel">
        <h1>연결이 끊겼습니다</h1>
        <button id="reconnect" class="primary" type="button">재접속</button>
      </div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: 타입 검사와 프로덕션 빌드**

Run: `npm run typecheck`
Expected: 세 패키지 모두 오류 0.

Run: `npm run build -w @snake/client`
Expected: `packages/client/dist/` 생성, `✓ built in` 출력, 오류 0.

Run: `npm test`
Expected: 전체 PASS (클라이언트 변경이 기존 테스트를 깨지 않음).

- [ ] **Step 8: 실제 브라우저 검증**

1. `npm run dev`를 백그라운드로 실행. Expected: `[server] listening on ws://localhost:8080 (bots: 30)`와 Vite `Local: http://localhost:5173/` 출력.
2. Playwright(MCP 브라우저 도구)로 `http://localhost:5173` 열기. Expected: 시작 패널, 배경에 월드 중심의 먹이와 봇이 보인다.
3. 닉네임 `tester` 입력 → 플레이 클릭 → 3초 대기 → 스크린샷. Expected: 화면 중앙에 이름표 `tester`가 붙은 뱀, 리더보드 항목 10개, 좌하단 `점수 10` 이상, 우하단 미니맵에 점들.
4. 마우스를 화면 오른쪽 위로 옮기고 2초 뒤 스크린샷. Expected: 뱀이 그 방향으로 돌아 있다.
5. 브라우저 콘솔 메시지 확인. Expected: 오류 0건.
6. 서버를 종료한 뒤 스크린샷. Expected: "연결이 끊겼습니다" 패널.
7. 확인이 끝나면 dev 프로세스와 브라우저를 정리한다.

하나라도 기대와 다르면 superpowers:systematic-debugging으로 원인을 찾고 고친 뒤 이 단계를 처음부터 다시 수행한다.

- [ ] **Step 9: 커밋**

`dist/`는 `.gitignore`로 제외된다.

```bash
git add packages/client
git commit -m "feat(client): add canvas renderer, input, HUD and screens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: 부하 테스트 + 최종 검증

**Files:**
- Create: `scripts/loadtest.ts`, `scripts/tsconfig.json`
- Modify: `package.json` (`typecheck` 스크립트에 `scripts` 추가)

**Interfaces:**
- Consumes: Task 7 `startServer`, `GameServer.stats`; Task 8 `BotController`; Task 2 `encodeClient`, `decodeServerFrame`; Task 1 상수
- Produces: `npm run loadtest [clients=100] [seconds=60]` — 성공 기준 3(스펙 §1)을 측정해 표로 출력하고, 기준을 넘으면 종료 코드 1.
- 측정 방식: 처음 5초는 워밍업으로 제외한다. 틱 평균은 누적 평균(`avgTickMs`)과 틱 수로 측정 구간만 다시 계산한다. 수신량은 페이로드 바이트 + 프레임당 WebSocket 헤더 4바이트(보수적 추정)로 센다.

- [ ] **Step 1: 스크립트 tsconfig와 typecheck 연결**

`scripts/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["."]
}
```

루트 `package.json`의 `typecheck`를 다음으로 교체:
```json
"typecheck": "tsc -p packages/shared && tsc -p packages/server && tsc -p packages/client && tsc -p scripts",
```

- [ ] **Step 2: 부하 테스트 스크립트 작성**

`scripts/loadtest.ts`:
```ts
import { WebSocket } from 'ws';
import { BOT_TARGET, SKIN_COUNT, TAU, decodeServerFrame, encodeClient, quantizeAngle8, type ClientMsg } from '@snake/shared';
import { BotController } from '../packages/server/src/bots/bot';
import { startServer } from '../packages/server/src/server';

const CLIENTS = Number(process.argv[2] ?? 100);
const SECONDS = Number(process.argv[3] ?? 60);
const WARMUP_SECONDS = 5;
const TICK_BUDGET_MS = 10;
const BYTES_BUDGET = 10 * 1024;
const WS_HEADER_BYTES = 4;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const bots = new BotController(BOT_TARGET);
const server = await startServer({ port: 0, beforeTick: (world, tick) => bots.update(world, tick) });
const url = `ws://127.0.0.1:${server.port}`;

let measuring = false;
let bytes = 0;
let deaths = 0;
const sockets: WebSocket[] = [];
const timers: NodeJS.Timeout[] = [];

for (let i = 0; i < CLIENTS; i++) {
  const ws = new WebSocket(url);
  const send = (msg: ClientMsg) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(encodeClient(msg));
  };
  const join = () => send({ t: 'join', name: `load${i}`, skin: i % SKIN_COUNT });
  ws.on('open', join);
  ws.on('message', (data: Buffer) => {
    if (measuring) bytes += data.length + WS_HEADER_BYTES;
    for (const m of decodeServerFrame(new Uint8Array(data))) {
      if (m.t === 'death') {
        deaths++;
        join();
      }
    }
  });
  ws.on('error', (err) => console.error(`[loadtest] client ${i}:`, err.message));
  timers.push(setInterval(() => {
    send({ t: 'steer', angle: quantizeAngle8(Math.random() * TAU) });
    send({ t: 'boost', on: Math.random() < 0.1 });
  }, 500));
  sockets.push(ws);
}

await sleep(WARMUP_SECONDS * 1000);
const ticks0 = server.stats.ticks;
const avg0 = server.stats.avgTickMs;
measuring = true;
const startedAt = performance.now();
await sleep(SECONDS * 1000);
measuring = false;
const elapsed = (performance.now() - startedAt) / 1000;

const ticks1 = server.stats.ticks;
const avgTick = (server.stats.avgTickMs * ticks1 - avg0 * ticks0) / Math.max(1, ticks1 - ticks0);
const perClient = bytes / CLIENTS / elapsed;
const open = sockets.filter((s) => s.readyState === WebSocket.OPEN).length;

console.table({
  clients: CLIENTS,
  connectedAtEnd: open,
  snakes: server.world.snakes.size,
  measuredSeconds: Number(elapsed.toFixed(1)),
  ticks: ticks1 - ticks0,
  avgTickMs: Number(avgTick.toFixed(2)),
  maxTickMsAllTime: Number(server.stats.maxTickMs.toFixed(2)),
  bytesPerClientPerSec: Math.round(perClient),
  deathsAndRejoins: deaths,
});

const failures: string[] = [];
if (avgTick > TICK_BUDGET_MS) failures.push(`avg tick ${avgTick.toFixed(2)} ms > ${TICK_BUDGET_MS} ms`);
if (perClient > BYTES_BUDGET) failures.push(`per-client ${Math.round(perClient)} B/s > ${BYTES_BUDGET} B/s`);
if (open < CLIENTS) failures.push(`${CLIENTS - open} clients disconnected`);

for (const t of timers) clearInterval(t);
for (const s of sockets) s.terminate();
await server.close();

if (failures.length > 0) {
  console.error(`[loadtest] FAIL: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('[loadtest] PASS');
process.exit(0);
```

- [ ] **Step 3: 짧은 부하 테스트로 스크립트 동작 확인**

Run: `npm run loadtest -- 10 5`
Expected: 표가 출력되고 `connectedAtEnd: 10`, `[loadtest] PASS`. 스크립트 오류가 있으면 여기서 고친다.

- [ ] **Step 4: 성공 기준 측정**

Run: `npm run loadtest`
Expected: `clients 100`, `connectedAtEnd 100`, `avgTickMs ≤ 10`, `bytesPerClientPerSec ≤ 10240`, `[loadtest] PASS`.

실패하면 기준을 바꾸지 않는다. superpowers:systematic-debugging으로 원인을 찾는다. 틱이 느리면 `node --cpu-prof`로 `npx tsx scripts/loadtest.ts`를 프로파일링해 상위 함수를 확인한다(예상 후보: `SpatialIndex.rebuild`의 객체 할당, `visibleSectors`/`buildFrame`의 Set 생성). 대역폭 초과면 메시지 종류별 바이트를 세어 원인을 찾는다. 수정 후 Step 4를 다시 실행한다.

- [ ] **Step 5: 전체 검증**

Run: `npm test && npm run typecheck && npm run build -w @snake/client`
Expected: 전체 테스트 PASS, 타입 오류 0, 빌드 성공.

측정 결과(틱 평균, 클라이언트당 바이트)를 커밋 메시지 본문에 그대로 적는다.

- [ ] **Step 6: 커밋**

```bash
git add scripts package.json
git commit -m "test: add headless load test for tick time and bandwidth

<Step 4 표의 avgTickMs와 bytesPerClientPerSec 값을 여기에 기록>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## 완료 후

모든 태스크가 끝나면 superpowers:finishing-a-development-branch로 브랜치를 정리한다. 사용자 전역 지침에 따라 그 직전에 `/hookify`로 이번 작업에서 나온 실수 패턴을 훅으로 만든다.

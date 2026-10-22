# 관전 화면 `status.html` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/status.html`로 접속하면 게임 참여 없이 맵 전체의 뱀 위치·이름과 전체 순위를 볼 수 있다.

**Architecture:** 서버에 관전 전용 메시지(`spectate` → `overview`)를 추가한다. 관전 세션은 기존 시야 기반 프레임을 받지 않고, 6틱(5Hz)마다 모든 뱀의 id·스킨·이름·머리 좌표·점수가 담긴 `overview`만 받는다. 클라이언트는 별도 페이지 `status.html`에서 이를 캔버스(점+이름)와 순위 패널로 그린다.

**Tech Stack:** TypeScript(ESM), npm workspaces(`shared`/`server`/`client`), `ws`, vite, vitest, Playwright(수동 검증).

**Spec:** `docs/2026-10-16-status-page-design.md`

## Global Constraints

- 새 의존성을 추가하지 않는다.
- 와이어 포맷은 바이너리다. 모든 정수는 big-endian이고 `Writer`/`Reader`로만 읽고 쓴다.
- 기존 `buildFrame`(시야 기반 전송) 경로는 수정하지 않는다.
- 좌표는 `0..2·WORLD_RADIUS`를 `0..0xffff`(u16)로 양자화한다. 점수는 `0xffffff`(u24)로 제한한다.
- 갱신 주기는 6틱(5Hz)이고 클라이언트 보간은 없다.
- 화면 문구는 한국어다. 사용자가 입력한 이름은 `textContent`로만 DOM에 넣는다.
- 코드 스타일은 기존 코드를 따른다(작은따옴표, 2칸 들여쓰기, 세미콜론 사용).
- 테스트는 루트에서 `npm test`, 타입체크는 `npm run typecheck`로 실행한다.

## Review Focus

1. 맵 가장자리에서 float 오차로 뱀 머리가 `0` 미만이거나 `2·WORLD_RADIUS` 초과가 되면 `Writer.u16`이 `ProtocolError`를 던져 서버 틱 전체가 죽는다. 기대 동작은 좌표를 범위로 고정(clamp)하는 것이다. → Task 1 `quantizeCoord` 테스트, Task 2 `buildOverview` 테스트.
2. 월드에 뱀이 하나도 없을 때(접속자 0, 봇 0) 빈 `overview`가 인코딩·디코딩되어야 하고, 관전 화면이 깨지지 않아야 한다. → Task 1, Task 2 테스트.
3. 이미 플레이 중인 세션이 `spectate`를 보내거나 관전 세션이 `join`을 보내도 월드와 세션 상태가 바뀌지 않아야 한다. → Task 2 테스트.
4. 창이 매우 좁아 지도 영역이 여백보다 작아도 반지름이 0 이하가 되지 않아야 한다. → Task 3 테스트.
5. 이름에 `<b>x</b>` 같은 HTML이 들어 있어도 순위 패널에 글자 그대로 보여야 한다. → Task 4 수동 검증.

---

### Task 1: 프로토콜 — `spectate`와 `overview`

**Files:**
- Modify: `packages/shared/src/protocol.ts`
- Test: `packages/shared/test/protocol.test.ts`

**Interfaces:**
- Consumes: 기존 `Writer`, `Reader`, `checkUint`, `SKIN_COUNT`, `WORLD_RADIUS`(`constants.ts`).
- Produces (이후 태스크가 사용):
  - `C2S.SPECTATE = 0x05`, `ClientMsg`에 `{ t: 'spectate' }`
  - `S2C.OVERVIEW = 0x34`, `ServerMsg`에 `{ t: 'overview'; snakes: OverviewSnake[] }`
  - `interface OverviewSnake { id: number; skin: number; name: string; x: number; y: number; score: number }` — `x`, `y`는 양자화된 u16 값
  - `quantizeCoord(v: number): number` — `v`를 `0..2·WORLD_RADIUS`로 고정한 뒤 `0..65535` 정수로 변환
  - `dequantizeCoord(q: number): number` — 월드 좌표로 복원

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/shared/test/protocol.test.ts` 맨 위 import를 다음으로 바꾼다.

```ts
import { describe, expect, it } from 'vitest';
import {
  C2S, ProtocolError, S2C, WORLD_RADIUS, Writer, decodeClient, decodeServerFrame, dequantizeCoord,
  encodeClient, encodeServer, quantizeCoord, sanitizeName, type ClientMsg, type ServerMsg,
} from '../src/index';
```

`clientMsgs` 배열의 `{ t: 'ping' },` 다음 줄에 추가한다.

```ts
  { t: 'spectate' },
```

`serverMsgs` 배열의 `{ t: 'pong' },` 앞에 추가한다.

```ts
  {
    t: 'overview',
    snakes: [
      { id: 65534, skin: 7, name: '뱀왕😀', x: 0, y: 65535, score: 16777215 },
      { id: 1, skin: 0, name: '', x: 32768, y: 100, score: 0 },
    ],
  },
  { t: 'overview', snakes: [] },
```

파일 끝에 새 `describe` 블록을 추가한다.

```ts
describe('overview', () => {
  it('rejects a skin out of range', () => {
    const w = new Writer().u8(S2C.OVERVIEW).u16(1).u16(1).u8(8).str('a').u16(0).u16(0).u24(0);
    expect(() => decodeServerFrame(w.finish())).toThrow(ProtocolError);
  });

  it('rejects a truncated snake list', () => {
    const w = new Writer().u8(S2C.OVERVIEW).u16(2).u16(1).u8(0).str('a').u16(0).u16(0).u24(0);
    expect(() => decodeServerFrame(w.finish())).toThrow(ProtocolError);
  });

  it('spectate carries no payload', () => {
    expect(Array.from(encodeClient({ t: 'spectate' }))).toEqual([C2S.SPECTATE]);
    expect(() => decodeClient(Uint8Array.from([C2S.SPECTATE, 0]))).toThrow(ProtocolError);
  });

  it('quantizeCoord clamps to the world and keeps 0.25 unit precision', () => {
    expect(quantizeCoord(-50)).toBe(0);
    expect(quantizeCoord(2 * WORLD_RADIUS + 50)).toBe(0xffff);
    expect(quantizeCoord(Number.NaN)).toBe(0);
    for (const v of [0, 1, 4000.3, WORLD_RADIUS, 15999.9, 2 * WORLD_RADIUS]) {
      expect(Math.abs(dequantizeCoord(quantizeCoord(v)) - v)).toBeLessThanOrEqual(0.25);
    }
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run packages/shared/test/protocol.test.ts`
Expected: FAIL — `quantizeCoord`/`dequantizeCoord`가 아직 export되지 않아 `TypeError`, `spectate`·`overview` 왕복 테스트는 `unknown ... opcode` 또는 `undefined`로 실패. (vitest는 타입체크를 하지 않으므로 타입 오류가 아니라 런타임 실패다.)

- [ ] **Step 3: 구현**

`packages/shared/src/protocol.ts`:

1. 첫 줄 import에 `WORLD_RADIUS`를 추가한다.

```ts
import { ANIMAL_COUNT, MAX_NAME_BYTES, MINIMAP_SIZE, SKIN_COUNT, WORLD_RADIUS } from './constants';
```

2. `C2S`와 `S2C`를 바꾼다.

```ts
export const C2S = { JOIN: 0x01, STEER: 0x02, BOOST: 0x03, PING: 0x04, SPECTATE: 0x05 } as const;
```

`S2C`의 `PONG: 0x33,` 다음 줄에 추가한다.

```ts
  OVERVIEW: 0x34,
```

3. `ClientMsg`의 `| { t: 'ping' };`를 바꾼다.

```ts
  | { t: 'ping' }
  | { t: 'spectate' };
```

4. `SnakeRank` 인터페이스 아래에 추가한다.

```ts
/** One snake in the spectator overview; x/y are quantized with quantizeCoord. */
export interface OverviewSnake {
  id: number;
  skin: number;
  name: string;
  x: number;
  y: number;
  score: number;
}

const COORD_SCALE = 0xffff / (2 * WORLD_RADIUS);

/** World units → u16, clamped to the world square so float drift at the edge cannot break encoding. */
export function quantizeCoord(v: number): number {
  if (!(v > 0)) return 0;
  return Math.min(0xffff, Math.round(v * COORD_SCALE));
}

export function dequantizeCoord(q: number): number {
  return q / COORD_SCALE;
}
```

5. `ServerMsg`의 `| { t: 'pong' };`를 바꾼다.

```ts
  | { t: 'overview'; snakes: OverviewSnake[] }
  | { t: 'pong' };
```

6. `encodeClient`의 `case 'ping':` 블록 뒤에 추가한다.

```ts
    case 'spectate':
      w.u8(C2S.SPECTATE);
      break;
```

7. `decodeClient`의 `case C2S.PING:` 블록 뒤에 추가한다.

```ts
    case C2S.SPECTATE:
      msg = { t: 'spectate' };
      break;
```

8. `encodeServer`의 `case 'pong':` 앞에 추가한다.

```ts
    case 'overview':
      w.u8(S2C.OVERVIEW).u16(msg.snakes.length);
      for (const s of msg.snakes) w.u16(s.id).u8(s.skin).str(s.name).u16(s.x).u16(s.y).u24(s.score);
      break;
```

9. `decodeServerMsg`의 `case S2C.PONG:` 앞에 추가한다.

```ts
    case S2C.OVERVIEW: {
      const n = r.u16();
      const snakes: OverviewSnake[] = [];
      for (let i = 0; i < n; i++) {
        const id = r.u16();
        const skin = r.u8();
        if (skin >= SKIN_COUNT) throw new ProtocolError(`skin out of range: ${skin}`);
        snakes.push({ id, skin, name: r.str(), x: r.u16(), y: r.u16(), score: r.u24() });
      }
      return { t: 'overview', snakes };
    }
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run packages/shared/test/protocol.test.ts && npm run typecheck`
Expected: PASS (타입체크 오류 없음)

- [ ] **Step 5: 커밋**

```bash
git add packages/shared/src/protocol.ts packages/shared/test/protocol.test.ts
git commit -m "feat(shared): add spectate and overview protocol messages"
```

---

### Task 2: 서버 — 관전 세션과 `overview` 전송

**Files:**
- Create: `packages/server/src/net/overview.ts`
- Modify: `packages/server/src/net/session.ts`
- Modify: `packages/server/src/server.ts`
- Test: `packages/server/test/overview.test.ts` (신규), `packages/server/test/server.test.ts`

**Interfaces:**
- Consumes: Task 1의 `quantizeCoord`, `ClientMsg`의 `{ t: 'spectate' }`, `ServerMsg`의 `overview`. 기존 `World.leaderboard(): Snake[]`(점수 내림차순), `Snake.id/name/skin/headX/headY/score`.
- Produces:
  - `buildOverview(world: World): ServerMsg` (`t: 'overview'`, 점수 내림차순)
  - `Session.spectator: boolean` (기본 `false`)

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/server/test/overview.test.ts`를 만든다.

```ts
import { describe, expect, it } from 'vitest';
import { World } from '../src/game/world';
import { buildOverview } from '../src/net/overview';
import { seededRng } from './helpers';

describe('buildOverview', () => {
  it('is an empty list for a world without snakes', () => {
    const world = new World(seededRng(1), 0);
    expect(buildOverview(world)).toEqual({ t: 'overview', snakes: [] });
  });

  it('lists every snake sorted by score, descending', () => {
    const world = new World(seededRng(2), 0);
    world.spawnSnake('a', 1, false);
    world.spawnSnake('b', 2, true);
    world.spawnSnake('c', 3, false);
    const msg = buildOverview(world);
    if (msg.t !== 'overview') throw new Error('wrong message');
    expect(msg.snakes.map((s) => s.name).sort()).toEqual(['a', 'b', 'c']);
    for (let i = 1; i < msg.snakes.length; i++) {
      expect(msg.snakes[i - 1]!.score).toBeGreaterThanOrEqual(msg.snakes[i]!.score);
    }
  });

  it('clamps heads that drift outside the world square instead of producing out-of-range values', () => {
    const world = new World(seededRng(3), 0);
    const s = world.spawnSnake('edge', 0, false);
    s.headX = -40;
    s.headY = 16050;
    const msg = buildOverview(world);
    if (msg.t !== 'overview') throw new Error('wrong message');
    expect(msg.snakes[0]).toMatchObject({ id: s.id, skin: 0, name: 'edge', x: 0, y: 0xffff });
  });
});
```

`packages/server/test/server.test.ts` 끝의 마지막 `});` 앞(즉 `game server` describe 안, `records tick statistics` 테스트 다음)에 추가한다.

```ts

  it('spectator gets overview of all snakes without a snake of its own or view frames', async () => {
    const srv = await boot();
    const player = await connect(srv.port);
    player.send({ t: 'join', name: 'alpha', skin: 3, animal: 0 });
    await waitFor(() => welcomeOf(player) !== null);

    const spec = await connect(srv.port);
    spec.send({ t: 'spectate' });
    await waitFor(() => spec.msgs.some((m) => m.t === 'overview'));

    const ov = spec.msgs.find((m) => m.t === 'overview');
    if (!ov || ov.t !== 'overview') throw new Error('no overview');
    expect(ov.snakes.map((s) => s.name)).toEqual(['alpha']);
    expect(srv.world.snakes.size).toBe(1);

    spec.send({ t: 'ping' });
    await waitFor(() => spec.msgs.some((m) => m.t === 'pong'));
    const kinds = new Set(spec.msgs.map((m) => m.t));
    for (const t of ['welcome', 'snakeAdd', 'sectorFood', 'leaderboard', 'minimap'] as const) {
      expect(kinds.has(t)).toBe(false);
    }
  });

  it('a playing session cannot become a spectator and a spectator cannot join', async () => {
    const srv = await boot();
    const player = await connect(srv.port);
    player.send({ t: 'join', name: 'p', skin: 0, animal: 0 });
    await waitFor(() => welcomeOf(player) !== null);
    player.send({ t: 'spectate' });
    player.send({ t: 'ping' });
    await waitFor(() => player.msgs.some((m) => m.t === 'pong'));
    expect([...srv.sessions].some((s) => s.spectator)).toBe(false);

    const spec = await connect(srv.port);
    spec.send({ t: 'spectate' });
    spec.send({ t: 'join', name: 'sneaky', skin: 0, animal: 0 });
    spec.send({ t: 'ping' });
    await waitFor(() => spec.msgs.some((m) => m.t === 'pong'));
    expect(welcomeOf(spec)).toBeNull();
    expect(srv.world.snakes.size).toBe(1);
  });

  it('keeps the world running when a spectator disconnects', async () => {
    const srv = await boot();
    const spec = await connect(srv.port);
    spec.send({ t: 'spectate' });
    await waitFor(() => spec.msgs.some((m) => m.t === 'overview'));
    spec.ws.terminate();
    await waitFor(() => srv.sessions.size === 0);
    const ticks = srv.stats.ticks;
    await waitFor(() => srv.stats.ticks > ticks + 3);
  });
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run packages/server/test/overview.test.ts packages/server/test/server.test.ts`
Expected: FAIL — `../src/net/overview` 모듈이 없음, `spectator` 속성이 없음.

- [ ] **Step 3: 구현**

`packages/server/src/net/overview.ts`를 만든다.

```ts
import { quantizeCoord, type ServerMsg } from '@snake/shared';
import type { World } from '../game/world';

const MAX_U24 = 0xffffff;

/** Every snake in the world (players and bots), best score first, for spectator screens. */
export function buildOverview(world: World): ServerMsg {
  return {
    t: 'overview',
    snakes: world.leaderboard().map((s) => ({
      id: s.id,
      skin: s.skin,
      name: s.name,
      x: quantizeCoord(s.headX),
      y: quantizeCoord(s.headY),
      score: Math.min(s.score, MAX_U24),
    })),
  };
}
```

`packages/server/src/net/session.ts`: `readonly view` 줄 바로 아래에 추가한다.

```ts
  /** Watches the whole world through overview messages; never owns a snake. */
  spectator = false;
```

`packages/server/src/server.ts`:

1. import에 추가한다.

```ts
import { buildOverview } from './net/overview';
```

(`import { buildFrame, buildMinimap } from './net/interest';` 바로 아래)

2. 상수를 추가한다(`const POLICY_VIOLATION = 1008;` 아래).

```ts
const OVERVIEW_EVERY_TICKS = 6; // 5 Hz at 30 Hz ticks
```

3. `handle`의 `case 'join':` 첫 줄 `if (own) return;`을 바꾸고, `case 'ping':` 앞에 `spectate` 케이스를 추가한다.

```ts
      case 'join': {
        if (own || session.spectator) return;
```

```ts
      case 'spectate':
        if (own) return;
        session.spectator = true;
        return;
```

4. `tick`에서 `const deaths = ...` 줄 아래에 추가한다.

```ts
    let overview: Uint8Array | undefined;
    if (stats.ticks % OVERVIEW_EVERY_TICKS === 0) {
      for (const s of sessions) {
        if (s.spectator) {
          overview = single(buildOverview(world));
          break;
        }
      }
    }
```

5. 세션 루프에서 하드 한도 검사(`continue;` 뒤 `}`) 바로 다음, `const light = ...` 앞에 추가한다.

```ts
      if (session.spectator) {
        if (overview && buffered <= SOFT_BUFFER_LIMIT) send(session, overview);
        continue;
      }
```

- [ ] **Step 4: 통과 확인**

Run: `npm test && npm run typecheck`
Expected: PASS (전체 테스트와 타입체크)

- [ ] **Step 5: 커밋**

```bash
git add packages/server/src/net/overview.ts packages/server/src/net/session.ts packages/server/src/server.ts packages/server/test/overview.test.ts packages/server/test/server.test.ts
git commit -m "feat(server): stream a 5Hz world overview to spectator sessions"
```

---

### Task 3: 클라이언트 — 월드↔화면 좌표 변환

**Files:**
- Create: `packages/client/src/ui/overview-layout.ts`
- Test: `packages/client/test/overview-layout.test.ts`

**Interfaces:**
- Consumes: `WORLD_RADIUS`(`@snake/shared`).
- Produces (Task 4가 사용):
  - `interface MapLayout { cx: number; cy: number; radius: number; scale: number }` — `cx`, `cy`는 월드 원 중심의 화면 좌표(px), `radius`는 월드 원의 화면 반지름(px), `scale`은 월드 1유닛당 px
  - `fitWorld(width: number, height: number, margin: number): MapLayout` — `width × height` 영역 중앙에 월드 원을 맞춘다. `radius`는 최소 1이다.
  - `worldToScreen(layout: MapLayout, x: number, y: number): { x: number; y: number }`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/client/test/overview-layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { WORLD_RADIUS } from '@snake/shared';
import { fitWorld, worldToScreen } from '../src/ui/overview-layout';

describe('overview layout', () => {
  it('centers the world circle in a non-square area using the shorter side', () => {
    const l = fitWorld(800, 400, 20);
    expect(l.cx).toBe(400);
    expect(l.cy).toBe(200);
    expect(l.radius).toBe(180);
    expect(l.scale).toBeCloseTo(180 / WORLD_RADIUS);
  });

  it('maps the world center to the circle center and the edge to the circle edge', () => {
    const l = fitWorld(600, 600, 0);
    expect(worldToScreen(l, WORLD_RADIUS, WORLD_RADIUS)).toEqual({ x: 300, y: 300 });
    const east = worldToScreen(l, 2 * WORLD_RADIUS, WORLD_RADIUS);
    expect(east.x).toBeCloseTo(600);
    expect(east.y).toBeCloseTo(300);
    const north = worldToScreen(l, WORLD_RADIUS, 0);
    expect(north.x).toBeCloseTo(300);
    expect(north.y).toBeCloseTo(0);
  });

  it('never produces a non-positive radius when the area is smaller than the margin', () => {
    const l = fitWorld(100, 100, 80);
    expect(l.radius).toBe(1);
    expect(l.scale).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run packages/client/test/overview-layout.test.ts`
Expected: FAIL — 모듈 `../src/ui/overview-layout`을 찾을 수 없음.

- [ ] **Step 3: 구현**

`packages/client/src/ui/overview-layout.ts`:

```ts
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
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run packages/client/test/overview-layout.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add packages/client/src/ui/overview-layout.ts packages/client/test/overview-layout.test.ts
git commit -m "feat(client): add world-to-screen layout for the overview map"
```

---

### Task 4: 클라이언트 — `status.html` 페이지와 빌드 설정

**Files:**
- Create: `packages/client/status.html`
- Create: `packages/client/src/status.ts`
- Modify: `packages/client/vite.config.ts`
- Test: `packages/client/test/status-html.test.ts`

**Interfaces:**
- Consumes: Task 1의 `OverviewSnake`, `dequantizeCoord`, `{ t: 'spectate' }`, `{ t: 'overview' }`. Task 3의 `fitWorld`, `worldToScreen`. 기존 `Connection`(`src/net/connection.ts`), `SKINS`(`src/render/palette.ts`).
- Produces: 없음(최종 사용자용 페이지).

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/client/test/status-html.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf-8');

describe('client status.html', () => {
  it('has the map canvas, the ranking list and the connection-lost banner', () => {
    const html = read('status.html');
    expect(html).toMatch(/<canvas\s+id="map"/);
    expect(html).toMatch(/<ol\s+id="board"/);
    expect(html).toMatch(/id="lost"/);
  });

  it('loads only its own entry script, not the game client', () => {
    const html = read('status.html');
    expect(html).toMatch(/<script\s+type="module"\s+src="\/src\/status\.ts"/);
    expect(html).not.toMatch(/src\/main\.ts/);
  });

  it('is a production build entry next to index.html', () => {
    const config = read('vite.config.ts');
    expect(config).toContain('index.html');
    expect(config).toContain('status.html');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run packages/client/test/status-html.test.ts`
Expected: FAIL — `status.html` 파일이 없어 `ENOENT`.

- [ ] **Step 3: 구현**

`packages/client/status.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Snake 현황</title>
    <link rel="icon" href="data:," />
    <style>
      :root { --panel-w: 240px; }
      @media (max-width: 600px) { :root { --panel-w: 160px; } }
      html, body { margin: 0; height: 100%; overflow: hidden; background: #10141c; font-family: system-ui, sans-serif; color: #e8ecf3; }
      #map { position: fixed; left: 0; top: 0; bottom: 0; right: var(--panel-w); width: calc(100% - var(--panel-w)); height: 100%; }
      #panel { position: fixed; top: 0; right: 0; bottom: 0; width: var(--panel-w); box-sizing: border-box; padding: 12px 14px; overflow-y: auto; background: rgba(0, 0, 0, 0.3); font-size: 13px; }
      #panel h1 { margin: 0 0 8px; font-size: 16px; }
      #board { margin: 0; padding-left: 28px; }
      #board li { padding: 2px 0; }
      #board li .score { float: right; opacity: 0.8; }
      #board li .name { overflow-wrap: anywhere; }
      #lost { position: fixed; left: 12px; top: 12px; padding: 6px 12px; border-radius: 8px; background: #b3412f; font-size: 14px; }
      #lost[hidden] { display: none; }
    </style>
  </head>
  <body>
    <canvas id="map"></canvas>
    <aside id="panel">
      <h1>순위</h1>
      <ol id="board"></ol>
    </aside>
    <div id="lost" hidden>연결 끊김 — 재접속 중…</div>
    <script type="module" src="/src/status.ts"></script>
  </body>
</html>
```

`packages/client/src/status.ts`:

```ts
import { dequantizeCoord, type OverviewSnake } from '@snake/shared';
import { Connection } from './net/connection';
import { SKINS } from './render/palette';
import { fitWorld, worldToScreen } from './ui/overview-layout';

const WS_URL: string = import.meta.env.VITE_WS_URL ?? `ws://${location.hostname}:8080`;
const RECONNECT_MS = 2000;
const MAP_MARGIN = 24;
const DOT_RADIUS = 5;

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
}

const canvas = el<HTMLCanvasElement>('map');
const board = el('board');
const lost = el('lost');
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2d canvas unavailable');

let snakes: OverviewSnake[] = [];

function drawMap(c: CanvasRenderingContext2D): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);

  const layout = fitWorld(w, h, MAP_MARGIN);
  c.beginPath();
  c.arc(layout.cx, layout.cy, layout.radius, 0, Math.PI * 2);
  c.fillStyle = '#151b26';
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = '#3a4558';
  c.stroke();

  c.font = '11px system-ui, sans-serif';
  c.textBaseline = 'middle';
  for (const s of snakes) {
    const p = worldToScreen(layout, dequantizeCoord(s.x), dequantizeCoord(s.y));
    c.beginPath();
    c.arc(p.x, p.y, DOT_RADIUS, 0, Math.PI * 2);
    c.fillStyle = SKINS[s.skin]?.[0] ?? '#ffffff';
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = '#ffffff';
    c.stroke();
    c.fillStyle = '#e8ecf3';
    c.fillText(s.name, p.x + DOT_RADIUS + 3, p.y);
  }
}

function drawBoard(): void {
  board.replaceChildren(
    ...snakes.map((s) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = s.name;
      const score = document.createElement('span');
      score.className = 'score';
      score.textContent = String(s.score);
      li.append(score, name);
      return li;
    }),
  );
}

function render(): void {
  drawMap(ctx);
  drawBoard();
}

function connect(): void {
  const conn = new Connection(
    WS_URL,
    (msgs) => {
      for (const msg of msgs) {
        if (msg.t !== 'overview') continue;
        snakes = msg.snakes;
        lost.hidden = true;
        render();
      }
    },
    () => {
      lost.hidden = false;
      setTimeout(connect, RECONNECT_MS);
    },
  );
  conn.whenOpen().then(() => conn.send({ t: 'spectate' })).catch(() => {});
}

window.addEventListener('resize', () => drawMap(ctx));
render();
connect();
```

`packages/client/vite.config.ts` 전체를 다음으로 바꾼다.

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, host: true },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        status: fileURLToPath(new URL('./status.html', import.meta.url)),
      },
    },
  },
});
```

- [ ] **Step 4: 자동 검증**

Run: `npm test && npm run typecheck && npm run build -w @snake/client`
Expected: 테스트·타입체크 통과. 빌드 후 `ls packages/client/dist`에 `index.html`과 `status.html`이 모두 있다.

`git check-ignore packages/client/dist`가 경로를 출력하지 않으면(무시되지 않음) `git status`에 `dist/`가 보이므로 `rm -rf packages/client/dist`로 지운다.

- [ ] **Step 5: 수동 검증 (실제 서버 + 브라우저)**

1. `npm run dev`를 백그라운드로 실행한다(서버 8080, 클라이언트 5173).
2. Playwright로 페이지 두 개를 연다.
   - 게임 페이지 `http://localhost:5173/`: 닉네임 입력란에 `<b>x</b>`를 넣고 `#play`를 클릭한다.
   - 관전 페이지 `http://localhost:5173/status.html`.
3. 확인할 것:
   - 관전 페이지 캔버스에 월드 원, 봇(약 30마리)과 `<b>x</b>` 뱀의 색 점·이름이 보인다.
   - 오른쪽 패널에 전체 순위가 점수 내림차순으로 나오고, `<b>x</b>`가 굵은 글씨가 아니라 글자 그대로 보인다(`#board li` 텍스트가 `<b>x</b>`).
   - 게임 페이지의 닉네임/스킨 화면이나 게임 캔버스가 관전 페이지에 없다.
   - 스크린샷(`/tmp/status.png`)을 눈으로 확인한다.
4. 서버를 껐다 켜서 "연결 끊김" 배너가 뜨고 재접속 후 사라지는지 본다.
5. 개발 서버와 서버 프로세스를 종료하고 임시 파일을 지운다.

- [ ] **Step 6: 커밋**

```bash
git add packages/client/status.html packages/client/src/status.ts packages/client/vite.config.ts packages/client/test/status-html.test.ts
git commit -m "feat(client): add status.html spectator page with world map and full ranking"
```

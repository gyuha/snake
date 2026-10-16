# 관전(중계) 화면 `status.html` 설계

## 목적

`/status.html`로 접속하면 게임에 참여하지 않고 월드 전체를 한 화면에서 볼 수 있다. 맵 전체, 각 뱀의 위치와 이름, 전체 순위 리더보드를 보여준다.

## 결정 사항

| 항목 | 결정 |
|------|------|
| URL | `/status.html` (별도 HTML 페이지) |
| 표시 | 머리 점(스킨 색) + 이름만. 몸통과 먹이는 그리지 않는다 |
| 리더보드 | 전체 순위 (상위 10명 제한 없음) |
| 갱신 주기 | 5Hz (6틱마다), 클라이언트 보간 없음 |
| 접근 제한 | 없음 (URL을 아는 사람은 누구나 관전) |
| 봇 | 일반 뱀과 동일하게 표시 |

## 접근법

기존 시야 기반 전송(`buildFrame`)은 플레이어 주변 섹터만 보낸다. 관전자에게 맵 전체를 같은 방식으로 보내면 먹이와 뱀 전체를 매 틱 보내야 해서 대역폭이 크다. 그래서 관전 전용 메시지를 새로 만든다. 서버가 모든 뱀의 id·이름·색·머리 좌표·점수를 5Hz로 보내고, 기존 전송 경로는 건드리지 않는다.

```
관전자 접속 → spectate 전송 → 서버가 spectator 플래그 설정
                                  ↓ 6틱마다
                       overview(전체 뱀, 점수 내림차순) 전송
```

## 1. 프로토콜 (`packages/shared/src/protocol.ts`)

- `C2S.SPECTATE = 0x05`, `ClientMsg`에 `{ t: 'spectate' }` 추가. 페이로드 없음.
- `S2C.OVERVIEW = 0x34`, `ServerMsg`에 `{ t: 'overview'; snakes: OverviewSnake[] }` 추가.
- `OverviewSnake`: `id`(u16), `skin`(u8), `name`(str), `x`(u16), `y`(u16), `score`(u24). 배열은 점수 내림차순이며 순위는 배열 순서로 정해진다.
- 개수는 u16으로 인코딩한다. 좌표는 `0..2·WORLD_RADIUS`를 `0..0xffff`로 양자화한다(정밀도 약 0.25 유닛). 점수는 기존 리더보드처럼 `0xffffff`로 제한한다.
- 클라이언트 → 서버 `maxPayload`(1024)와 메시지 속도 제한(`Session.admit`)은 그대로 쓴다.

## 2. 서버 (`server.ts`, `session.ts`)

- `Session`에 `spectator: boolean`(기본 `false`)을 추가한다.
- `handle`: `spectate`를 받으면 `spectator = true`. 이미 뱀이 있는 세션의 `spectate`와 `spectator` 세션의 `join`은 무시한다.
- `tick`: `spectator` 세션은 `buildFrame`을 호출하지 않는다. `stats.ticks % 6 === 0`일 때 `world.leaderboard()` 결과로 `overview`를 한 번 인코딩해 모든 관전 세션에 보낸다.
- 기존 버퍼 보호를 같은 방식으로 적용한다. `HARD_BUFFER_LIMIT` 초과 시 끊고, `SOFT_BUFFER_LIMIT` 초과 시 이번 `overview`는 건너뛴다.
- 관전자가 접속하거나 끊어도 월드에는 영향이 없다. 뱀을 만들지도, `killSnake`를 호출하지도 않는다. 기존 `close` 핸들러는 `session.view.snake`가 없으면 아무것도 하지 않으므로 그대로 쓴다.
- `overview`의 대상은 `world.snakes` 전체다(플레이어와 봇 모두).

## 3. 클라이언트

### 파일

- `packages/client/status.html`: 캔버스(`#map`), 순위 패널(`#board`), 연결 끊김 표시(`#lost`).
- `packages/client/src/status.ts`: 연결, 렌더 루프, 패널 갱신.
- `packages/client/src/ui/overview-layout.ts`: 월드 좌표 → 화면 좌표 변환 순수 함수.
- `packages/client/vite.config.ts`: `build.rollupOptions.input`에 `index.html`과 `status.html`을 둔다.

### 동작

- 캔버스가 창 전체를 채운다. 월드 원(반지름 8000)을 창 크기에 맞춰 중앙에 그린다. 순위 패널이 오른쪽을 가리므로 원은 패널을 뺀 영역에 맞춘다.
- 뱀마다 스킨 색 점과 이름을 그린다. 이름이 겹치는 것은 처리하지 않는다.
- 순위 패널은 순위, 이름, 점수를 `overview` 배열 순서대로 보여준다. 길면 스크롤한다.
- 서버 연결은 기존 `Connection` 클래스를 재사용한다. 연결되면 `spectate`를 보내고, 끊기면 "연결 끊김"을 표시한 뒤 2초마다 재접속한다.
- 게임 화면의 입력 처리, 닉네임/스킨 선택, 터치 컨트롤은 로드하지 않는다.
- `status.html`은 사용자 입력이 없다. PC·모바일 모두 같은 레이아웃이며, 좁은 화면에서는 패널을 줄인다.

## 4. 테스트와 검증

1. 프로토콜: `spectate`와 `overview` 인코딩·디코딩 왕복, 범위를 벗어난 값 거부.
2. 서버: 관전자가 `overview`를 받는다. 접속 전후 `world.snakes.size`가 같다. 관전자가 시야 프레임(`snakeAdd` 등)을 받지 않는다. 뱀이 있는 세션이 `spectate`를 보내도 무시된다.
3. 클라이언트: `overview-layout`의 좌표 변환(중심, 가장자리, 비정방형 창)과 `status.html`에 필요한 요소가 있는지 확인.
4. 수동 검증: `npm run dev`로 서버와 클라이언트를 띄우고, Playwright로 `/status.html` 스크린샷을 찍어 점·이름·순위 패널을 확인한다. 게임 탭을 하나 열어 두고 그 뱀이 관전 화면에 나타나는지도 본다.

## 범위 밖

- 몸통·먹이 표시, 뱀 선택·추적 확대, 이름 겹침 회피, 접근 제한, 보간.

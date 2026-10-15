<!-- forge-slug: animal-head-tail-skins -->
<!-- task: 13 -->
<!-- tdd: on -->
# 동물 머리·꼬리 스킨 추가

## 목표 / 비목표
- 목표: 기존 색상 스킨 8종은 그대로 두고, 별도 선택 축 "동물"(기본·강아지·고양이·뱀·팬더·토끼 6종)을 추가한다. 동물은 뱀의 머리와 꼬리 모양만 바꾸고, 몸통(스플라인, 줄무늬, 부스트 광륜, 이름표)은 지금 그대로다. 동물 선택은 와이어(`join`, `snakeAdd`)로 전달되어 다른 플레이어에게도 보인다.
- 비목표: 동물 선택의 `localStorage` 저장, 몸통 질감·무늬 변경, 동물별 사운드·능력 차이, codex-image 이미지 에셋(머리·꼬리는 Canvas 벡터 코드로 그린다), 7번째 이상 동물 추가, 기존 `ordinal`(순위 표시) 작업.
- 선행 조건: 작업 트리가 클린일 것. 현재 미커밋인 `ordinal` 작업(`leaderboard.ranks`, `renderer.ts` 서수 표시 등 7개 파일)을 실행 전에 별도 커밋으로 정리한다. 이 계획이 같은 파일(`protocol.ts`, `interest.ts`, `mirror.ts`, `renderer.ts`와 테스트)을 건드리므로 섞이지 않게 하기 위함이다.

## 결정 사항
- 동물은 스킨과 독립된 두 번째 축이다(색상 8 × 동물 6). 와이어에는 별도 필드 `animal: u8`을 `join`과 `snakeAdd`에 추가한다. `skin`의 의미와 먹이 색 규칙(`skin % 9`)은 바꾸지 않는다.
- 머리·꼬리는 Canvas 벡터 코드로 그린다. 동물마다 `drawHead(ctx, r, ang)`와 `drawTail(ctx, r, ang)`를 두고, 꼬리 각도는 꼬리 끝에서 다음 점으로 향하는 방향에서 얻는다.
- 시작 화면은 "두 줄 + 미리보기": 미리보기 뱀 캔버스, 동물 버튼 6개 한 줄, 기존 색상 스와치 8개 한 줄.
- 처음 선택값은 동물도 색상처럼 무작위이고, 봇도 무작위(기본 포함)다. 저장하지 않는다.
- 시안(브라우저로 확인한 방향): 강아지=양옆 늘어진 갈색 귀+코, 고양이=뾰족한 귀+수염+가늘고 긴 꼬리, 뱀=삼각형 머리+갈라진 혀+뾰족한 꼬리, 팬더=흰 머리+검은 귀·눈 반점+흰 꼬리 방울, 토끼=길게 뒤로 눕힌 귀+분홍 코+하얀 솜꼬리, 기본=지금 모습.

## 근거 자료 (Source of truth)
- 용어: `.forge/branch/feature/snake-clone/CONTEXT.md`의 스킨 (Skin), 동물 (Animal), 기본 (Default animal)
- 관련 ADR: 없음
- 완료 정의(DoD):
  1. `npm test`가 전부 통과하고 새 테스트가 포함된다. S1~S4의 새 테스트는 구현 전에 실패하는 것(red)을 먼저 확인한 뒤 구현 후 통과(green)시킨다. 사전 상태: 141개 통과 (회귀 방지로서 이미 통과).
  2. `npm run typecheck`가 통과한다. 사전 상태: 이미 통과 (회귀 방지로서 이미 통과).
  3. `grep -rli "animal" packages/*/src`가 다음 파일을 모두 포함한다: `shared/src/constants.ts`, `shared/src/protocol.ts`, `server/src/game/snake.ts`, `server/src/game/world.ts`, `server/src/server.ts`, `server/src/net/interest.ts`, `server/src/bots/bot.ts`, `client/src/state/mirror.ts`, `client/src/render/animals.ts`, `client/src/render/renderer.ts`, `client/src/main.ts`. 사전 상태: 0개 (정방향 검사이므로 실행 전 실패가 정상).
  4. UAT: `npm run dev`로 띄워서 6종 동물이 머리와 꼬리만으로 서로 구분되고 몸통과 어울리는지, 시작 화면 미리보기가 선택과 일치하는지 사람이 눈으로 확인한다. 자동 테스트로 판정할 수 없는 모양 평가라서 자동 검사로 대체하지 않는다.
  - 완료 기준이 자동화될 수 없는 부분(그림의 모양)에 대해 회귀 검사를 영구 테스트로 남길 수 없다는 한 줄 사유: 4번은 시각 판단이다.

## 작업 슬라이스
- [ ] S1. 공유 계층: `constants.ts`에 `ANIMAL_COUNT = 6`과 동물 ID 목록을 추가하고, `protocol.ts`의 `join`, `snakeAdd`에 `animal: u8`을 넣는다. 디코딩에서 `animal >= ANIMAL_COUNT`는 `ProtocolError`로 거부한다. — 완료 기준: `protocol.test.ts`의 `join`·`snakeAdd` 왕복 테스트와 범위 초과 거부 테스트가 통과한다.
- [ ] S2. 서버: `Snake`에 `readonly animal`을 두고 `spawnSnake`, `server.ts`의 `join` 처리, `interest.ts`의 `snakeAddMsg`로 전달한다. 봇은 동물을 무작위로 뽑는다. — 완료 기준: `interest.test.ts`에서 `snakeAdd`에 `animal`이 실린다. 봇 스폰 테스트에서 `animal`이 `0..ANIMAL_COUNT-1` 범위에 든다. (depends: S1)
- [ ] S3. 클라이언트 상태: `mirror.ts`의 `SnakeView`에 `animal`을 반영한다. — 완료 기준: `mirror.test.ts`에서 `snakeAdd`를 적용하면 해당 뱀의 `animal`이 보인다. (depends: S1)
- [ ] S4. 머리와 꼬리 그리기: 새 `render/animals.ts`에 동물 6종의 `drawHead`, `drawTail`을 만들고 `renderer.ts`의 `drawSnake`가 `s.animal`로 호출하게 한다. 몸통, 광륜, 이름표, 눈(해당 동물에 눈이 있는 경우)은 유지한다. — 완료 기준: 6종 모두 함수가 존재하고 목 컨텍스트로 호출해도 예외가 없다. 같은 `r`과 각도에서 6종이 서로 다른 그리기 호출 열을 만든다. (depends: S3)
- [ ] S5. 선택 UI: `index.html`에 동물 버튼 줄과 미리보기 캔버스를 넣고 `main.ts`에 선택 로직을 둔다. 처음 값은 무작위이고 `join`에 `animal`을 실어 보낸다. 미리보기는 S4의 그리기 함수를 그대로 쓴다. — 완료 기준: 버튼 클릭이 `join` 메시지의 `animal`을 바꾼다. 동물 버튼 6개와 색상 스와치 8개가 모두 렌더된다. (depends: S2, S4)

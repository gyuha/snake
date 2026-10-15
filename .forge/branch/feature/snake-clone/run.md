# 실행 기록 — 동물 머리·꼬리 스킨 추가

slug: animal-head-tail-skins
실행 방식: 워크플로우 없이 메인 세션에서 직접 실행 (변경이 직렬 의존이고 규모가 작아 서브에이전트 비용이 더 컸음). TDD on: S1~S5 모두 실패하는 테스트를 먼저 만들고 구현.

## 슬라이스별 결과
- S1 공유 계층(`ANIMALS`/`ANIMAL_COUNT`, `join`·`snakeAdd`의 `animal: u8`, 범위 초과 거부) — ✅ as planned
- S2 서버(`Snake.animal`, `spawnSnake`, `join` 처리, `snakeAddMsg`, 봇 무작위) — ⚠ `Snake` 생성자와 `spawnSnake`에 `animal`을 끝쪽 선택 인자(기본 0)로 추가 (기존 테스트 호출 40여 곳 보존)
- S3 클라이언트 상태(`SnakeView.animal`) — ✅ as planned
- S4 머리·꼬리 그리기(`render/animals.ts`, `drawSnake` 연동) — ⚠ 눈 그리기를 `Renderer`의 private 메서드에서 `animals.ts`의 `drawEyes`로 옮김 (미리보기와 공유하려고). 눈은 모든 동물에 공통으로 유지
- S5 선택 UI(미리보기 캔버스 + 동물 버튼 6개 + 기존 색상 스와치, `join`에 `animal`) — ⚠ 새 파일 `ui/preview.ts` 추가. 버튼 클릭 → `join.animal` 연결은 DOM 환경이 없어 단위 테스트가 아니라 브라우저로 확인함

## 선행 조건
- `ordinal` 미커밋 변경은 실행 전에 별도 커밋(`ee63db0`)으로 정리 (npm test 141개, typecheck 통과 확인 후).

## DoD baseline → after
1. `npm test`: 141 통과 → 155 통과 (새 테스트 14개; 회귀 방지로서 baseline부터 통과). 새 테스트는 구현 전 6개 실패(red) 확인 후 통과(green); `animals.test.ts`는 모듈 부재로, `index-html.test.ts` 신규 케이스는 실패 확인 후 통과
2. `npm run typecheck`: 통과 → 통과 (회귀 방지로서 baseline부터 통과; 중간에 `main.ts`의 `join` 누락 오류가 나왔다가 S5에서 해소)
3. `grep -rli animal packages/*/src` 대상 11개 파일: 0개 → 11개 모두 포함 (+ `ui/preview.ts`)
4. UAT(시각 확인): 에이전트가 브라우저로 선택 UI, 미리보기, 인게임(팬더) 렌더를 확인했고 클릭 → 미리보기 변경, 입장까지 정상. 6종의 모양 평가는 사람 확인 대기

## 발견 사항 / 메모
- 포트 8080에 이전 세션의 서버(`tsx watch`)가 구버전 코드로 떠 있었음. `join`에 `animal` 바이트가 추가되어 구버전 서버는 새 클라이언트의 `join`을 거부함. 확인용으로는 `PORT=8090` 서버와 `VITE_WS_URL`을 지정한 별도 vite(5190)를 띄웠다가 모두 종료함. 8080의 기존 서버는 건드리지 않음
- 코드 리뷰 단계(§3)는 위험 영역이 와이어 프로토콜 하나이고 서버와 클라이언트 왕복 테스트가 있어 생략

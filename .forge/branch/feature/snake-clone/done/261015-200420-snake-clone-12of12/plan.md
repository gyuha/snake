<!-- forge-slug: snake-clone-12of12 -->
<!-- task: 12 -->
<!-- generated-by: fg-loop -->
<!-- tdd: off -->
# 클라이언트 favicon 404 콘솔 오류 제거

## 목표 / 비목표
- 목표: 루프 검사 C5의 "콘솔 오류 0건"을 막는 `GET /favicon.ico` 404를 없앤다. `packages/client/index.html`에 `<link rel="icon" href="data:,">`를 추가한다(외부 파일 없이 브라우저의 자동 favicon 요청을 막는 최소 수정).
- 비목표: favicon 디자인, 다른 UI 변경, C5 기준 완화, 서버 변경.

## 단일 진실 공급원
- 용어집: none
- 관련 ADR: none
- 실패한 검사: 루프 `loop.md`의 C5. 증거: Playwright 콘솔 `[ERROR] Failed to load resource: 404 @ http://localhost:5173/favicon.ico`
- 완료 정의(DoD):
  - 회귀 검사 추가(red → green): `packages/client/test/index-html.test.ts`가 `packages/client/index.html`에 `rel="icon"` 링크가 있는지 단언한다. 수정 전 실행 시 실패(red), 수정 후 통과(green)해야 한다. 수정 전 상태에서 `npx vitest run packages/client/test/index-html.test.ts` → 실패를 먼저 기록한다.
  - `npx vitest run packages/client/test/index-html.test.ts` 통과
  - `npm test` 종료 코드 0 (기존 119개 + 신규, 회귀 없음)
  - `npm run typecheck` 종료 코드 0, `npm run build -w @snake/client` 종료 코드 0
  - 브라우저 확인(Playwright)은 루프 검사 C5로 재수행한다: 새 페이지 접속 후 콘솔 오류 0건
  - 사전 상태: 신규 테스트 파일이 없으므로 첫 항목은 red, 나머지는 이미 통과(회귀 방지용 항목).

## 작업 슬라이스
- [ ] S1. 위 회귀 테스트를 먼저 작성해 red를 확인하고 index.html에 icon 링크를 추가해 green으로 만든다 — 완료 기준: DoD 전 항목 충족, 변경 커밋(`git log --oneline`에 존재).

<!-- forge-slug: snake-clone-7of11 -->
<!-- task: 7 -->
<!-- part: 7/11 -->
<!-- tdd: off -->
# WebSocket 서버 + 틱 루프 + 입력 검증

## 목표 / 비목표
- 목표: 30 Hz 틱 루프와 WebSocket 서버, 세션 레이트 리밋을 만든다.
- 비목표: 봇. 구현 계획서의 해당 Task 범위를 벗어나는 기능, 스펙 상수·프로토콜 변경, 원격 push.

## 단일 진실 공급원
- 용어집: none
- 관련 ADR: none
- 구현 계획서: `docs/superpowers/plans/2026-10-15-snake-clone.md`의 **Task 7** — 파일 목록, Interfaces, 단계별 코드·테스트·명령이 이미 전부 적혀 있다. 그대로 따른다(테스트 먼저 작성 → 실패 확인 → 구현 → 통과 확인 → 커밋).
- 스펙: `docs/superpowers/specs/2026-10-15-snake-clone-design.md` (계획서 상단 "스펙과의 차이" 표가 우선)
- 완료 정의(DoD):
  - `npx vitest run packages/server/test/session.test.ts packages/server/test/server.test.ts` 통과 (잘못된 프레임은 그 접속만 1008 종료, 접속 끊김 시 먹이로 변환)
  - `npx tsc -p packages/server` 종료 코드 0
  - 실기동: `PORT=8090 npx tsx packages/server/src/index.ts`를 백그라운드로 띄우고 `curl -s http://localhost:8090/` 출력이 `snake server`, 확인 후 프로세스 종료
  - `npm test` 전체 종료 코드 0
  - 사전 상태: 코드가 아직 없으므로 위 항목은 전부 실패(red)한다. 이미 통과하는 항목은 없다.

## 작업 슬라이스
- [ ] S1. Task 7 전체 구현 — 완료 기준: 위 DoD의 모든 명령이 적힌 대로 통과하고, 계획서 Task 7의 커밋 단계가 수행되어 `git log --oneline`에 해당 커밋이 있다.

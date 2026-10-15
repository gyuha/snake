<!-- forge-slug: snake-clone-6of11 -->
<!-- task: 6 -->
<!-- part: 6/11 -->
<!-- tdd: off -->
# AOI 프레임 빌더 + 리더보드·미니맵

## 목표 / 비목표
- 목표: 세션별 시야 차분을 바이너리 프레임으로 만드는 buildFrame과 리더보드·미니맵을 만든다.
- 비목표: WebSocket 서버. 구현 계획서의 해당 Task 범위를 벗어나는 기능, 스펙 상수·프로토콜 변경, 원격 push.

## 단일 진실 공급원
- 용어집: none
- 관련 ADR: none
- 구현 계획서: `docs/superpowers/plans/2026-10-15-snake-clone.md`의 **Task 6** — 파일 목록, Interfaces, 단계별 코드·테스트·명령이 이미 전부 적혀 있다. 그대로 따른다(테스트 먼저 작성 → 실패 확인 → 구현 → 통과 확인 → 커밋).
- 스펙: `docs/superpowers/specs/2026-10-15-snake-clone-design.md` (계획서 상단 "스펙과의 차이" 표가 우선)
- 완료 정의(DoD):
  - `npx vitest run packages/server/test/interest.test.ts` 통과 (섹터 진입·이탈, 먹이 255개 초과 분할, 시야 밖 이벤트 미전송)
  - `npx tsc -p packages/shared && npx tsc -p packages/server` 종료 코드 0
  - `npm test` 전체 종료 코드 0
  - 사전 상태: 코드가 아직 없으므로 위 항목은 전부 실패(red)한다. 이미 통과하는 항목은 없다.

## 작업 슬라이스
- [ ] S1. Task 6 전체 구현 — 완료 기준: 위 DoD의 모든 명령이 적힌 대로 통과하고, 계획서 Task 6의 커밋 단계가 수행되어 `git log --oneline`에 해당 커밋이 있다.

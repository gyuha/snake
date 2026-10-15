<!-- forge-slug: snake-clone-3of11 -->
<!-- task: 3 -->
<!-- part: 3/11 -->
<!-- tdd: off -->
# BodyReplica + 서버 Snake 모델

## 목표 / 비목표
- 목표: 이벤트로 몸통을 재구성하는 BodyReplica와 서버 Snake(이동·커밋·성장·부스트)를 만든다.
- 비목표: 먹이, 충돌, 월드 틱. 구현 계획서의 해당 Task 범위를 벗어나는 기능, 스펙 상수·프로토콜 변경, 원격 push.

## 단일 진실 공급원
- 용어집: none
- 관련 ADR: none
- 구현 계획서: `docs/superpowers/plans/2026-10-15-snake-clone.md`의 **Task 3** — 파일 목록, Interfaces, 단계별 코드·테스트·명령이 이미 전부 적혀 있다. 그대로 따른다(테스트 먼저 작성 → 실패 확인 → 구현 → 통과 확인 → 커밋).
- 스펙: `docs/superpowers/specs/2026-10-15-snake-clone-design.md` (계획서 상단 "스펙과의 차이" 표가 우선)
- 완료 정의(DoD):
  - `npx vitest run packages/shared/test/body.test.ts packages/server/test/snake.test.ts` 통과 (1,000틱 서버-클라이언트 재구성 오차 ≤ 1e-3, 중간 합류 포함)
  - `npx tsc -p packages/shared && npx tsc -p packages/server` 종료 코드 0
  - `npm test` 전체 종료 코드 0
  - 사전 상태: 코드가 아직 없으므로 위 항목은 전부 실패(red)한다. 이미 통과하는 항목은 없다.

## 작업 슬라이스
- [ ] S1. Task 3 전체 구현 — 완료 기준: 위 DoD의 모든 명령이 적힌 대로 통과하고, 계획서 Task 3의 커밋 단계가 수행되어 `git log --oneline`에 해당 커밋이 있다.

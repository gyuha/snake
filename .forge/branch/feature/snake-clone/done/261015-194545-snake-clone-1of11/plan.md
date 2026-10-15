<!-- forge-slug: snake-clone-1of11 -->
<!-- task: 1 -->
<!-- part: 1/11 -->
<!-- tdd: off -->
# 모노레포 스캐폴드 + shared 상수·물리 공식

## 목표 / 비목표
- 목표: npm workspaces 모노레포와 `@snake/shared`의 상수·물리·각도·섹터 공식을 만든다.
- 비목표: 프로토콜 코덱, 서버·클라이언트 코드. 구현 계획서의 해당 Task 범위를 벗어나는 기능, 스펙 상수·프로토콜 변경, 원격 push.

## 단일 진실 공급원
- 용어집: none
- 관련 ADR: none
- 구현 계획서: `docs/superpowers/plans/2026-10-15-snake-clone.md`의 **Task 1** — 파일 목록, Interfaces, 단계별 코드·테스트·명령이 이미 전부 적혀 있다. 그대로 따른다(테스트 먼저 작성 → 실패 확인 → 구현 → 통과 확인 → 커밋).
- 스펙: `docs/superpowers/specs/2026-10-15-snake-clone-design.md` (계획서 상단 "스펙과의 차이" 표가 우선)
- 완료 정의(DoD):
  - `npx vitest run packages/shared/test/physics.test.ts` 통과 (score 검산값 2→10, 10→133, 100→2029, 300→20245 포함)
  - `npx tsc -p packages/shared` 종료 코드 0
  - `.gitignore`에 `node_modules/`, `dist/`, `.task/` 포함: `grep -c '^\.task/' .gitignore` ≥ 1
  - 사전 상태: 코드가 아직 없으므로 위 항목은 전부 실패(red)한다. 이미 통과하는 항목은 없다.

## 작업 슬라이스
- [ ] S1. Task 1 전체 구현 — 완료 기준: 위 DoD의 모든 명령이 적힌 대로 통과하고, 계획서 Task 1의 커밋 단계가 수행되어 `git log --oneline`에 해당 커밋이 있다.

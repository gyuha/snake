<!-- forge-slug: snake-clone-10of11 -->
<!-- task: 10 -->
<!-- part: 10/11 -->
<!-- tdd: off -->
# 클라이언트 앱 (연결·입력·렌더링·HUD·화면)

## 목표 / 비목표
- 목표: Canvas 렌더러, 입력, HUD, 화면 전환을 구현한다.
- 비목표: 스펙 범위 밖 UI 기능. 구현 계획서의 해당 Task 범위를 벗어나는 기능, 스펙 상수·프로토콜 변경, 원격 push.

## 단일 진실 공급원
- 용어집: none
- 관련 ADR: none
- 구현 계획서: `docs/superpowers/plans/2026-10-15-snake-clone.md`의 **Task 10** — 파일 목록, Interfaces, 단계별 코드·테스트·명령이 이미 전부 적혀 있다. 그대로 따른다(테스트 먼저 작성 → 실패 확인 → 구현 → 통과 확인 → 커밋).
- 스펙: `docs/superpowers/specs/2026-10-15-snake-clone-design.md` (계획서 상단 "스펙과의 차이" 표가 우선)
- 완료 정의(DoD):
  - `npm run typecheck` 종료 코드 0
  - `npm run build -w @snake/client` 종료 코드 0이고 `test -f packages/client/dist/index.html` 성공
  - `npm test` 전체 종료 코드 0
  - 브라우저 실검증(계획서 Task 10 Step 8)은 이 플랜이 아니라 루프 검사 C5가 담당한다. 이 플랜에서는 수행하지 않아도 된다.
  - 사전 상태: 코드가 아직 없으므로 위 항목은 전부 실패(red)한다. 이미 통과하는 항목은 없다.

## 작업 슬라이스
- [ ] S1. Task 10 전체 구현 — 완료 기준: 위 DoD의 모든 명령이 적힌 대로 통과하고, 계획서 Task 10의 커밋 단계가 수행되어 `git log --oneline`에 해당 커밋이 있다.

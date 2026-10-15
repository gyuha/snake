<!-- forge-slug: snake-clone-11of11 -->
<!-- task: 11 -->
<!-- part: 11/11 -->
<!-- tdd: off -->
# 부하 테스트 + 최종 검증

## 목표 / 비목표
- 목표: 헤드리스 부하 테스트 스크립트를 만들고 성공 기준(틱 평균 ≤ 10 ms, ≤ 10 KB/s)을 측정한다.
- 비목표: 기준값 완화. 구현 계획서의 해당 Task 범위를 벗어나는 기능, 스펙 상수·프로토콜 변경, 원격 push.

## 단일 진실 공급원
- 용어집: none
- 관련 ADR: none
- 구현 계획서: `docs/superpowers/plans/2026-10-15-snake-clone.md`의 **Task 11** — 파일 목록, Interfaces, 단계별 코드·테스트·명령이 이미 전부 적혀 있다. 그대로 따른다(테스트 먼저 작성 → 실패 확인 → 구현 → 통과 확인 → 커밋).
- 스펙: `docs/superpowers/specs/2026-10-15-snake-clone-design.md` (계획서 상단 "스펙과의 차이" 표가 우선)
- 완료 정의(DoD):
  - `npm run loadtest -- 10 5` 가 `[loadtest] PASS` 출력
  - `npm run loadtest` (100명·60초)가 `[loadtest] PASS` 출력하고 표의 avgTickMs ≤ 10, bytesPerClientPerSec ≤ 10240, connectedAtEnd = 100
  - `npm test && npm run typecheck && npm run build -w @snake/client` 종료 코드 0
  - 사전 상태: 코드가 아직 없으므로 위 항목은 전부 실패(red)한다. 이미 통과하는 항목은 없다.

## 작업 슬라이스
- [ ] S1. Task 11 전체 구현 — 완료 기준: 위 DoD의 모든 명령이 적힌 대로 통과하고, 계획서 Task 11의 커밋 단계가 수행되어 `git log --oneline`에 해당 커밋이 있다.

# RUN — 모노레포 스캐폴드 + shared 상수·물리 공식

## 슬라이스 결과
- S1 Task 1 전체 구현 — ✅ 계획대로 (워크플로우 없이 직접 실행: 파일 10개 규모)

## DoD baseline → after
- `vitest run packages/shared/test/physics.test.ts`: 실패(vitest 없음, exit 1) → 통과 (19 tests passed)
- `tsc -p packages/shared`: exit 1 → exit 0
- `.gitignore`에 `.task/`: 파일 없음 → 1

## 차이와 메모
- 계획서 Task 1 `.gitignore`에 `.task/` 추가(루프 계약의 DoD와 일치시키려고 계획서도 함께 수정함, 미커밋).
- 테스트 작성 중 `turnToward` 마지막 단언을 계획서와 다르게 `|| true`가 붙은 식으로 잘못 썼다가, 통과 확인 전에 계획서대로 바로잡음. 최종 파일은 계획서와 동일.
- 커밋: `0916be0 feat(shared): add game constants and physics formulas`
- `typecheck` 스크립트는 아직 없는 packages/server·client·scripts를 참조한다(후속 태스크에서 생성). 루프 검사 C2는 그때까지 실패가 정상.

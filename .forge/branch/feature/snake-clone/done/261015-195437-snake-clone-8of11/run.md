# RUN — 서버 봇

## 슬라이스 결과
- S1 Task 8 전체 구현 — ✅ 계획대로 (서브에이전트 구현 + 메인 세션 DoD 재검증)

## DoD after
- 검증 증거: 메인 세션 재검증: bot 7 passed, tsc exit 0, 전체 107 passed, skip/only 0

## 메모
- 커밋: ed7bb34 feat(server): add bots with edge, danger, food and wander behaviors
- 서브에이전트 구현(ed7bb34). 계획서 코드 그대로. 발견(미수정): 경계 회피 분기를 끄고 돌려도 '60초 경계 사망 0회' 테스트는 통과함 — 봉 5마리가 중심에서 출발해 60초 내 경계에 못 가서 비변별적. 경계 회피는 단위 테스트(turns toward the center)가 변별함(변이 시 실패 확인). 후속으로 시작 위치를 경계 근처로 두는 변별 테스트 보강 권장.

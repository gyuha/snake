# Snake

slither.io 메커니즘을 참고해 독자적으로 구현한 멀티플레이 뱀 게임입니다. 권위 서버(Node.js + `ws`)와 HTML5 Canvas 클라이언트(Vite)로 구성되며, 서버 봇 30마리가 기본으로 함께 돌아갑니다.

- 스택: Node.js, TypeScript, `ws`, Canvas 2D, Vite, Vitest
- 구조: npm workspaces 모노레포

| 패키지 | 역할 |
|---|---|
| `packages/shared` | 서버·클라이언트 공용 상수, 물리, 프로토콜 |
| `packages/server` | 게임 월드, 봇, WebSocket 서버 (기본 `ws://localhost:8080`) |
| `packages/client` | 브라우저 클라이언트 (기본 `http://localhost:5173`) |
| `scripts` | 부하 테스트 |

설계 문서는 [`docs/superpowers/specs/2026-10-15-snake-clone-design.md`](docs/superpowers/specs/2026-10-15-snake-clone-design.md)에 있습니다.

## 사전 준비

- Node.js 20 이상 (npm 포함)
- [Task](https://taskfile.dev) (`task` 명령)

### Task 설치

이 프로젝트의 실행 명령은 `Taskfile.yml`에 정의되어 있어 `task`가 필요합니다. 설치 후 `task --version`으로 확인하세요.

| 환경 | 명령 |
|---|---|
| macOS (Homebrew) | `brew install go-task` |
| npm (모든 OS) | `npm install -g @go-task/cli` |
| Windows (winget) | `winget install Task.Task` |
| Linux / 기타 | `sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d -b ~/.local/bin` |

Homebrew의 패키지 이름은 `task`가 아니라 `go-task`입니다. 그 외 방법은 [공식 설치 문서](https://taskfile.dev/installation/)를 참고하세요.

Task 없이 쓰려면 아래 표의 "내부 명령"을 `npm`으로 직접 실행하면 됩니다.

## 실행

```bash
task dev
```

의존성 설치(`task install`)가 먼저 자동 실행되고, 서버와 클라이언트 개발 서버가 함께 뜹니다. 브라우저에서 <http://localhost:5173> 을 열고 이름을 입력해 시작합니다.

```
task dev → install(변경 시에만) → 서버 :8080 + 클라이언트 :5173 동시 실행
```

### 조작

| 입력 | 동작 |
|---|---|
| 마우스 이동 | 진행 방향 |
| 마우스 클릭 / `Space` (누르고 있기) | 부스트 |
| `←` / `→` | 방향 회전 |

## 서버 중단

### 포그라운드로 실행 중일 때

`task dev`를 실행한 터미널에서 `Ctrl+C`를 누르면 서버와 클라이언트가 함께 종료됩니다. `task server` / `task client`로 따로 띄웠다면 각 터미널에서 `Ctrl+C`를 누르세요.

### 백그라운드 또는 터미널을 잃어버렸을 때

터미널이 닫혔는데 프로세스가 남아 포트가 점유된 경우, 포트로 프로세스를 찾아 종료합니다. (`Taskfile.yml`에는 중단용 task가 없습니다.)

```bash
# 어떤 프로세스가 쓰고 있는지 확인
lsof -i :8080 -i :5173

# 서버(8080)와 클라이언트(5173) 종료
lsof -ti :8080 | xargs kill
lsof -ti :5173 | xargs kill
```

`kill`로 종료되지 않을 때만 `kill -9`를 사용하세요. 서버를 `PORT` 환경 변수로 다른 포트에 띄웠다면 해당 포트 번호로 바꿔서 실행합니다.

```
Ctrl+C 가능? ─ 예 → Ctrl+C
      └ 아니오 → lsof -ti :포트 → kill → 안 죽으면 kill -9
```

## Task 명령 목록

`task --list`로도 확인할 수 있습니다.

| 명령 | 설명 | 내부 명령 |
|---|---|---|
| `task install` | 의존성 설치 (package.json/lock 변경 시에만 실행) | `npm install` |
| `task dev` | 서버(봇 포함)와 클라이언트를 함께 실행 | `npm run dev` |
| `task server` | 게임 서버만 실행 | `npm run start -w @snake/server` |
| `task client` | 클라이언트 개발 서버만 실행 | `npm run dev -w @snake/client` |
| `task test` | 전체 테스트 | `npm test` |
| `task typecheck` | 전체 패키지 타입 검사 | `npm run typecheck` |
| `task build` | 클라이언트 프로덕션 빌드 (`packages/client/dist`) | `npm run build -w @snake/client` |
| `task loadtest -- 100 60` | 부하 테스트 (클라이언트 100명, 60초) | `npm run loadtest -- 100 60` |
| `task check` | 커밋 전 검증 (테스트 + 타입 검사 + 빌드) | — |

## 설정

| 환경 변수 | 대상 | 기본값 | 설명 |
|---|---|---|---|
| `PORT` | 서버 | `8080` | WebSocket 서버 포트 |
| `VITE_WS_URL` | 클라이언트 | `ws://<접속 호스트>:8080` | 접속할 서버 주소 |

```bash
# 다른 포트로 서버를 띄우고 클라이언트가 그쪽에 붙게 하기
PORT=9000 task server
VITE_WS_URL=ws://localhost:9000 task client
```

클라이언트 개발 서버는 `host: true`로 열리므로 같은 네트워크의 다른 기기에서 `http://<내 IP>:5173`으로 접속해 함께 플레이할 수 있습니다.

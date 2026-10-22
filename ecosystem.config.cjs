// pm2 설정. `task start` / `task stop`으로 사용합니다.
// 서버 포트는 루트 .env의 PORT를 따릅니다. 클라이언트는 빌드 결과(dist)를 별도로 호스팅합니다.
module.exports = {
  apps: [
    {
      name: 'snake-server',
      script: 'npm',
      args: 'run start -w @snake/server',
      interpreter: 'none', // npm은 셸 스크립트라 node로 실행하면 안 됩니다
      autorestart: true,
    },
  ],
};

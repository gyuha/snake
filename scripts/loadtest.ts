import { WebSocket } from 'ws';
import { ANIMAL_COUNT, BOT_TARGET, SKIN_COUNT, TAU, decodeServerFrame, encodeClient, quantizeAngle8, type ClientMsg } from '@snake/shared';
import { BotController } from '../packages/server/src/bots/bot';
import { startServer } from '../packages/server/src/server';

const CLIENTS = Number(process.argv[2] ?? 100);
const SECONDS = Number(process.argv[3] ?? 60);
const WARMUP_SECONDS = 5;
const TICK_BUDGET_MS = 10;
const BYTES_BUDGET = 10 * 1024;
const WS_HEADER_BYTES = 4;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const bots = new BotController(BOT_TARGET);
const server = await startServer({ port: 0, beforeTick: (world, tick) => bots.update(world, tick) });
const url = `ws://127.0.0.1:${server.port}`;

let measuring = false;
let bytes = 0;
let deaths = 0;
const sockets: WebSocket[] = [];
const timers: NodeJS.Timeout[] = [];

for (let i = 0; i < CLIENTS; i++) {
  const ws = new WebSocket(url);
  const send = (msg: ClientMsg) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(encodeClient(msg));
  };
  const join = () => send({ t: 'join', name: `load${i}`, skin: i % SKIN_COUNT, animal: i % ANIMAL_COUNT });
  ws.on('open', join);
  ws.on('message', (data: Buffer) => {
    if (measuring) bytes += data.length + WS_HEADER_BYTES;
    for (const m of decodeServerFrame(new Uint8Array(data))) {
      if (m.t === 'death') {
        deaths++;
        join();
      }
    }
  });
  ws.on('error', (err) => console.error(`[loadtest] client ${i}:`, err.message));
  timers.push(setInterval(() => {
    send({ t: 'steer', angle: quantizeAngle8(Math.random() * TAU) });
    send({ t: 'boost', on: Math.random() < 0.1 });
  }, 500));
  sockets.push(ws);
}

await sleep(WARMUP_SECONDS * 1000);
const ticks0 = server.stats.ticks;
const avg0 = server.stats.avgTickMs;
measuring = true;
const startedAt = performance.now();
await sleep(SECONDS * 1000);
measuring = false;
const elapsed = (performance.now() - startedAt) / 1000;

const ticks1 = server.stats.ticks;
const avgTick = (server.stats.avgTickMs * ticks1 - avg0 * ticks0) / Math.max(1, ticks1 - ticks0);
const perClient = bytes / CLIENTS / elapsed;
const open = sockets.filter((s) => s.readyState === WebSocket.OPEN).length;

console.table({
  clients: CLIENTS,
  connectedAtEnd: open,
  snakes: server.world.snakes.size,
  measuredSeconds: Number(elapsed.toFixed(1)),
  ticks: ticks1 - ticks0,
  avgTickMs: Number(avgTick.toFixed(2)),
  maxTickMsAllTime: Number(server.stats.maxTickMs.toFixed(2)),
  bytesPerClientPerSec: Math.round(perClient),
  deathsAndRejoins: deaths,
});

const failures: string[] = [];
if (avgTick > TICK_BUDGET_MS) failures.push(`avg tick ${avgTick.toFixed(2)} ms > ${TICK_BUDGET_MS} ms`);
if (perClient > BYTES_BUDGET) failures.push(`per-client ${Math.round(perClient)} B/s > ${BYTES_BUDGET} B/s`);
if (open < CLIENTS) failures.push(`${CLIENTS - open} clients disconnected`);

for (const t of timers) clearInterval(t);
for (const s of sockets) s.terminate();
await server.close();

if (failures.length > 0) {
  console.error(`[loadtest] FAIL: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('[loadtest] PASS');
process.exit(0);

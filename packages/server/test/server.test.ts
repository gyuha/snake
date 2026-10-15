import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  NO_KILLER, decodeServerFrame, encodeClient, quantizeAngle16, type ClientMsg, type ServerMsg,
} from '@snake/shared';
import { startServer, type GameServer } from '../src/server';
import { seededRng } from './helpers';

interface TestClient {
  ws: WebSocket;
  msgs: ServerMsg[];
  closed: Promise<number>;
  send(msg: ClientMsg): void;
}

let server: GameServer | null = null;
const clients: TestClient[] = [];

afterEach(async () => {
  for (const c of clients.splice(0)) c.ws.terminate();
  await server?.close();
  server = null;
});

async function boot(): Promise<GameServer> {
  server = await startServer({ port: 0, rng: seededRng(11), initialFood: 500 });
  return server;
}

async function connect(port: number): Promise<TestClient> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const msgs: ServerMsg[] = [];
  ws.on('message', (data: Buffer) => msgs.push(...decodeServerFrame(new Uint8Array(data))));
  const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
  await once(ws, 'open');
  const client: TestClient = { ws, msgs, closed, send: (m) => ws.send(encodeClient(m)) };
  clients.push(client);
  return client;
}

async function waitFor(cond: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

function welcomeOf(c: TestClient) {
  const w = c.msgs.find((m) => m.t === 'welcome');
  return w && w.t === 'welcome' ? w : null;
}

describe('game server', () => {
  it('join sends welcome, then self snakeAdd and sector food', async () => {
    const { port } = await boot();
    const c = await connect(port);
    c.send({ t: 'join', name: 'tester', skin: 3 });
    await waitFor(() => welcomeOf(c) !== null);
    const selfId = welcomeOf(c)!.selfId;
    await waitFor(() => c.msgs.some((m) => m.t === 'snakeAdd' && m.id === selfId));
    expect(c.msgs.some((m) => m.t === 'sectorFood')).toBe(true);
    const add = c.msgs.find((m) => m.t === 'snakeAdd' && m.id === selfId);
    expect(add && add.t === 'snakeAdd' && add.name).toBe('tester');
  });

  it('answers ping with pong', async () => {
    const { port } = await boot();
    const c = await connect(port);
    c.send({ t: 'ping' });
    await waitFor(() => c.msgs.some((m) => m.t === 'pong'));
  });

  it('steer changes the target angle', async () => {
    const { port } = await boot();
    const c = await connect(port);
    c.send({ t: 'join', name: 'a', skin: 0 });
    await waitFor(() => welcomeOf(c) !== null);
    const selfId = welcomeOf(c)!.selfId;
    await waitFor(() => c.msgs.some((m) => m.t === 'snakeAdd' && m.id === selfId));
    c.send({ t: 'steer', angle: 64 });
    await waitFor(() => c.msgs.some((m) => m.t === 'snakeState' && m.id === selfId && m.wang === quantizeAngle16(Math.PI / 2)));
  });

  it('ignores join while already alive', async () => {
    const srv = await boot();
    const c = await connect(srv.port);
    c.send({ t: 'join', name: 'a', skin: 0 });
    c.send({ t: 'join', name: 'b', skin: 0 });
    await waitFor(() => welcomeOf(c) !== null);
    await new Promise((r) => setTimeout(r, 100));
    expect(c.msgs.filter((m) => m.t === 'welcome')).toHaveLength(1);
    expect(srv.world.snakes.size).toBe(1);
  });

  it('garbage frame closes only that socket', async () => {
    const { port } = await boot();
    const good = await connect(port);
    good.send({ t: 'join', name: 'good', skin: 0 });
    await waitFor(() => welcomeOf(good) !== null);
    const bad = await connect(port);
    bad.ws.send(new Uint8Array([0x7f, 1, 2]));
    expect(await bad.closed).toBe(1008);
    const before = good.msgs.length;
    await waitFor(() => good.msgs.length > before + 3);
    expect(good.ws.readyState).toBe(WebSocket.OPEN);
  });

  it('text frames are rejected with 1008', async () => {
    const { port } = await boot();
    const c = await connect(port);
    c.ws.send('hello');
    expect(await c.closed).toBe(1008);
  });

  it('disconnect while alive turns the snake into food', async () => {
    const srv = await boot();
    const c = await connect(srv.port);
    c.send({ t: 'join', name: 'quitter', skin: 1 });
    await waitFor(() => welcomeOf(c) !== null);
    const id = welcomeOf(c)!.selfId;
    const snake = srv.world.snakes.get(id)!;
    c.ws.close();
    await waitFor(() => !srv.world.snakes.has(id));
    const nearby = srv.world.food.queryCircle(snake.headX, snake.headY, 100);
    expect(nearby.some((f) => f.kind === 'death')).toBe(true);
  });

  it('a killed player gets death and its own removal with reason 1', async () => {
    const srv = await boot();
    const c = await connect(srv.port);
    c.send({ t: 'join', name: 'victim', skin: 2 });
    await waitFor(() => welcomeOf(c) !== null);
    const id = welcomeOf(c)!.selfId;
    await waitFor(() => c.msgs.some((m) => m.t === 'snakeAdd' && m.id === id));
    srv.world.killSnake(srv.world.snakes.get(id)!, NO_KILLER);
    await waitFor(() => c.msgs.some((m) => m.t === 'death'));
    expect(c.msgs).toContainEqual({ t: 'snakeRemove', id, reason: 1 });
    c.send({ t: 'join', name: 'again', skin: 2 });
    await waitFor(() => c.msgs.filter((m) => m.t === 'welcome').length === 2);
  });

  it('sends leaderboard and minimap about once per second', async () => {
    const { port } = await boot();
    const c = await connect(port);
    c.send({ t: 'join', name: 'a', skin: 0 });
    await waitFor(() => c.msgs.some((m) => m.t === 'leaderboard') && c.msgs.some((m) => m.t === 'minimap'), 2500);
  });

  it('records tick statistics', async () => {
    const srv = await boot();
    await waitFor(() => srv.stats.ticks >= 10);
    expect(srv.stats.avgTickMs).toBeGreaterThan(0);
    expect(srv.stats.maxTickMs).toBeGreaterThanOrEqual(srv.stats.avgTickMs);
  });
});

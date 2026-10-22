import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  NO_KILLER, START_SEGMENTS, decodeServerFrame, score, encodeClient, quantizeAngle16, type ClientMsg, type ServerMsg,
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
    c.send({ t: 'join', name: 'tester', skin: 3, animal: 2 });
    await waitFor(() => welcomeOf(c) !== null);
    const selfId = welcomeOf(c)!.selfId;
    await waitFor(() => c.msgs.some((m) => m.t === 'snakeAdd' && m.id === selfId));
    expect(c.msgs.some((m) => m.t === 'sectorFood')).toBe(true);
    const add = c.msgs.find((m) => m.t === 'snakeAdd' && m.id === selfId);
    expect(add && add.t === 'snakeAdd' && add.name).toBe('tester');
    expect(add && add.t === 'snakeAdd' && add.animal).toBe(2);
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
    c.send({ t: 'join', name: 'a', skin: 0, animal: 0 });
    await waitFor(() => welcomeOf(c) !== null);
    const selfId = welcomeOf(c)!.selfId;
    await waitFor(() => c.msgs.some((m) => m.t === 'snakeAdd' && m.id === selfId));
    c.send({ t: 'steer', angle: 64 });
    await waitFor(() => c.msgs.some((m) => m.t === 'snakeState' && m.id === selfId && m.wang === quantizeAngle16(Math.PI / 2)));
  });

  it('ignores join while already alive', async () => {
    const srv = await boot();
    const c = await connect(srv.port);
    c.send({ t: 'join', name: 'a', skin: 0, animal: 0 });
    c.send({ t: 'join', name: 'b', skin: 0, animal: 0 });
    await waitFor(() => welcomeOf(c) !== null);
    await new Promise((r) => setTimeout(r, 100));
    expect(c.msgs.filter((m) => m.t === 'welcome')).toHaveLength(1);
    expect(srv.world.snakes.size).toBe(1);
  });

  it('garbage frame closes only that socket', async () => {
    const { port } = await boot();
    const good = await connect(port);
    good.send({ t: 'join', name: 'good', skin: 0, animal: 0 });
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
    c.send({ t: 'join', name: 'quitter', skin: 1, animal: 0 });
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
    c.send({ t: 'join', name: 'victim', skin: 2, animal: 0 });
    await waitFor(() => welcomeOf(c) !== null);
    const id = welcomeOf(c)!.selfId;
    await waitFor(() => c.msgs.some((m) => m.t === 'snakeAdd' && m.id === id));
    srv.world.killSnake(srv.world.snakes.get(id)!, NO_KILLER);
    await waitFor(() => c.msgs.some((m) => m.t === 'death'));
    expect(c.msgs).toContainEqual({ t: 'snakeRemove', id, reason: 1 });
    c.send({ t: 'join', name: 'again', skin: 2, animal: 0 });
    await waitFor(() => c.msgs.filter((m) => m.t === 'welcome').length === 2);
  });

  it('sends leaderboard and minimap about once per second', async () => {
    const { port } = await boot();
    const c = await connect(port);
    c.send({ t: 'join', name: 'a', skin: 0, animal: 0 });
    await waitFor(() => c.msgs.some((m) => m.t === 'leaderboard') && c.msgs.some((m) => m.t === 'minimap'), 2500);
  });

  it('records tick statistics', async () => {
    const srv = await boot();
    await waitFor(() => srv.stats.ticks >= 10);
    expect(srv.stats.avgTickMs).toBeGreaterThan(0);
    expect(srv.stats.maxTickMs).toBeGreaterThanOrEqual(srv.stats.avgTickMs);
  });

  it('spectator gets overview of all snakes without a snake of its own or view frames', async () => {
    const srv = await boot();
    const player = await connect(srv.port);
    player.send({ t: 'join', name: 'alpha', skin: 3, animal: 0 });
    await waitFor(() => welcomeOf(player) !== null);

    const spec = await connect(srv.port);
    spec.send({ t: 'spectate' });
    await waitFor(() => spec.msgs.some((m) => m.t === 'overview'));

    const ov = spec.msgs.find((m) => m.t === 'overview');
    if (!ov || ov.t !== 'overview') throw new Error('no overview');
    expect(ov.snakes.map((s) => s.name)).toEqual(['alpha']);
    expect(srv.world.snakes.size).toBe(1);

    // A tick can land between connect and the spectate message (start-screen viewers get view frames),
    // so only frames after the first overview count.
    spec.msgs.length = 0;
    const ticks = srv.stats.ticks;
    await waitFor(() => srv.stats.ticks > ticks + 12);
    spec.send({ t: 'ping' });
    await waitFor(() => spec.msgs.some((m) => m.t === 'pong'));
    const kinds = new Set(spec.msgs.map((m) => m.t));
    for (const t of ['welcome', 'snakeAdd', 'sectorFood', 'leaderboard', 'minimap'] as const) {
      expect(kinds.has(t)).toBe(false);
    }
  });

  it('tells a spectator, and only a spectator, the addresses the server can be reached at', async () => {
    server = await startServer({ port: 0, rng: seededRng(11), initialFood: 500, lanHosts: ['192.168.0.74', '10.0.0.5'] });
    const spec = await connect(server.port);
    spec.send({ t: 'spectate' });
    await waitFor(() => spec.msgs.some((m) => m.t === 'serverInfo'));
    expect(spec.msgs.find((m) => m.t === 'serverInfo')).toEqual({ t: 'serverInfo', hosts: ['192.168.0.74', '10.0.0.5'] });

    const player = await connect(server.port);
    player.send({ t: 'join', name: 'p', skin: 0, animal: 0 });
    player.send({ t: 'ping' });
    await waitFor(() => player.msgs.some((m) => m.t === 'pong'));
    expect(player.msgs.some((m) => m.t === 'serverInfo')).toBe(false);
  });

  it('a playing session cannot become a spectator and a spectator cannot join', async () => {
    const srv = await boot();
    const player = await connect(srv.port);
    player.send({ t: 'join', name: 'p', skin: 0, animal: 0 });
    await waitFor(() => welcomeOf(player) !== null);
    player.send({ t: 'spectate' });
    player.send({ t: 'ping' });
    await waitFor(() => player.msgs.some((m) => m.t === 'pong'));
    expect([...srv.sessions].some((s) => s.spectator)).toBe(false);

    const spec = await connect(srv.port);
    spec.send({ t: 'spectate' });
    spec.send({ t: 'join', name: 'sneaky', skin: 0, animal: 0 });
    spec.send({ t: 'ping' });
    await waitFor(() => spec.msgs.some((m) => m.t === 'pong'));
    expect(welcomeOf(spec)).toBeNull();
    expect(srv.world.snakes.size).toBe(1);
  });

  it('keeps the world running when a spectator disconnects', async () => {
    const srv = await boot();
    const spec = await connect(srv.port);
    spec.send({ t: 'spectate' });
    await waitFor(() => spec.msgs.some((m) => m.t === 'overview'));
    spec.ws.terminate();
    await waitFor(() => srv.sessions.size === 0);
    const ticks = srv.stats.ticks;
    await waitFor(() => srv.stats.ticks > ticks + 3);
  });

  describe('rounds', () => {
    let clock = 0;
    let beforeTicks = 0;

    let botTargets: number[] = [];

    async function bootRound(): Promise<GameServer> {
      clock = 1_000_000;
      beforeTicks = 0;
      botTargets = [];
      server = await startServer({
        port: 0, rng: seededRng(11), initialFood: 500, now: () => clock, beforeTick: () => { beforeTicks++; },
        onStartRound: (bots) => botTargets.push(bots),
      });
      return server;
    }

    const roundOf = (c: TestClient) => {
      const rounds = c.msgs.filter((m) => m.t === 'round');
      const last = rounds[rounds.length - 1];
      return last && last.t === 'round' ? last : null;
    };

    async function spectator(port: number): Promise<TestClient> {
      const spec = await connect(port);
      spec.send({ t: 'spectate' });
      await waitFor(() => roundOf(spec) !== null);
      return spec;
    }

    it('tells every new connection that no round exists yet', async () => {
      const srv = await bootRound();
      const spec = await spectator(srv.port);
      expect(roundOf(spec)).toEqual({ t: 'round', state: 'none', seq: 0, remainingMs: 0 });
      const player = await connect(srv.port);
      await waitFor(() => roundOf(player) !== null);
      expect(roundOf(player)?.state).toBe('none');
    });

    it('starts a round for a spectator request and respawns the players snakes without a death', async () => {
      const srv = await bootRound();
      const player = await connect(srv.port);
      player.send({ t: 'join', name: 'alpha', skin: 1, animal: 2 });
      await waitFor(() => welcomeOf(player) !== null);
      const before = welcomeOf(player)!.selfId;
      const spec = await spectator(srv.port);

      spec.send({ t: 'startRound', minutes: 2, bots: 30 });
      await waitFor(() => roundOf(spec)?.state === 'running');
      expect(roundOf(spec)?.remainingMs).toBe(120_000);
      expect(roundOf(spec)?.seq).toBe(1);
      await waitFor(() => roundOf(player)?.state === 'running');
      await waitFor(() => player.msgs.filter((m) => m.t === 'welcome').length === 2);
      const ws = player.msgs.filter((m) => m.t === 'welcome');
      expect(ws[1] && ws[1].t === 'welcome' && ws[1].selfId).not.toBe(before);
      expect(player.msgs.some((m) => m.t === 'death')).toBe(false);

      const [mine] = [...srv.world.snakes.values()];
      expect(srv.world.snakes.size).toBe(1);
      expect(mine).toMatchObject({ name: 'alpha', skin: 1, animal: 2 });
      expect(mine!.score).toBe(score(START_SEGMENTS, 0));
    });

    it('0 minutes starts a new free game every time', async () => {
      const srv = await bootRound();
      const spec = await spectator(srv.port);
      spec.send({ t: 'startRound', minutes: 5, bots: 30 });
      await waitFor(() => roundOf(spec)?.seq === 1);

      spec.send({ t: 'startRound', minutes: 0, bots: 20 });
      await waitFor(() => roundOf(spec)?.seq === 2);
      expect(roundOf(spec)).toMatchObject({ state: 'none', remainingMs: 0 });
      clock += 10 * 60_000;
      await new Promise((r) => setTimeout(r, 100));
      expect(roundOf(spec)?.state).toBe('none');

      spec.send({ t: 'startRound', minutes: 0, bots: 12 });
      await waitFor(() => roundOf(spec)?.seq === 3);
      expect(botTargets).toEqual([30, 20, 12]);
    });

    it('numbers each start so clients can tell a restart from a repeated broadcast', async () => {
      const srv = await bootRound();
      const spec = await spectator(srv.port);
      spec.send({ t: 'startRound', minutes: 5, bots: 30 });
      await waitFor(() => roundOf(spec)?.seq === 1);
      spec.send({ t: 'startRound', minutes: 5, bots: 30 });
      await waitFor(() => roundOf(spec)?.seq === 2);
    });

    it('hands the requested bot count to the host on each start, 0 to 100 inclusive', async () => {
      const srv = await bootRound();
      const spec = await spectator(srv.port);
      for (const bots of [0, 100, 57]) {
        spec.send({ t: 'startRound', minutes: 1, bots });
      }
      await waitFor(() => botTargets.length === 3);
      expect(botTargets).toEqual([0, 100, 57]);
    });

    it('ignores a bot count above 100', async () => {
      const srv = await bootRound();
      const spec = await spectator(srv.port);
      spec.send({ t: 'startRound', minutes: 1, bots: 101 });
      spec.send({ t: 'startRound', minutes: 1, bots: 255 });
      spec.send({ t: 'ping' });
      await waitFor(() => spec.msgs.some((m) => m.t === 'pong'));
      expect(roundOf(spec)?.state).toBe('none');
      expect(botTargets).toEqual([]);
    });

    it('ignores minutes above 60 and requests from non-spectators', async () => {
      const srv = await bootRound();
      const spec = await spectator(srv.port);
      for (const minutes of [61, 255]) spec.send({ t: 'startRound', minutes, bots: 30 });
      const player = await connect(srv.port);
      player.send({ t: 'startRound', minutes: 5, bots: 30 });
      player.send({ t: 'ping' });
      spec.send({ t: 'ping' });
      await waitFor(() => player.msgs.some((m) => m.t === 'pong') && spec.msgs.some((m) => m.t === 'pong'));
      expect(roundOf(spec)?.state).toBe('none');
      expect(roundOf(player)?.state).toBe('none');
    });

    it('freezes the world and refuses joins once the time is up, until a new round starts', async () => {
      const srv = await bootRound();
      const spec = await spectator(srv.port);
      spec.send({ t: 'startRound', minutes: 1, bots: 30 });
      await waitFor(() => roundOf(spec)?.state === 'running');

      clock += 60_000;
      await waitFor(() => roundOf(spec)?.state === 'ended');
      expect(roundOf(spec)?.remainingMs).toBe(0);

      const frozenAt = beforeTicks;
      const ticks = srv.stats.ticks;
      await waitFor(() => srv.stats.ticks > ticks + 5);
      expect(beforeTicks).toBe(frozenAt);

      const late = await connect(srv.port);
      await waitFor(() => roundOf(late)?.state === 'ended');
      late.send({ t: 'join', name: 'late', skin: 0, animal: 0 });
      late.send({ t: 'ping' });
      await waitFor(() => late.msgs.some((m) => m.t === 'pong'));
      expect(welcomeOf(late)).toBeNull();

      spec.send({ t: 'startRound', minutes: 1, bots: 30 });
      await waitFor(() => roundOf(spec)?.state === 'running');
      late.send({ t: 'join', name: 'late', skin: 0, animal: 0 });
      await waitFor(() => welcomeOf(late) !== null);
      await waitFor(() => beforeTicks > frozenAt);
    });

    it('restarts a running round with a fresh countdown', async () => {
      const srv = await bootRound();
      const spec = await spectator(srv.port);
      spec.send({ t: 'startRound', minutes: 5, bots: 30 });
      await waitFor(() => roundOf(spec)?.state === 'running');
      clock += 90_000;
      spec.send({ t: 'startRound', minutes: 3, bots: 30 });
      await waitFor(() => roundOf(spec)?.remainingMs === 180_000);
    });
  });
});

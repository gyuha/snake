import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import {
  BOT_MAX, MAX_SEGMENTS, MSCPS, NO_KILLER, ProtocolError, ROUND_MAX_MINUTES, ROUND_MIN_MINUTES, SECTOR_SIZE,
  SEG_SPACING, TICK_DT, TICK_HZ, WORLD_RADIUS, Writer, decodeClient, dequantizeAngle8, encodeServer,
  sanitizeName, type ClientMsg, type RoundState, type ServerMsg,
} from '@snake/shared';
import { World } from './game/world';
import { buildFrame, buildMinimap } from './net/interest';
import { buildOverview } from './net/overview';
import { Session } from './net/session';

export interface ServerStats {
  ticks: number;
  lastTickMs: number;
  avgTickMs: number;
  maxTickMs: number;
  bytesSent: number;
}

export interface ServerOptions {
  port: number;
  rng?: () => number;
  initialFood?: number;
  beforeTick?: (world: World, tick: number) => void;
  /** Called on every round start with the requested bot count, before the world is refilled. */
  onStartRound?: (bots: number) => void;
  /** Addresses sent to spectators so they can build a join link; defaults to this machine's LAN IPv4s. */
  lanHosts?: string[];
  /** Wall clock in ms; injectable so tests can move round time without waiting. */
  now?: () => number;
}

export interface GameServer {
  port: number;
  world: World;
  stats: ServerStats;
  sessions: Set<Session>;
  close(): Promise<void>;
}

const SOFT_BUFFER_LIMIT = 256 * 1024;
const HARD_BUFFER_LIMIT = 2 * 1024 * 1024;
const SLOW_TICK_MS = 50;
const POLICY_VIOLATION = 1008;
const OVERVIEW_EVERY_TICKS = 6; // 5 Hz at 30 Hz ticks

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((list) => list ?? [])
    .filter((a) => a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

function toBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function single(msg: ServerMsg): Uint8Array {
  const w = new Writer();
  encodeServer(w, msg);
  return w.finish();
}

export async function startServer(opts: ServerOptions): Promise<GameServer> {
  const world = new World(opts.rng ?? Math.random, opts.initialFood);
  const sessions = new Set<Session>();
  const stats: ServerStats = { ticks: 0, lastTickMs: 0, avgTickMs: 0, maxTickMs: 0, bytesSent: 0 };
  const now = opts.now ?? Date.now;
  const lanHosts = opts.lanHosts ?? lanAddresses();
  const round: { state: RoundState; endsAt: number; seq: number } = { state: 'none', endsAt: 0, seq: 0 };

  const send = (session: Session, bytes: Uint8Array): void => {
    if (session.socket.readyState !== WebSocket.OPEN) return;
    session.socket.send(bytes);
    stats.bytesSent += bytes.length;
  };

  const roundMsg = (): Uint8Array => single({
    t: 'round',
    state: round.state,
    seq: round.seq,
    remainingMs: round.state === 'running' ? Math.max(0, round.endsAt - now()) : 0,
  });

  const broadcastRound = (): void => {
    const bytes = roundMsg();
    for (const s of sessions) send(s, bytes);
  };

  /** 0 minutes starts a free game: state 'none', no clock and no end. Scores restart from zero: every snake is replaced silently and players get a fresh one under their own name. */
  const startRound = (minutes: number, bots: number): void => {
    opts.onStartRound?.(bots);
    const players = [...sessions].filter((s) => s.view.snake?.alive);
    const old = new Map(players.map((s) => [s, s.view.snake!]));
    world.clearSnakes();
    for (const [session, was] of old) {
      const s = world.spawnSnake(was.name, was.skin, false, was.animal);
      session.view.snake = s;
      send(session, single({
        t: 'welcome', selfId: s.id, worldRadius: WORLD_RADIUS, sectorSize: SECTOR_SIZE,
        segSpacing: SEG_SPACING, tickHz: TICK_HZ, mscps: MSCPS, maxSegments: MAX_SEGMENTS,
      }));
    }
    round.state = minutes === 0 ? 'none' : 'running';
    round.endsAt = now() + minutes * 60_000;
    round.seq = (round.seq + 1) & 0xff;
    broadcastRound();
  };

  const handle = (session: Session, msg: ClientMsg): void => {
    const own = session.view.snake && session.view.snake.alive ? session.view.snake : null;
    switch (msg.t) {
      case 'join': {
        if (own || session.spectator || round.state === 'ended') return;
        const s = world.spawnSnake(sanitizeName(msg.name), msg.skin, false, msg.animal);
        session.view.snake = s;
        send(session, single({
          t: 'welcome', selfId: s.id, worldRadius: WORLD_RADIUS, sectorSize: SECTOR_SIZE,
          segSpacing: SEG_SPACING, tickHz: TICK_HZ, mscps: MSCPS, maxSegments: MAX_SEGMENTS,
        }));
        return;
      }
      case 'steer':
        own?.setInput(dequantizeAngle8(msg.angle), own.wantBoost);
        return;
      case 'boost':
        own?.setInput(own.wang, msg.on);
        return;
      case 'spectate':
        // Until this arrives the socket is an ordinary pre-join viewer and may get one view frame.
        if (own) return;
        session.spectator = true;
        send(session, single({ t: 'serverInfo', hosts: lanHosts }));
        return;
      case 'startRound':
        if (!session.spectator) return;
        if (msg.minutes < ROUND_MIN_MINUTES || msg.minutes > ROUND_MAX_MINUTES || msg.bots > BOT_MAX) return;
        startRound(msg.minutes, msg.bots);
        return;
      case 'ping':
        send(session, single({ t: 'pong' }));
        return;
    }
  };

  const http = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('snake server\n');
  });
  const wss = new WebSocketServer({ server: http, maxPayload: 1024 });

  wss.on('connection', (socket) => {
    const session = new Session(socket);
    sessions.add(session);
    send(session, roundMsg());

    socket.on('message', (data: RawData, isBinary: boolean) => {
      if (!isBinary) {
        socket.close(POLICY_VIOLATION, 'binary frames only');
        return;
      }
      const verdict = session.admit(Date.now());
      if (verdict === 'close') {
        socket.close(POLICY_VIOLATION, 'rate limit');
        return;
      }
      if (verdict === 'drop') return;
      let msg: ClientMsg;
      try {
        msg = decodeClient(toBytes(data));
      } catch (err) {
        if (err instanceof ProtocolError) {
          socket.close(POLICY_VIOLATION, 'protocol error');
          return;
        }
        throw err;
      }
      handle(session, msg);
    });

    socket.on('close', () => {
      sessions.delete(session);
      const s = session.view.snake;
      if (s && s.alive) world.killSnake(s, NO_KILLER);
      session.view.snake = null;
    });

    socket.on('error', () => socket.terminate());
  });

  const tick = (): void => {
    const t0 = performance.now();
    if (round.state === 'running' && now() >= round.endsAt) {
      round.state = 'ended';
      broadcastRound();
    }
    if (round.state !== 'ended') {
      opts.beforeTick?.(world, stats.ticks);
      world.tick(TICK_DT);
    }
    stats.ticks++;

    const extrasDue = stats.ticks % TICK_HZ === 0;
    if (extrasDue && round.state === 'running') broadcastRound();
    const ranked = extrasDue ? world.leaderboard() : undefined;
    const minimap = extrasDue ? buildMinimap(world) : undefined;
    const deaths = new Map(world.deaths.map((d) => [d.snake.id, d]));
    let overview: Uint8Array | undefined;
    if (stats.ticks % OVERVIEW_EVERY_TICKS === 0) {
      for (const s of sessions) {
        if (s.spectator) {
          overview = single(buildOverview(world));
          break;
        }
      }
    }

    for (const session of sessions) {
      const buffered = session.socket.bufferedAmount;
      if (buffered > HARD_BUFFER_LIMIT) {
        session.socket.terminate();
        continue;
      }
      if (session.spectator) {
        if (overview && buffered <= SOFT_BUFFER_LIMIT) send(session, overview);
        continue;
      }
      const light = buffered > SOFT_BUFFER_LIMIT;
      const own = session.view.snake;
      const death = own ? deaths.get(own.id) : undefined;
      const frame = buildFrame(session.view, world, {
        ranked: light ? undefined : ranked,
        minimap: light ? undefined : minimap,
        death,
      });
      if (death) session.view.snake = null;
      if (frame) send(session, frame);
    }
    world.endTick();

    const dt = performance.now() - t0;
    stats.lastTickMs = dt;
    stats.avgTickMs += (dt - stats.avgTickMs) / stats.ticks;
    stats.maxTickMs = Math.max(stats.maxTickMs, dt);
    if (dt > SLOW_TICK_MS) console.warn(`[server] slow tick: ${dt.toFixed(1)} ms`);
  };

  let running = true;
  let timer: NodeJS.Timeout | null = null;
  let next = performance.now();
  const loop = (): void => {
    if (!running) return;
    tick();
    next += 1000 / TICK_HZ;
    const now = performance.now();
    if (now - next > SLOW_TICK_MS) next = now;
    timer = setTimeout(loop, Math.max(0, next - now));
  };

  await new Promise<void>((resolve) => http.listen(opts.port, resolve));
  const port = (http.address() as AddressInfo).port;
  timer = setTimeout(loop, 0);

  const close = async (): Promise<void> => {
    running = false;
    if (timer) clearTimeout(timer);
    for (const s of sessions) s.socket.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => http.close(() => resolve()));
  };

  return { port, world, stats, sessions, close };
}

import { BOT_TARGET } from '@snake/shared';
import { BotController } from './bots/bot';
import { startServer } from './server';

const port = Number(process.env.PORT ?? 8080);
const bots = new BotController();
const server = await startServer({ port, beforeTick: (world, tick) => bots.update(world, tick) });
// Bots spawn on the first tick, so report the target rather than the current count.
console.log(`[server] listening on ws://localhost:${server.port} (bots: ${BOT_TARGET})`);

const shutdown = (): void => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

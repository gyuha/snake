import { startServer } from './server';

const port = Number(process.env.PORT ?? 8080);
const server = await startServer({ port });
console.log(`[server] listening on ws://localhost:${server.port}`);

const shutdown = (): void => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

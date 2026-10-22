import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('../../', import.meta.url)), 'PORT');
  return {
    define: {
      'import.meta.env.VITE_WS_PORT': JSON.stringify(process.env.PORT ?? env.PORT ?? '8080'),
    },
    server: { port: 5173, host: true },
    build: {
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          status: fileURLToPath(new URL('./status.html', import.meta.url)),
        },
      },
    },
  };
});

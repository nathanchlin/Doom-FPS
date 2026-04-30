import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    ssr: 'src/server/main.ts',
    outDir: 'dist-server',
    target: 'node22',
    rollupOptions: {
      external: ['ws', 'node:http', 'node:fs', 'node:path', 'node:url', 'node:os'],
    },
  },
});

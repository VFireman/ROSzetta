import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Плагин: на все ответы dev-сервера ставит Cache-Control: no-store.
// Решает проблему, когда браузер/прокси кэшируют HMR-обновлённые файлы.
const noCache = () => ({
  name: 'roszetta-no-cache',
  configureServer(server: any) {
    server.middlewares.use((_req: any, res: any, next: any) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      next();
    });
  },
});

export default defineConfig({
  plugins: [react(), noCache()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      // Под Docker bind-mount inotify иногда не отрабатывает — fallback на polling.
      usePolling: true,
      interval: 500,
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://backend:8000',
        changeOrigin: true,
      },
    },
  },
});

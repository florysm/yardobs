import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import { readFileSync } from 'fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    // A second, transpiled + polyfilled bundle for old Safari (an iPad 4 tops
    // out at iOS 10.3, which can't parse `?.` / `??`). Modern browsers never
    // download it; it loads only where the modern bundle can't run.
    legacy({ targets: ['ios >= 10', 'safari >= 10'] }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: { vendor: ['react', 'react-dom'], map: ['leaflet', 'react-leaflet'] },
      },
    },
  },
  server: {
    proxy: {
      // Forward /api requests to vercel dev (port 3000) when running `vercel dev`
      // For plain `npm run dev`, start a local vercel dev server separately
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    // Pure-logic unit tests run in Node (no DOM). Component/e2e are a later pass.
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.{js,jsx}', 'api/**/*.test.js'],
  },
});

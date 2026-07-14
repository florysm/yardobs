import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [react()],
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

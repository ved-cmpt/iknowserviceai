import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Windows bind mounts may not deliver file events into containers.
    watch: { usePolling: process.env.VITE_USE_POLLING === 'true' },
    // Same origin in development too, as in production, so the refresh cookie behaves the same.
    proxy: { '/api': process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/tests/setup.js',
    restoreMocks: true,
  },
})

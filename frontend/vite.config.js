import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Preloads the Latin Inter file, whose name Vite hashes, so text renders in it on first paint
// without waiting for the stylesheet to be parsed (ADR-062).
function preloadFonts() {
  return {
    name: 'iks-preload-fonts',
    apply: 'build',
    transformIndexHtml(html, ctx) {
      const fonts = Object.keys(ctx.bundle ?? {}).filter((name) =>
        /inter-latin-wght-normal-[\w-]+\.woff2$/.test(name),
      )
      return fonts.map((name) => ({
        tag: 'link',
        attrs: { rel: 'preload', href: `/${name}`, as: 'font', type: 'font/woff2', crossorigin: '' },
        injectTo: 'head-prepend',
      }))
    },
  }
}

export default defineConfig({
  plugins: [react(), preloadFonts()],
  build: {
    // An inlined font would be a data: URL, which the Content-Security-Policy's font-src refuses.
    assetsInlineLimit: 0,
  },
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

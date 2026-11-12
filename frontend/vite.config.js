import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The first path segments that belong to the app page, as on the server (backend/app/core/spa.py).
const APP_SEGMENTS = new Set(['app', 'login', 'dashboard', 'requests', 'knowledge', 'support', 'admin'])

// The development server's version of the server's fallback: app paths get app.html, and
// everything else falls through to Vite, which serves the website's index.html (ADR-063).
function appPageFallback() {
  return {
    name: 'iks-app-page-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [path] = (req.url ?? '').split('?')
        const first = path.split('/')[1] ?? ''
        const accepts = req.headers.accept ?? ''
        if (APP_SEGMENTS.has(first) && !path.includes('.') && accepts.includes('text/html')) {
          req.url = '/app.html'
        }
        next()
      })
    },
  }
}

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
  plugins: [react(), preloadFonts(), appPageFallback()],
  build: {
    rollupOptions: {
      input: { index: resolve(import.meta.dirname, 'index.html'), app: resolve(import.meta.dirname, 'app.html') },
    },
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

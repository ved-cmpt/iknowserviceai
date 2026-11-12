// Where the app's pages lived before they moved under /app (ADR-063). The server sends these to the
// app page, and the app rewrites the address before it starts, so old links and bookmarks still work.
// Keep this list in step with APP_SEGMENTS in backend/app/core/spa.py.
export const APP_BASE = '/app'
const LEGACY_SEGMENTS = ['login', 'dashboard', 'requests', 'knowledge', 'support', 'admin']

// Returns the /app address for an old path, or null when the path needs no change.
export function legacyRedirect({ pathname, search = '', hash = '' }) {
  const first = pathname.split('/')[1] ?? ''
  if (!LEGACY_SEGMENTS.includes(first)) return null
  return `${APP_BASE}${pathname}${search}${hash}`
}

// A full address inside the app, for plain links from outside its router, such as the website.
export function appHref(path = '/') {
  return path === '/' ? `${APP_BASE}/` : `${APP_BASE}${path}`
}

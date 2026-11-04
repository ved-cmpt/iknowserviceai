import { vi } from 'vitest'

export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export function errorResponse(status, code, message, { extra = {}, headers = {} } = {}) {
  return jsonResponse({ error: { code, message, request_id: 'test-request-id' }, ...extra }, status, headers)
}

// Routes fetch calls by "METHOD /path" prefix. Each handler returns a fresh Response.
export function mockFetch(routes) {
  const mock = vi.fn(async (url, options = {}) => {
    const parsed = new URL(url, 'http://localhost')
    const path = parsed.pathname.replace(/^\/api\/v1/, '')
    const search = parsed.search
    const key = `${options.method ?? 'GET'} ${path}`
    const handler = routes[key]
    if (!handler) throw new Error(`Unexpected fetch: ${key}${search}`)
    return handler({ url, options, search, body: options.body ? JSON.parse(options.body) : undefined })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

// Calls made to one route, as parsed JSON bodies or query strings.
export function callsTo(fetchMock, method, path) {
  return fetchMock.mock.calls.filter(([url, options = {}]) => {
    const parsed = new URL(url, 'http://localhost')
    return (
      (options.method ?? 'GET') === method && parsed.pathname.replace(/^\/api\/v1/, '') === path
    )
  })
}

export function bodiesSentTo(fetchMock, method, path) {
  return callsTo(fetchMock, method, path).map(([, options]) => JSON.parse(options.body))
}

export function page(items, overrides = {}) {
  return jsonResponse({ items, total: items.length, limit: 20, offset: 0, ...overrides })
}

export function countsResponse(counts = {}) {
  const all = {
    NEW: 0,
    ANALYZING: 0,
    TRIAGED: 0,
    NEEDS_HUMAN_REVIEW: 0,
    IN_PROGRESS: 0,
    RESOLVED: 0,
    CLOSED: 0,
    ...counts,
  }
  return jsonResponse({ counts: all, total: Object.values(all).reduce((a, b) => a + b, 0) })
}

export const HEALTH = {
  'GET /healthz': () => jsonResponse({ status: 'ok' }),
  'GET /config': () => jsonResponse({ demo_mode: true, demo_password_hint: 'public-demo-hint' }),
}

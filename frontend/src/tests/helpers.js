import { vi } from 'vitest'

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function errorResponse(status, code, message) {
  return jsonResponse({ error: { code, message, request_id: 'test-request-id' } }, status)
}

// Routes fetch calls by "METHOD /path" prefix. Each handler returns a fresh Response.
export function mockFetch(routes) {
  const mock = vi.fn(async (url, options = {}) => {
    const path = new URL(url).pathname.replace(/^\/api\/v1/, '')
    const search = new URL(url).search
    const key = `${options.method ?? 'GET'} ${path}`
    const handler = routes[key]
    if (!handler) throw new Error(`Unexpected fetch: ${key}${search}`)
    return handler({ url, options, search })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

// Central API client: base URL, bearer token, session refresh, timeout and normalized errors.

// The API shares the page's origin, in production and through the Vite proxy in development.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '')
const DEFAULT_TIMEOUT_MS = 10000
const CSRF_HEADER = { 'X-Requested-With': 'iknowserviceai' }
const REFRESH_LOCK = 'iknowserviceai-refresh'

// The access token lives in module memory only. The refresh token is in an HttpOnly cookie that
// JavaScript cannot read (ADR-045). Neither is ever written to browser storage.
let accessToken = null
let onUnauthorized = null
let refreshInFlight = null

export function setAccessToken(token) {
  accessToken = token
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

export class ApiError extends Error {
  constructor({ status, code, message, requestId, retryAfter, retryable, attemptsRemaining }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.retryAfter = retryAfter ?? null // Seconds, from the Retry-After header.
    this.retryable = retryable ?? null // Analyze failures only.
    this.attemptsRemaining = attemptsRemaining ?? null // Analyze failures only.
  }
}

async function parseBody(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function parseRetryAfter(response) {
  const seconds = Number(response.headers.get('Retry-After'))
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

async function sendRefresh() {
  try {
    const response = await fetch(`${BASE_URL}/auth/refresh`, { method: 'POST', headers: CSRF_HEADER })
    if (!response.ok) return null
    const session = await response.json()
    accessToken = session.access_token
    return session
  } catch {
    return null
  }
}

// Exchanges the cookie for a new access token, returning the session or null. Rotation makes a
// repeated token look stolen, so only one refresh may run at a time: the shared promise covers this
// tab, and the lock covers other tabs, which then send the newer cookie.
export function refreshSession() {
  if (!refreshInFlight) {
    const locks = globalThis.navigator?.locks
    const work = locks ? locks.request(REFRESH_LOCK, sendRefresh) : sendRefresh()
    refreshInFlight = work.finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

// Ends the session on the server and clears the cookie. Signing out locally still happens if this
// fails, so the caller does not wait on the outcome.
export async function endSession() {
  try {
    await fetch(`${BASE_URL}/auth/logout`, { method: 'POST', headers: CSRF_HEADER })
  } catch {
    // Offline: the cookie stays until it expires. There is nothing more to do from here.
  }
}

async function send(path, { method, body, timeoutMs }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  try {
    return await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (cause) {
    const timedOut = cause?.name === 'AbortError'
    throw new ApiError({
      status: 0,
      code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: timedOut
        ? 'The server took too long to respond.'
        : 'Could not reach the server.',
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function apiFetch(path, { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const options = { method, body, timeoutMs }
  let response = await send(path, options)

  // An expired access token gets one silent refresh and one retry. A failed sign-in is also a 401,
  // but there is no session to refresh in that case. A 401 means nothing ran, so a retry is safe.
  if (response.status === 401 && accessToken) {
    const session = await refreshSession()
    if (session) {
      response = await send(path, options)
    }
  }

  const data = await parseBody(response)
  if (response.ok) return data

  if (response.status === 401 && accessToken && onUnauthorized) onUnauthorized()

  throw new ApiError({
    status: response.status,
    code: data?.error?.code ?? 'UNKNOWN_ERROR',
    message: data?.error?.message ?? 'Something went wrong.',
    requestId: data?.error?.request_id ?? response.headers.get('X-Request-ID'),
    retryAfter: parseRetryAfter(response),
    retryable: data?.retryable,
    attemptsRemaining: data?.attempts_remaining,
  })
}

// Builds a query string, leaving out empty filter values.
export function withQuery(path, params = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  }
  const text = query.toString()
  return text ? `${path}?${text}` : path
}

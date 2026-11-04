// Central API client: base URL, bearer token, timeout and normalized errors.

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1').replace(
  /\/$/,
  '',
)
const DEFAULT_TIMEOUT_MS = 10000

// The token lives in module memory only (ADR-009). It is never written to browser storage.
let accessToken = null
let onUnauthorized = null

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

export async function apiFetch(path, { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  let response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
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

  const data = await parseBody(response)
  if (response.ok) return data

  // A failed sign-in is also a 401, but there is no session to clear in that case.
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

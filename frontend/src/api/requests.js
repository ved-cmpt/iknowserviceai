// Helpers for the request workflow endpoints. See docs/API.md for the shapes.
import { apiFetch, withQuery } from './client'

// One analysis can make 2 provider calls at the 45-second timeout, plus backoff.
const ANALYZE_TIMEOUT_MS = 120000

export function requestsPath(params) {
  return withQuery('/requests', params)
}

export function requestCountsPath(params) {
  return withQuery('/requests/counts', params)
}

export function requestPath(id) {
  return `/requests/${encodeURIComponent(id)}`
}

/** @param {{ title: string, description: string }} body */
export function createRequest(body) {
  return apiFetch('/requests', { method: 'POST', body })
}

export function analyzeRequest(id) {
  return apiFetch(`${requestPath(id)}/analyze`, { method: 'POST', timeoutMs: ANALYZE_TIMEOUT_MS })
}

/** @param {{ body: string, is_internal?: boolean }} body */
export function addComment(id, body) {
  return apiFetch(`${requestPath(id)}/comments`, { method: 'POST', body })
}

/** @param {{ helpful: boolean, comment?: string }} body */
export function submitFeedback(id, body) {
  return apiFetch(`${requestPath(id)}/feedback`, { method: 'POST', body })
}

/** @param {{ expected_version: number, assigned_agent_id?: string|null, priority?: string, category?: string, status?: string, reason?: string }} body */
export function updateRequest(id, body) {
  return apiFetch(requestPath(id), { method: 'PATCH', body })
}

/** @param {{ decision: 'APPROVED'|'REJECTED', published_reply?: string, review_reason: string, expected_suggestion_id: string, next_status?: string }} body */
export function reviewRequest(id, body) {
  return apiFetch(`${requestPath(id)}/review`, { method: 'POST', body })
}

// Runs the server's review checks without saving anything. The real review checks again.
export function validateReview(id, body) {
  return apiFetch(`${requestPath(id)}/review`, { method: 'POST', body: { ...body, dry_run: true } })
}

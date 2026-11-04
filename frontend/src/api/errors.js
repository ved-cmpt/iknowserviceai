// The one place that turns API error codes into words people can act on.

const MESSAGES = {
  // Conflicts
  STALE_UPDATE: 'Someone else changed this request. Reload to see the latest version.',
  STALE_REVIEW: 'A newer AI suggestion exists. Reload to review the latest version.',
  ALREADY_REVIEWED: 'This suggestion has already been reviewed. Reload to see the decision.',
  NO_PENDING_SUGGESTION: 'This request has no suggestion waiting for review. Reload to check.',
  INVALID_STATE: 'This request has moved on. Reload to see where it is now.',
  INVALID_TRANSITION: 'That status change is not allowed from the current status. Reload and try again.',
  REQUEST_CLOSED: 'This request is closed and can no longer be changed.',
  SLUG_CONFLICT: 'Another article already uses this slug. Choose a different one.',
  FEEDBACK_EXISTS: 'You have already rated this suggestion. Thank you!',
  NO_VISIBLE_SUGGESTION: 'This suggestion is no longer available. Reload to see the latest version.',

  // Analysis
  ANALYSIS_IN_PROGRESS: 'Analysis is already running. Check again in a moment.',
  ANALYSIS_SUPERSEDED: 'A newer analysis replaced this one. Reload to see the latest result.',
  ANALYZE_LIMIT_REACHED: 'Our support team will triage this manually.',
  ANALYSIS_FAILED: 'We could not analyze this request right now. Your request is saved.',
  AI_TIMEOUT: 'The AI provider took too long to respond. The request is saved.',
  AI_RATE_LIMITED: 'The AI provider is busy right now. The request is saved.',
  AI_UNAVAILABLE: 'The AI provider is unavailable. The request is saved.',
  AI_INVALID_OUTPUT: 'The AI provider returned an unusable answer. The request is saved.',
  AI_AUTH: 'The AI provider rejected the configured credentials. The request is saved.',

  // Input
  UNSAFE_REPLY:
    'This reply appears to ask for a password, code or token, so it cannot be published. ' +
    'Remove that wording and try again.',
  INVALID_ASSIGNEE: 'That person cannot be assigned. Choose an active support team member.',

  // Public demo limits
  DEMO_LIMIT_REACHED: 'This demo account has reached its daily request limit. Data resets daily.',
  DEMO_CAPACITY_REACHED: 'The public demo is busy; data resets daily. Please try again later.',

  // Access and transport
  UNAUTHORIZED: 'Your session has ended. Please sign in again.',
  FORBIDDEN: "You don't have access to do that.",
  NETWORK_ERROR: 'Could not reach the server. Check your connection and try again.',
  TIMEOUT: 'The server took too long to respond. Please try again.',
  NOT_READY: 'The service is starting up. Please try again in a moment.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
}

function waitText(seconds) {
  if (!seconds) return 'Too many attempts. Please wait a moment and try again.'
  if (seconds < 90) {
    return `Too many attempts. Please wait ${seconds} ${seconds === 1 ? 'second' : 'seconds'} and try again.`
  }
  const minutes = Math.ceil(seconds / 60)
  return `Too many attempts. Please wait about ${minutes} minutes and try again.`
}

export function friendlyMessage(error) {
  if (!error) return 'Something went wrong. Please try again.'
  if (error.code === 'RATE_LIMITED') return waitText(error.retryAfter)
  return MESSAGES[error.code] ?? error.message ?? 'Something went wrong. Please try again.'
}

// Codes that mean the page is out of date, so reloading it is the fix.
const RELOAD_CODES = new Set([
  'STALE_UPDATE',
  'STALE_REVIEW',
  'ALREADY_REVIEWED',
  'NO_PENDING_SUGGESTION',
  'INVALID_STATE',
  'INVALID_TRANSITION',
  'REQUEST_CLOSED',
  'NO_VISIBLE_SUGGESTION',
  'ANALYSIS_SUPERSEDED',
])

export function needsReload(error) {
  return RELOAD_CODES.has(error?.code)
}

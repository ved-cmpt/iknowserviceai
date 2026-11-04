import { friendlyMessage } from '../api/errors'

export const MANUAL_TRIAGE = 'Our support team will triage this manually.'

// Decides what to offer after a failed analysis. Branches on status and `retryable`, never on a
// provider code, because a requester only ever receives ANALYSIS_FAILED (ADR-028).
export function describeFailure(error) {
  if (error.code === 'ANALYSIS_IN_PROGRESS') {
    return { tone: 'info', message: friendlyMessage(error), action: 'reload' }
  }
  if (error.code === 'ANALYZE_LIMIT_REACHED' || (error.status === 503 && error.retryable === false)) {
    return {
      tone: 'warning',
      message: `Your request is saved, but we could not analyze it. ${MANUAL_TRIAGE}`,
      action: null,
    }
  }
  if (error.status === 503) {
    return {
      tone: 'warning',
      message: 'Your request is saved, but we could not analyze it right now.',
      action: 'retry',
      attemptsRemaining: error.attemptsRemaining,
    }
  }
  return {
    tone: 'warning',
    message: `Your request is saved. ${friendlyMessage(error)}`,
    action: 'retry',
  }
}

import { friendlyMessage } from '../api/errors'

export const MANUAL_TRIAGE = 'Our support team will triage this manually.'

// Decides what to offer after a failed analysis. Branches on status and `retryable`, never on a
// provider code, because a requester only ever receives ANALYSIS_FAILED (ADR-028).
export function describeFailure(error, { staff = false } = {}) {
  const saved = staff ? 'The request is saved' : 'Your request is saved'
  if (error.code === 'ANALYSIS_IN_PROGRESS') {
    return { tone: 'info', message: friendlyMessage(error), action: 'reload' }
  }
  const limitReached = error.code === 'ANALYZE_LIMIT_REACHED'
  if (limitReached || (error.status === 503 && error.retryable === false)) {
    const staffMessage = limitReached ? 'No analysis attempts remain.' : friendlyMessage(error)
    return {
      tone: 'warning',
      message: staff
        ? `${staffMessage} Triage this request manually.`
        : `${saved}, but we could not analyze it. ${MANUAL_TRIAGE}`,
      action: null,
    }
  }
  if (error.status === 503) {
    return {
      tone: 'warning',
      message: staff ? friendlyMessage(error) : `${saved}, but we could not analyze it right now.`,
      action: 'retry',
      attemptsRemaining: error.attemptsRemaining,
    }
  }
  return { tone: 'warning', message: `${saved}. ${friendlyMessage(error)}`, action: 'retry' }
}

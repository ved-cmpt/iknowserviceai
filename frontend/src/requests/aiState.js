export const AI_LABEL = 'AI-generated suggestion — verify before acting'
export const REVIEWED_LABEL = 'Reviewed by the support team'
export const AWAITING_REVIEW_TEXT =
  "A support team member is reviewing this request. We'll show guidance here once it's approved."

// Exactly one state applies. `suggestion` is only ever read in the "suggestion" state, so held
// text could not be shown even if a response wrongly included it.
// Only text a person approved may say so. Anything unrecognized keeps the AI label.
export function suggestionLabel(suggestion) {
  return suggestion.source === 'STAFF_REVIEWED' ? REVIEWED_LABEL : AI_LABEL
}

export function aiSectionState({ request, running, failure }) {
  if (running) return 'analyzing'
  if (failure) return 'failed'
  if (request.suggestion_state === 'AWAITING_STAFF_REVIEW') return 'awaiting'
  if (request.suggestion_state === 'AVAILABLE' && request.suggestion) return 'suggestion'
  if (request.status === 'ANALYZING') return 'running-elsewhere'
  if (request.status === 'NEW') return 'none'
  return null
}

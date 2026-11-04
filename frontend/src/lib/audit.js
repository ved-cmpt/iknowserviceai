export const AUDIT_ACTIONS = [
  ['auth.login_success', 'Sign-in succeeded'],
  ['auth.login_failure', 'Sign-in failed'],
  ['request.created', 'Request created'],
  ['request.assigned', 'Request assigned'],
  ['request.unassigned', 'Request unassigned'],
  ['request.priority_changed', 'Priority changed'],
  ['request.category_changed', 'Category changed'],
  ['request.status_changed', 'Status changed'],
  ['request.comment_added', 'Comment added'],
  ['request.ai_analysis_started', 'AI analysis started'],
  ['request.ai_analysis_succeeded', 'AI analysis succeeded'],
  ['request.ai_analysis_failed', 'AI analysis failed'],
  ['request.review_approved', 'Review approved'],
  ['request.review_rejected', 'Review rejected'],
  ['request.suggestion_withheld', 'Suggestion withheld'],
  ['request.feedback_added', 'Feedback added'],
  ['knowledge.created', 'Article created'],
  ['knowledge.updated', 'Article updated'],
  ['knowledge.published', 'Article published'],
  ['knowledge.unpublished', 'Article unpublished'],
  ['knowledge.status_changed', 'Article status changed'],
]

export const AUDIT_ENTITIES = [
  ['service_request', 'Request'],
  ['knowledge_article', 'Article'],
  ['auth', 'Sign-in'],
]

const ACTION_LABELS = Object.fromEntries(AUDIT_ACTIONS)
const ENTITY_LABELS = Object.fromEntries(AUDIT_ENTITIES)

export function auditActionLabel(action) {
  return ACTION_LABELS[action] ?? action
}

export function auditEntityLabel(entityType) {
  return ENTITY_LABELS[entityType] ?? entityType
}

// The API already keeps secrets and reply text out of audit metadata. This is a second layer, so
// a mistake there would not reach the screen. Only simple values with safe-looking names show.
const UNSAFE_KEY = /reply|body|password|secret|token|credential|key|prompt|input/i
const MAX_VALUE_LENGTH = 80

export function metadataSummary(metadata) {
  return Object.entries(metadata ?? {})
    .filter(([key, value]) => {
      if (UNSAFE_KEY.test(key)) return false
      if (Array.isArray(value)) return value.every((item) => typeof item === 'string')
      return ['string', 'number', 'boolean'].includes(typeof value)
    })
    .map(([key, value]) => {
      const text = String(Array.isArray(value) ? value.join(', ') : value)
      const shown = text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text
      return `${key.replaceAll('_', ' ')}: ${shown}`
    })
    .join(' · ')
}

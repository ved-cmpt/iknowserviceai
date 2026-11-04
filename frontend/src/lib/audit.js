import { categoryLabel } from '../knowledge/categories'
import { priorityLabel, reviewStateLabel, riskFlagLabel, statusLabel } from './labels'

export const AUDIT_ACTIONS = [
  ['auth.login_success', 'Sign-in succeeded'],
  ['auth.login_failure', 'Sign-in failed'],
  ['auth.logout', 'Signed out'],
  ['auth.refresh_reuse_detected', 'Session token reused, session ended'],
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

const KEY_LABELS = {
  error_code: 'Error',
  is_internal: 'Visibility',
  helpful: 'Rating',
}
const DECISION_LABELS = { APPROVED: 'Approved', REJECTED: 'Rejected' }
const MODE_LABELS = { MOCK: 'Mock', GEMINI: 'Live model' }
const SOURCE_LABELS = {
  AI_ANALYSIS: 'AI analysis',
  AI_FAILURE: 'Failed analysis',
  STALE_RECOVERY: 'Stale analysis recovery',
  REVIEW: 'Staff review',
}
const ARTICLE_STATUS_LABELS = { DRAFT: 'Draft', PUBLISHED: 'Published', ARCHIVED: 'Archived' }

// What `from` and `to` hold depends on the action.
function changeLabel(action, value, names) {
  if (action === 'request.status_changed') return statusLabel(value)
  if (action === 'request.priority_changed') return priorityLabel(value)
  if (action === 'request.category_changed') return categoryLabel(value)
  if (action === 'request.assigned' || action === 'request.unassigned') return names[value] ?? value
  return ARTICLE_STATUS_LABELS[value] ?? value
}

function valueLabel(key, value, { action, names }) {
  if (key === 'from' || key === 'to') return changeLabel(action, value, names)
  if (key === 'decision') return DECISION_LABELS[value] ?? value
  if (key === 'review_state') return reviewStateLabel(value)
  if (key === 'risk_flags') return value.map(riskFlagLabel).join(', ')
  if (key === 'mode') return MODE_LABELS[value] ?? value
  if (key === 'source') return SOURCE_LABELS[value] ?? value
  if (key === 'is_internal') return value ? 'Internal' : 'Public'
  if (key === 'helpful') return value ? 'Helpful' : 'Not helpful'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(Array.isArray(value) ? value.join(', ') : value)
}

function keyLabel(key) {
  const text = KEY_LABELS[key] ?? key.replaceAll('_', ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// The database does not keep key order, so a change must be put back to read "From", then "To".
const KEY_ORDER = { from: 0, to: 1 }

function safeEntries(metadata) {
  return Object.entries(metadata ?? {})
    .filter(([key, value]) => {
      if (UNSAFE_KEY.test(key)) return false
      if (Array.isArray(value)) return value.every((item) => typeof item === 'string')
      return ['string', 'number', 'boolean'].includes(typeof value)
    })
    .sort(([a], [b]) => (KEY_ORDER[a] ?? 2) - (KEY_ORDER[b] ?? 2))
}

// Readable details. Record IDs are left to metadataIds, as secondary text.
export function metadataSummary(metadata, { action, names = {} } = {}) {
  return safeEntries(metadata)
    .filter(([key]) => !key.endsWith('_id'))
    .map(([key, value]) => {
      const text = valueLabel(key, value, { action, names })
      const shown = text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text
      return `${keyLabel(key)}: ${shown}`
    })
    .join(' · ')
}

export function metadataIds(metadata) {
  return safeEntries(metadata)
    .filter(([key]) => key.endsWith('_id'))
    .map(([key, value]) => `${key.replaceAll('_', ' ')} ${value}`)
    .join(' · ')
}

import { categoryLabel } from '../knowledge/categories'

export const STATUS_OPTIONS = [
  ['NEW', 'New'],
  ['ANALYZING', 'Analyzing'],
  ['TRIAGED', 'Triaged'],
  ['NEEDS_HUMAN_REVIEW', 'Needs human review'],
  ['IN_PROGRESS', 'In progress'],
  ['RESOLVED', 'Resolved'],
  ['CLOSED', 'Closed'],
]

export const PRIORITY_OPTIONS = [
  ['LOW', 'Low'],
  ['MEDIUM', 'Medium'],
  ['HIGH', 'High'],
  ['URGENT', 'Urgent'],
]

const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS)
const PRIORITY_LABELS = Object.fromEntries(PRIORITY_OPTIONS)
const ROLE_LABELS = { USER: 'Requester', AGENT: 'Support agent', ADMIN: 'Admin' }

const RISK_FLAG_LABELS = {
  ACCOUNT_COMPROMISE: 'Possible account compromise',
  CREDENTIAL_REQUEST: 'Mentions a credential request',
  PHISHING: 'Possible phishing',
  PRIVACY_SENSITIVE: 'Privacy-sensitive information',
  PAYMENT: 'Mentions payment',
  PRIVILEGED_ACCESS: 'Privileged access request',
  ACCOUNT_RECOVERY: 'Account recovery',
  DEVICE_WIPE: 'Device wipe',
  DESTRUCTIVE_ACTION: 'Destructive action',
  PROMPT_INJECTION: 'Possible prompt injection',
  INVALID_CITATION: 'Invalid citation removed',
  NO_CITATIONS: 'No valid citations',
  NO_RELEVANT_KNOWLEDGE: 'No relevant knowledge found',
  LOW_CONFIDENCE: 'Low confidence',
  MODEL_REQUESTED_REVIEW: 'AI requested human review',
  OUTPUT_ASKS_CREDENTIALS: 'AI draft asks for credentials',
  OUTPUT_CLAIMS_ACTION: 'AI draft claims an action was taken',
  OUTPUT_UNSUPPORTED_CONTACT: 'AI draft has an unsupported contact',
  KB_CONTENT_SUSPECT: 'Retrieved article looks suspicious',
}

const RUN_STATUS_LABELS = { STARTED: 'Started', SUCCEEDED: 'Succeeded', FAILED: 'Failed' }

const REVIEW_STATE_LABELS = {
  NOT_REQUIRED: 'Review not required',
  PENDING_REVIEW: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
}

export function statusLabel(value) {
  return STATUS_LABELS[value] ?? value
}

export function priorityLabel(value) {
  return PRIORITY_LABELS[value] ?? value
}

export function roleLabel(value) {
  return ROLE_LABELS[value] ?? value
}

export function riskFlagLabel(value) {
  return RISK_FLAG_LABELS[value] ?? value
}

export function runStatusLabel(value) {
  return RUN_STATUS_LABELS[value] ?? value
}

export function reviewStateLabel(value) {
  return REVIEW_STATE_LABELS[value] ?? value
}

function change(noun, describe, details) {
  return details.from && details.to
    ? `${noun} changed from ${describe(details.from)} to ${describe(details.to)}`
    : `${noun} changed`
}

// Human-readable text for a timeline event. Requesters only receive the first group, because
// the server filters the rest (ADR-014). Unknown types fall back to the raw type for staff.
export function eventLabel(event) {
  const details = event.details ?? {}
  switch (event.event_type) {
    case 'REQUEST_CREATED':
      return 'Request submitted'
    case 'ASSIGNED':
      return 'Assigned to a support team member'
    case 'UNASSIGNED':
      return 'Returned to the support queue'
    case 'PRIORITY_CHANGED':
      return change('Priority', priorityLabel, details)
    case 'CATEGORY_CHANGED':
      return change('Category', categoryLabel, details)
    case 'STATUS_CHANGED':
      return change('Status', statusLabel, details)
    case 'COMMENT_ADDED':
      return details.is_internal ? 'Internal comment added' : 'Comment added'
    case 'AI_ANALYSIS_STARTED':
      return 'AI analysis started'
    case 'AI_ANALYSIS_SUCCEEDED':
      return 'AI analysis finished'
    case 'AI_ANALYSIS_FAILED':
      return 'AI analysis failed'
    case 'SUGGESTION_REVIEWED':
      return details.decision === 'APPROVED'
        ? 'AI suggestion approved'
        : details.decision === 'REJECTED'
          ? 'AI suggestion rejected'
          : 'AI suggestion reviewed'
    case 'SUGGESTION_WITHHELD':
      return 'AI suggestion withheld for review'
    case 'FEEDBACK_ADDED':
      return details.helpful ? 'Requester rated the suggestion helpful' : 'Requester rated the suggestion not helpful'
    default:
      return event.event_type
  }
}

const EVENT_ICONS = {
  REQUEST_CREATED: 'plus',
  ASSIGNED: 'user',
  UNASSIGNED: 'user',
  PRIORITY_CHANGED: 'flag',
  CATEGORY_CHANGED: 'tag',
  STATUS_CHANGED: 'activity',
  COMMENT_ADDED: 'message',
  AI_ANALYSIS_STARTED: 'sparkle',
  AI_ANALYSIS_SUCCEEDED: 'sparkle',
  AI_ANALYSIS_FAILED: 'alert',
  SUGGESTION_REVIEWED: 'shield',
  SUGGESTION_WITHHELD: 'shield',
  FEEDBACK_ADDED: 'message',
}

export function eventIcon(eventType) {
  return EVENT_ICONS[eventType] ?? 'activity'
}

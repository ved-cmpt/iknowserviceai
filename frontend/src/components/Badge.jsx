import { priorityLabel, statusLabel } from '../lib/labels'

const STATUS_TONES = {
  NEW: 'info',
  ANALYZING: 'info',
  TRIAGED: 'neutral',
  NEEDS_HUMAN_REVIEW: 'warning',
  IN_PROGRESS: 'info',
  RESOLVED: 'success',
  CLOSED: 'neutral',
}

const PRIORITY_TONES = {
  LOW: 'neutral',
  MEDIUM: 'neutral',
  HIGH: 'warning',
  URGENT: 'danger',
}

// The text carries the meaning. Color only reinforces it.
export default function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONES[status]}>{statusLabel(status)}</Badge>
}

export function PriorityBadge({ priority }) {
  return <Badge tone={PRIORITY_TONES[priority]}>{priorityLabel(priority)}</Badge>
}

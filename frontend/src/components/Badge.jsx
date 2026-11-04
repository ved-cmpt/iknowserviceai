import { priorityLabel, statusLabel } from '../lib/labels'
import Icon from './icons'

const STATUS_STYLES = {
  NEW: ['info', 'inbox'],
  ANALYZING: ['violet', 'sparkle'],
  TRIAGED: ['teal', 'tag'],
  NEEDS_HUMAN_REVIEW: ['warning', 'eye'],
  IN_PROGRESS: ['info', 'activity'],
  RESOLVED: ['success', 'checkCircle'],
  CLOSED: ['neutral', 'lock'],
}

const PRIORITY_STYLES = {
  LOW: ['neutral', 'arrowDown'],
  MEDIUM: ['info', 'minus'],
  HIGH: ['warning', 'arrowUp'],
  URGENT: ['danger', 'alert'],
}

// The text carries the meaning. Color and icons only reinforce it.
export default function Badge({ tone = 'neutral', icon, children }) {
  return (
    <span className={`badge badge-${tone}`}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  )
}

export function StatusBadge({ status }) {
  const [tone, icon] = STATUS_STYLES[status] ?? []
  return (
    <Badge tone={tone} icon={icon}>
      {statusLabel(status)}
    </Badge>
  )
}

export function PriorityBadge({ priority }) {
  const [tone, icon] = PRIORITY_STYLES[priority] ?? []
  return (
    <Badge tone={tone} icon={icon}>
      {priorityLabel(priority)}
    </Badge>
  )
}

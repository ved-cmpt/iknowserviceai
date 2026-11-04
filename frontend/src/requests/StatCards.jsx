import Icon from '../components/icons'

const OPEN = ['NEW', 'ANALYZING', 'TRIAGED', 'NEEDS_HUMAN_REVIEW', 'IN_PROGRESS']

function sum(counts, statuses) {
  return statuses.reduce((total, status) => total + (counts[status] ?? 0), 0)
}

// The three numbers a requester cares about. Counts are a summary, so a failed load leaves them out.
export default function StatCards({ data }) {
  if (!data) return null
  const cards = [
    ['Open', sum(data.counts, OPEN), 'info', 'inbox'],
    ['Awaiting review', sum(data.counts, ['NEEDS_HUMAN_REVIEW']), 'warning', 'clock'],
    ['Resolved', sum(data.counts, ['RESOLVED', 'CLOSED']), 'success', 'checkCircle'],
  ]
  return (
    <ul className="stat-grid" aria-label="Summary">
      {cards.map(([label, value, tone, icon]) => (
        <li key={label} className="stat-card">
          <span className={`stat-icon stat-${tone}`}>
            <Icon name={icon} size={20} />
          </span>
          <span>
            <span className="stat-value">{value}</span>
            <span className="stat-label">{label}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

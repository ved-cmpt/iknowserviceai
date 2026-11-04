import { useApiData } from '../api/useApiData'
import { STATUS_OPTIONS } from '../lib/labels'

// Counts are a summary, so a failed load simply leaves them out. The list has its own error state.
export default function StatusCounts({ path }) {
  const { data } = useApiData(path)
  if (!data) return null
  return (
    <ul className="count-list" aria-label="Requests by status">
      {STATUS_OPTIONS.map(([status, label]) => (
        <li key={status}>
          <strong>{data.counts[status] ?? 0}</strong>
          {label}
        </li>
      ))}
    </ul>
  )
}

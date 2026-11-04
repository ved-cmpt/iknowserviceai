import { formatDateTime } from '../lib/format'

// items: [{ key, label, detail, time }]
export default function Timeline({ items }) {
  return (
    <ol className="timeline">
      {items.map((item) => (
        <li key={item.key}>
          <span>{item.label}</span>
          {item.detail && <span className="timeline-detail">{item.detail}</span>}
          <time className="timeline-detail" dateTime={item.time}>
            {formatDateTime(item.time)}
          </time>
        </li>
      ))}
    </ol>
  )
}

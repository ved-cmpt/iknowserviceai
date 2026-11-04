import { formatDateTime } from '../lib/format'
import Icon from './icons'

// items: [{ key, label, detail, time, icon }]
export default function Timeline({ items }) {
  return (
    <ol className="timeline">
      {items.map((item) => (
        <li key={item.key}>
          <span className="timeline-marker">
            <Icon name={item.icon ?? 'activity'} size={13} />
          </span>
          <div>
            <span className="timeline-text">{item.label}</span>
            {item.detail && <span className="timeline-detail">{item.detail}</span>}
            <time className="timeline-detail" dateTime={item.time}>
              {formatDateTime(item.time)}
            </time>
          </div>
        </li>
      ))}
    </ol>
  )
}

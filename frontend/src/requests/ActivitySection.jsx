import Card from '../components/Card'
import Timeline from '../components/Timeline'
import { eventIcon, eventLabel } from '../lib/labels'

export default function ActivitySection({ events, describeDetail }) {
  const items = events.map((event, index) => ({
    key: event.id ?? `${event.event_type}-${event.created_at}-${index}`,
    label: eventLabel(event),
    detail: describeDetail?.(event),
    time: event.created_at,
    icon: eventIcon(event.event_type),
  }))
  return (
    <Card title="Timeline">
      {items.length === 0 ? <p className="muted">No activity yet.</p> : <Timeline items={items} />}
    </Card>
  )
}

import { EmptyArt } from './icons'

export default function EmptyState({ title, children, action }) {
  return (
    <div className="empty-state">
      <EmptyArt />
      <strong className="empty-state-title">{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

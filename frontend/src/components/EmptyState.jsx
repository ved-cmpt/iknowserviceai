export default function EmptyState({ title, children, action }) {
  return (
    <div className="empty-state">
      <strong className="empty-state-title">{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

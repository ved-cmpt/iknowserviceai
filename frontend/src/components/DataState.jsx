export function Loading({ label = 'Loading…' }) {
  return (
    <p role="status" className="muted">
      {label}
    </p>
  )
}

export function ErrorNotice({ error, onRetry }) {
  return (
    <div role="alert" className="alert">
      <p style={{ margin: 0 }}>{error?.message ?? 'Something went wrong.'}</p>
      {onRetry && (
        <button type="button" className="secondary" onClick={onRetry} style={{ marginTop: 8 }}>
          Try again
        </button>
      )}
    </div>
  )
}

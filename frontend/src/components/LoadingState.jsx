export function Spinner() {
  return <span className="spinner" aria-hidden="true" />
}

// The placeholder rows hint at the content on the way. Screen readers hear only the label.
export default function LoadingState({ label = 'Loading…', lines = 3 }) {
  return (
    <div className="skeleton-wrap">
      <p className="loading-state" role="status">
        <Spinner />
        <span>{label}</span>
      </p>
      <div aria-hidden="true">
        {Array.from({ length: lines }, (_, index) => (
          <span key={index} className="skeleton-line" />
        ))}
      </div>
    </div>
  )
}

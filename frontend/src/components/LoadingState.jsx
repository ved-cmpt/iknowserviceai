export function Spinner() {
  return <span className="spinner" aria-hidden="true" />
}

export default function LoadingState({ label = 'Loading…' }) {
  return (
    <p className="loading-state" role="status">
      <Spinner />
      <span>{label}</span>
    </p>
  )
}

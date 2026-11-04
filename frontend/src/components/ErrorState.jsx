import { friendlyMessage } from '../api/errors'
import Button from './Button'

export default function ErrorState({ error, message, onRetry, retryLabel = 'Try again' }) {
  return (
    <div role="alert" className="banner banner-danger">
      <p>{message ?? friendlyMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  )
}

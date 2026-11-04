import { useState } from 'react'
import { Link } from 'react-router-dom'
import { friendlyMessage } from '../api/errors'
import { submitFeedback } from '../api/requests'
import Banner from '../components/Banner'
import Button from '../components/Button'
import Card from '../components/Card'
import FormField from '../components/FormField'
import { Spinner } from '../components/LoadingState'
import { AI_LABEL, aiSectionState, AWAITING_REVIEW_TEXT } from './aiState'
import { describeFailure } from './analysisFailure'
import { FEEDBACK_COMMENT_MAX } from './limits'

function Feedback({ requestId, alreadySubmitted }) {
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(
    alreadySubmitted ? 'You have already rated this suggestion. Thank you!' : null,
  )
  const [error, setError] = useState(null)

  const tooLong = comment.trim().length > FEEDBACK_COMMENT_MAX

  async function send(helpful) {
    if (tooLong) return
    setSubmitting(true)
    setError(null)
    try {
      const text = comment.trim()
      await submitFeedback(requestId, { helpful, ...(text ? { comment: text } : {}) })
      setDone('Thank you for your feedback.')
    } catch (cause) {
      if (cause.code === 'FEEDBACK_EXISTS') setDone(friendlyMessage(cause))
      else setError(cause)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h3>Was this helpful?</h3>
      {!done && (
        <FormField
          label="Comment (optional)"
          error={tooLong ? `Keep your comment to ${FEEDBACK_COMMENT_MAX} characters or fewer.` : null}
          count={comment.length}
          max={FEEDBACK_COMMENT_MAX}
        >
          {(field) => (
            <textarea
              {...field}
              rows={2}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          )}
        </FormField>
      )}
      <div className="btn-group">
        <Button variant="secondary" disabled={Boolean(done) || submitting} onClick={() => send(true)}>
          Helpful
        </Button>
        <Button variant="secondary" disabled={Boolean(done) || submitting} onClick={() => send(false)}>
          Not helpful
        </Button>
      </div>
      {done && (
        <p className="meta" role="status" style={{ marginTop: 'var(--space-2)' }}>
          {done}
        </p>
      )}
      {error && (
        <div role="alert" className="field-error">
          {friendlyMessage(error)}
        </div>
      )}
    </div>
  )
}

function SuggestionCard({ requestId, suggestion }) {
  return (
    <Card title="Suggested next steps">
      <span className="ai-label">{AI_LABEL}</span>
      {/* A plain text node with preserved line breaks. Model text is never treated as HTML. */}
      <div className="ai-reply preserve-lines" data-testid="suggestion-reply">
        {suggestion.reply}
      </div>
      {suggestion.citations.length > 0 && (
        <>
          <h3>Sources</h3>
          <ul>
            {suggestion.citations.map((citation) => (
              <li key={citation.id}>
                <Link to={`/knowledge/${citation.id}`}>{citation.title}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <Feedback requestId={requestId} alreadySubmitted={suggestion.feedback_submitted} />
    </Card>
  )
}

function FailedPanel({ failure, running, onAnalyze, onCheckAgain }) {
  const view = describeFailure(failure)
  return (
    <Banner tone={view.tone} title="Analysis did not finish" role="alert">
      <p>{view.message}</p>
      {view.action === 'retry' && (
        <>
          {view.attemptsRemaining !== null && view.attemptsRemaining !== undefined && (
            <p>
              {view.attemptsRemaining} {view.attemptsRemaining === 1 ? 'attempt' : 'attempts'}{' '}
              remaining.
            </p>
          )}
          <Button variant="secondary" size="sm" busy={running} onClick={onAnalyze}>
            Try again
          </Button>
        </>
      )}
      {view.action === 'reload' && (
        <Button variant="secondary" size="sm" onClick={onCheckAgain}>
          Check again
        </Button>
      )}
    </Banner>
  )
}

export default function AiSection({ request, running, failure, onAnalyze, onCheckAgain }) {
  switch (aiSectionState({ request, running, failure })) {
    case 'analyzing':
      return (
        <Card title="AI analysis">
          <p className="loading-state" role="status" aria-live="polite">
            <Spinner />
            <span>Analyzing your request…</span>
          </p>
        </Card>
      )
    case 'failed':
      return (
        <FailedPanel
          failure={failure}
          running={running}
          onAnalyze={onAnalyze}
          onCheckAgain={onCheckAgain}
        />
      )
    case 'awaiting':
      return (
        <Banner tone="info" title="Awaiting staff review" role="status">
          {AWAITING_REVIEW_TEXT}
        </Banner>
      )
    case 'suggestion':
      return <SuggestionCard requestId={request.id} suggestion={request.suggestion} />
    case 'running-elsewhere':
      return (
        <Card title="AI analysis">
          <p className="loading-state" role="status" aria-live="polite">
            <Spinner />
            <span>Analysis is running. It should finish shortly.</span>
          </p>
          <div className="btn-group">
            <Button variant="secondary" size="sm" onClick={onCheckAgain}>
              Check again
            </Button>
            <Button variant="secondary" size="sm" onClick={onAnalyze}>
              Restart analysis
            </Button>
          </div>
        </Card>
      )
    case 'none':
      return (
        <Card title="AI analysis">
          <p>This request has not been analyzed yet.</p>
          <Button onClick={onAnalyze}>Analyze</Button>
        </Card>
      )
    default:
      return null
  }
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { friendlyMessage } from '../api/errors'
import { submitFeedback } from '../api/requests'
import Banner from '../components/Banner'
import Button from '../components/Button'
import Card from '../components/Card'
import FormField from '../components/FormField'
import Icon from '../components/icons'
import { Spinner } from '../components/LoadingState'
import { aiSectionState, AWAITING_REVIEW_TEXT, suggestionLabel } from './aiState'
import AnalysisFailedPanel from './AnalysisFailedPanel'
import { MANUAL_TRIAGE } from './analysisFailure'
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
        <p className="meta space-top" role="status">
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
  // Anything unrecognized keeps the AI treatment, so a mistake errs towards caution.
  const reviewed = suggestion.source === 'STAFF_REVIEWED'
  return (
    <Card title="Suggested next steps" className={reviewed ? 'suggestion-reviewed' : 'suggestion-ai'}>
      <p className="suggestion-note">
        {reviewed ? (
          <span className="staff-mark">
            <Icon name="shield" size={12} />
            Staff
          </span>
        ) : (
          <span className="ai-mark">
            <Icon name="sparkle" size={12} />
            AI
          </span>
        )}
        <span className="ai-label">{suggestionLabel(suggestion)}</span>
      </p>
      {/* A plain text node with preserved line breaks. Model text is never treated as HTML. */}
      <div className="reply-text preserve-lines" data-testid="suggestion-reply">
        {suggestion.reply}
      </div>
      {suggestion.citations.length > 0 && (
        <>
          <h3>Sources</h3>
          <ul className="source-list">
            {suggestion.citations.map((citation) => (
              <li key={citation.id}>
                <Link className="source-chip" to={`/knowledge/${citation.id}`}>
                  <Icon name="book" size={14} />
                  {citation.title}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <Feedback requestId={requestId} alreadySubmitted={suggestion.feedback_submitted} />
    </Card>
  )
}

// A NEW request, possibly after failed attempts. The server says how many remain, so this also
// reads correctly after a reload.
function NotAnalyzed({ request, onAnalyze }) {
  const attempts = request.attempts_remaining
  if (attempts === 0) {
    return (
      <Card title="AI analysis">
        <p>Your request is saved, but we could not analyze it. {MANUAL_TRIAGE}</p>
      </Card>
    )
  }
  if (request.last_analysis_failed) {
    return (
      <Card title="AI analysis">
        <p>The last analysis did not finish. Your request is saved.</p>
        <p>
          {attempts} {attempts === 1 ? 'attempt' : 'attempts'} remaining.
        </p>
        <Button onClick={onAnalyze}>Try again</Button>
      </Card>
    )
  }
  return (
    <Card title="AI analysis">
      <p>This request has not been analyzed yet.</p>
      <Button onClick={onAnalyze}>Analyze</Button>
    </Card>
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
        <AnalysisFailedPanel
          failure={failure}
          running={running}
          onAnalyze={onAnalyze}
          onCheckAgain={onCheckAgain}
        />
      )
    case 'awaiting':
      return (
        <Banner tone="info" title="Awaiting staff review" role="status" icon="clock">
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
      return <NotAnalyzed request={request} onAnalyze={onAnalyze} />

    default:
      return null
  }
}

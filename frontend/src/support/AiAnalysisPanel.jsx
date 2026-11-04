import { Link } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { isAdmin } from '../auth/roles'
import Badge from '../components/Badge'
import Button from '../components/Button'
import Card from '../components/Card'
import { Spinner } from '../components/LoadingState'
import Table from '../components/Table'
import { categoryLabel } from '../knowledge/categories'
import { formatDateTime, formatDuration } from '../lib/format'
import { priorityLabel, reviewStateLabel, riskFlagLabel, runStatusLabel } from '../lib/labels'
import AnalysisFailedPanel from '../requests/AnalysisFailedPanel'

const RUN_COLUMNS = [
  { key: 'time', header: 'Started', primary: true, render: (run) => formatDateTime(run.started_at) },
  { key: 'status', header: 'Result', render: (run) => runStatusLabel(run.status) },
  { key: 'mode', header: 'Mode', render: (run) => run.mode },
  { key: 'model', header: 'Model', render: (run) => run.model_id ?? 'None' },
  { key: 'prompt', header: 'Prompt', render: (run) => run.prompt_version },
  { key: 'duration', header: 'Duration', render: (run) => formatDuration(run.duration_ms) },
  { key: 'error', header: 'Error code', render: (run) => run.error_code ?? 'None' },
]

const REVIEW_TONES = { PENDING_REVIEW: 'warning', APPROVED: 'success', REJECTED: 'danger' }

// Drafts and archived articles can only be opened by an admin, so others see the title alone.
function Citation({ citation, canOpenUnpublished }) {
  const published = citation.status === 'PUBLISHED'
  return (
    <li>
      {published || canOpenUnpublished ? (
        <Link to={`/knowledge/${citation.id}`}>{citation.title}</Link>
      ) : (
        citation.title
      )}
      {!published && <span className="meta"> (not published: {citation.status})</span>}
    </li>
  )
}

function SuggestionDetails({ suggestion, canOpenUnpublished }) {
  const pending = suggestion.review_state === 'PENDING_REVIEW'
  return (
    <>
      <p>
        <Badge tone={REVIEW_TONES[suggestion.review_state]}>
          {reviewStateLabel(suggestion.review_state)}
        </Badge>
      </p>
      <dl className="fact-grid">
        <div>
          <dt>Confidence</dt>
          <dd>{Math.round(suggestion.confidence * 100)}%</dd>
        </div>
        <div>
          <dt>Proposed category</dt>
          <dd>{categoryLabel(suggestion.proposed_category)}</dd>
        </div>
        <div>
          <dt>Proposed priority</dt>
          <dd>{priorityLabel(suggestion.proposed_priority)}</dd>
        </div>
      </dl>
      <h3 style={{ marginTop: 'var(--space-4)' }}>Summary</h3>
      <p className="preserve-lines">{suggestion.summary}</p>
      <h3>Rationale</h3>
      <p className="preserve-lines">{suggestion.rationale_short || 'None given.'}</p>
      <h3>Risk flags</h3>
      {suggestion.risk_flags.length === 0 ? (
        <p className="muted">No risk flags.</p>
      ) : (
        <ul className="flag-list" style={{ marginBottom: 'var(--space-3)' }}>
          {suggestion.risk_flags.map((flag) => (
            <li key={flag}>
              <Badge tone="warning">{riskFlagLabel(flag)}</Badge>
            </li>
          ))}
        </ul>
      )}
      <h3>Citations</h3>
      {suggestion.citations.length === 0 ? (
        <p className="muted">No citations.</p>
      ) : (
        <ul>
          {suggestion.citations.map((citation) => (
            <Citation key={citation.id} citation={citation} canOpenUnpublished={canOpenUnpublished} />
          ))}
        </ul>
      )}
      {/* While a review is pending, the review panel shows the draft instead. */}
      {!pending && (
        <>
          <h3>AI draft</h3>
          <div className="ai-reply preserve-lines">{suggestion.proposed_reply}</div>
        </>
      )}
      {suggestion.published_reply && (
        <>
          <h3>Published reply</h3>
          <div className="ai-reply preserve-lines" data-testid="published-reply">
            {suggestion.published_reply}
          </div>
        </>
      )}
      {suggestion.review_reason && (
        <p>
          <strong>Review reason: </strong>
          <span className="preserve-lines">{suggestion.review_reason}</span>
          {suggestion.reviewed_at && (
            <span className="meta"> ({formatDateTime(suggestion.reviewed_at)})</span>
          )}
        </p>
      )}
      {suggestion.feedback.length > 0 && (
        <>
          <h3>Requester feedback</h3>
          <ul>
            {suggestion.feedback.map((item) => (
              <li key={item.id}>
                {item.helpful ? 'Helpful' : 'Not helpful'}
                {item.comment && <span className="preserve-lines">: {item.comment}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

export default function AiAnalysisPanel({ request, running, failure, onAnalyze, onCheckAgain }) {
  const { user } = useAuth()
  const { suggestion, status, attempts_remaining: attempts } = request
  const canAnalyze = (status === 'NEW' || status === 'ANALYZING') && attempts > 0

  return (
    <Card title="AI analysis">
      {running ? (
        <p className="loading-state" role="status" aria-live="polite">
          <Spinner />
          <span>Analyzing this request…</span>
        </p>
      ) : (
        <>
          {failure && (
            <AnalysisFailedPanel
              staff
              failure={failure}
              running={running}
              onAnalyze={onAnalyze}
              onCheckAgain={onCheckAgain}
            />
          )}
          {suggestion ? (
            <SuggestionDetails suggestion={suggestion} canOpenUnpublished={isAdmin(user)} />
          ) : (
            <p className="muted">This request has no AI suggestion.</p>
          )}
          {canAnalyze && !failure && (
            <p>
              <Button variant="secondary" onClick={onAnalyze}>
                {status === 'ANALYZING' ? 'Restart analysis' : 'Analyze'}
              </Button>{' '}
              <span className="meta">
                {attempts} {attempts === 1 ? 'attempt' : 'attempts'} remaining
              </span>
            </p>
          )}
        </>
      )}
      <h3 style={{ marginTop: 'var(--space-4)' }}>Run history</h3>
      {request.ai_runs.length === 0 ? (
        <p className="muted">No analysis has run.</p>
      ) : (
        <div className="run-list">
          <Table caption="AI run history" columns={RUN_COLUMNS} rows={request.ai_runs} />
        </div>
      )}
    </Card>
  )
}

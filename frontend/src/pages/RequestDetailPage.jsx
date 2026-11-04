import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { requestPath } from '../api/requests'
import { useApiData } from '../api/useApiData'
import { useAuth } from '../auth/authContext'
import { isStaff } from '../auth/roles'
import { PriorityBadge, StatusBadge } from '../components/Badge'
import Button from '../components/Button'
import Card from '../components/Card'
import ErrorState from '../components/ErrorState'
import LoadingState from '../components/LoadingState'
import { categoryLabel } from '../knowledge/categories'
import { formatDateTime } from '../lib/format'
import { usePolling } from '../lib/usePolling'
import ActivitySection from '../requests/ActivitySection'
import AiSection from '../requests/AiSection'
import CommentsSection from '../requests/CommentsSection'
import { useAnalysis, useAutoAnalyze } from '../requests/useAnalysis'
import NotFoundPage from './NotFoundPage'

const POLL_INTERVAL_MS = 5000
const POLL_MAX_DURATION_MS = 5 * 60 * 1000

function RequesterDetail({ id }) {
  const { loading, data, error, reload, setData } = useApiData(requestPath(id))
  const { running, failure, analyze, clearFailure } = useAnalysis(id, {
    onResult: setData,
    reload,
  })
  const autoPending = useAutoAnalyze(Boolean(data), analyze)

  // While someone else holds the next step, keep the page current without a manual reload.
  const waiting = data?.status === 'ANALYZING' || data?.suggestion_state === 'AWAITING_STAFF_REVIEW'
  const { expired, restart } = usePolling(
    () => {
      if (!loading) reload()
    },
    {
      enabled: waiting && !running && !autoPending && !failure,
      intervalMs: POLL_INTERVAL_MS,
      maxDurationMs: POLL_MAX_DURATION_MS,
    },
  )

  if (error?.status === 404) {
    return <NotFoundPage message="This request does not exist, or you do not have access to it." />
  }
  if (!data) {
    return error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState label="Loading request…" />
  }

  return (
    <>
      <p>
        <Link className="back-link" to="/dashboard">
          ← Back to my requests
        </Link>
      </p>
      <div className="page-header">
        <h1>{data.title}</h1>
        <StatusBadge status={data.status} />
      </div>
      {error && !loading && <ErrorState error={error} onRetry={reload} />}
      <div className="detail-grid">
        <div>
          <AiSection
            request={data}
            running={running || autoPending}
            failure={failure}
            onAnalyze={analyze}
            onCheckAgain={() => {
              clearFailure()
              reload()
            }}
          />
          {expired && (
            <p className="meta">
              Automatic updates have paused.{' '}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  restart()
                  reload()
                }}
              >
                Check for updates
              </Button>
            </p>
          )}
          <Card title="Your description">
            <div className="preserve-lines">{data.description}</div>
          </Card>
          <CommentsSection request={data} onAdded={reload} />
        </div>
        <aside className="detail-side" aria-label="Request details">
          <Card title="Details" className="card-compact">
            <dl className="fact-list">
              <div>
                <dt>Category</dt>
                <dd>{categoryLabel(data.category)}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>
                  <PriorityBadge priority={data.priority} />
                </dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd className="mono">{formatDateTime(data.created_at)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd className="mono">{formatDateTime(data.updated_at)}</dd>
              </div>
            </dl>
          </Card>
          <ActivitySection events={data.events} />
        </aside>
      </div>
    </>
  )
}

export default function RequestDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const location = useLocation()

  // Staff receive a different response shape and work from the staff screen.
  if (isStaff(user)) return <Navigate to={`/support/${id}`} replace state={location.state} />
  return <RequesterDetail key={id} id={id} />
}

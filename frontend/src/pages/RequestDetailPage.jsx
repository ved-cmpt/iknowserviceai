import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { requestPath } from '../api/requests'
import { useApiData } from '../api/useApiData'
import { useAuth } from '../auth/authContext'
import { isStaff } from '../auth/roles'
import { PriorityBadge, StatusBadge } from '../components/Badge'
import Card from '../components/Card'
import ErrorState from '../components/ErrorState'
import LoadingState from '../components/LoadingState'
import { categoryLabel } from '../knowledge/categories'
import { formatDateTime } from '../lib/format'
import ActivitySection from '../requests/ActivitySection'
import AiSection from '../requests/AiSection'
import CommentsSection from '../requests/CommentsSection'
import { useAnalysis, useAutoAnalyze } from '../requests/useAnalysis'
import NotFoundPage from './NotFoundPage'

function RequesterDetail({ id }) {
  const { loading, data, error, reload, setData } = useApiData(requestPath(id))
  const { running, failure, analyze, clearFailure } = useAnalysis(id, {
    onResult: setData,
    reload,
  })
  const autoPending = useAutoAnalyze(Boolean(data), analyze)

  if (error?.status === 404) {
    return <NotFoundPage message="This request does not exist, or you do not have access to it." />
  }
  if (!data) {
    return error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState label="Loading request…" />
  }

  return (
    <>
      <p>
        <Link to="/dashboard">← Back to my requests</Link>
      </p>
      {error && !loading && <ErrorState error={error} onRetry={reload} />}
      <Card as="div">
        <div className="card-header">
          <h1>{data.title}</h1>
          <StatusBadge status={data.status} />
        </div>
        <dl className="fact-grid">
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
            <dd>{formatDateTime(data.created_at)}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{formatDateTime(data.updated_at)}</dd>
          </div>
        </dl>
      </Card>
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
      <Card title="Your description">
        <div className="preserve-lines">{data.description}</div>
      </Card>
      <CommentsSection request={data} onAdded={reload} />
      <ActivitySection events={data.events} />
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

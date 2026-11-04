import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { friendlyMessage } from '../api/errors'
import { requestPath, updateRequest } from '../api/requests'
import { useApiData } from '../api/useApiData'
import { useAuth } from '../auth/authContext'
import { useAnnounce } from '../components/announcerContext'
import Avatar from '../components/Avatar'
import { PriorityBadge, StatusBadge } from '../components/Badge'
import Banner from '../components/Banner'
import Button from '../components/Button'
import Card from '../components/Card'
import ErrorState from '../components/ErrorState'
import LoadingState from '../components/LoadingState'
import { categoryLabel } from '../knowledge/categories'
import { formatDateTime } from '../lib/format'
import ActivitySection from '../requests/ActivitySection'
import CommentsSection from '../requests/CommentsSection'
import RunHistory from '../requests/RunHistory'
import { useAnalysis, useAutoAnalyze } from '../requests/useAnalysis'
import AiAnalysisPanel from '../support/AiAnalysisPanel'
import ReviewPanel from '../support/ReviewPanel'
import WorkflowControls from '../support/WorkflowControls'
import ForbiddenPage from './ForbiddenPage'
import NotFoundPage from './NotFoundPage'

function eventDetail(event) {
  return event.details?.reason ? `Reason: ${event.details.reason}` : null
}

function StaffDetail({ id }) {
  const { user } = useAuth()
  const announce = useAnnounce()
  const { loading, data, error, reload, setData } = useApiData(requestPath(id))
  const [conflict, setConflict] = useState(null)
  const { running, failure, analyze, clearFailure } = useAnalysis(id, {
    onResult: setData,
    reload,
  })
  const autoPending = useAutoAnalyze(Boolean(data), analyze)

  if (error?.status === 404) return <NotFoundPage message="This request does not exist." />
  if (error?.status === 403) return <ForbiddenPage />
  if (!data) {
    return error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState label="Loading request…" />
  }

  const selfSubmitted = data.requester.id === user.id
  const reviewPending =
    data.status === 'NEEDS_HUMAN_REVIEW' && data.suggestion?.review_state === 'PENDING_REVIEW'

  // Reloading keeps every form mounted, so typed text is still there afterwards (ADR-034).
  function reloadLatest() {
    setConflict(null)
    reload()
  }

  async function patch(changes, message) {
    const updated = await updateRequest(id, { expected_version: data.version, ...changes })
    setData(updated)
    setConflict(null)
    announce(message)
  }

  return (
    <>
      <p>
        <Link className="back-link" to="/support">
          ← Back to the support queue
        </Link>
      </p>
      <div className="page-header">
        <div>
          <p className="eyebrow">Support request</p>
          <h1>{data.title}</h1>
        </div>
        <StatusBadge status={data.status} />
      </div>
      {conflict && (
        <Banner tone="warning" title="This page is out of date" role="alert" icon="alert">
          <p>{friendlyMessage(conflict)} Anything you typed here will stay.</p>
          <Button variant="secondary" size="sm" busy={loading} onClick={reloadLatest}>
            Reload
          </Button>
        </Banner>
      )}
      {error && !loading && <ErrorState error={error} onRetry={reload} />}
      <div className="detail-grid">
        <div>
          <Card title="Original request">
            <div className="preserve-lines">{data.description}</div>
          </Card>
          <AiAnalysisPanel
            request={data}
            running={running || autoPending}
            failure={failure}
            onAnalyze={analyze}
            onCheckAgain={() => {
              clearFailure()
              reload()
            }}
          />
          {reviewPending &&
            (selfSubmitted ? (
              <Banner tone="info" title="Another team member must review this" icon="user">
                You submitted this request, so you cannot review its AI suggestion.
              </Banner>
            ) : (
              <ReviewPanel
                request={data}
                onReviewed={(updated) => {
                  setConflict(null)
                  setData(updated)
                }}
                onConflict={setConflict}
              />
            ))}
          <CommentsSection request={data} allowInternal onAdded={reload} />
          <ActivitySection events={data.events} describeDetail={eventDetail} />
        </div>
        <aside className="detail-side" aria-label="Request details">
          <Card title="Details" className="card-compact">
            <dl className="fact-list">
              <div>
                <dt>Requester</dt>
                <dd className="with-avatar">
                  <Avatar name={data.requester.display_name} />
                  {data.requester.display_name}
                </dd>
              </div>
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
          <WorkflowControls
            request={data}
            reviewPending={reviewPending && !selfSubmitted}
            onPatch={patch}
            onConflict={setConflict}
          />
          <RunHistory runs={data.ai_runs} />
        </aside>
      </div>
    </>
  )
}

export default function SupportDetailPage() {
  const { id } = useParams()
  return <StaffDetail key={id} id={id} />
}

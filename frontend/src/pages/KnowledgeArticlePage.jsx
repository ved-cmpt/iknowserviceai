import { Link, useParams } from 'react-router-dom'
import { articlePath } from '../api/knowledge'
import { useApiData } from '../api/useApiData'
import Badge from '../components/Badge'
import Card from '../components/Card'
import ErrorState from '../components/ErrorState'
import LoadingState from '../components/LoadingState'
import SafeMarkdown from '../components/SafeMarkdown'
import { categoryLabel } from '../knowledge/categories'
import { formatDate } from '../lib/format'

export default function KnowledgeArticlePage() {
  const { id } = useParams()
  const { loading, data, error, retry } = useApiData(articlePath(id))

  return (
    <div className="page-medium">
      <p>
        <Link to="/knowledge">← Back to knowledge base</Link>
      </p>
      {loading && !data && <LoadingState label="Loading article…" />}
      {error && <ErrorState error={error} onRetry={error.status === 404 ? undefined : retry} />}
      {data && !error && (
        <Card as="article">
          <h1>{data.title}</h1>
          <p className="meta">
            {categoryLabel(data.category)} · Version {data.version} · Updated{' '}
            {formatDate(data.updated_at)}
            {data.status !== 'PUBLISHED' && (
              <>
                {' · '}
                <Badge tone="warning">{data.status}</Badge>
              </>
            )}
          </p>
          <SafeMarkdown>{data.body_markdown}</SafeMarkdown>
        </Card>
      )}
    </div>
  )
}

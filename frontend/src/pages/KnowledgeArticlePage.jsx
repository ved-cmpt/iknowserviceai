import Markdown from 'react-markdown'
import { Link, useParams } from 'react-router-dom'
import { useApiData } from '../api/useApiData'
import { ErrorNotice, Loading } from '../components/DataState'
import { categoryLabel } from '../knowledge/categories'

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

export default function KnowledgeArticlePage() {
  const { id } = useParams()
  const { loading, data, error, retry } = useApiData(`/knowledge/${encodeURIComponent(id)}`)

  return (
    <>
      <p>
        <Link to="/knowledge">← Back to knowledge base</Link>
      </p>
      {loading && <Loading label="Loading article…" />}
      {error && <ErrorNotice error={error} onRetry={error.status === 404 ? undefined : retry} />}
      {data && (
        <article className="card">
          <h1 style={{ marginTop: 0 }}>{data.title}</h1>
          <p className="meta">
            {categoryLabel(data.category)} · Version {data.version} · Updated{' '}
            {formatDate(data.updated_at)}
            {data.status !== 'PUBLISHED' && ` · ${data.status}`}
          </p>
          {/* Article text is untrusted. react-markdown never renders raw HTML and it blocks
              unsafe link protocols, so scripts and handlers stay inert (ADR-018). */}
          <div className="article-body">
            <Markdown>{data.body_markdown}</Markdown>
          </div>
        </article>
      )}
    </>
  )
}

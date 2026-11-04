import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { knowledgePath } from '../api/knowledge'
import { useApiData } from '../api/useApiData'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import LoadingState from '../components/LoadingState'
import Pagination from '../components/Pagination'
import { CATEGORIES, categoryLabel } from '../knowledge/categories'

const MAX_QUERY_LENGTH = 200
const PAGE_SIZE = 20

function Results({ query, category, offset, onPage }) {
  const { loading, data, error, retry } = useApiData(
    knowledgePath({ limit: PAGE_SIZE, offset, q: query, category }),
  )

  if (error) return <ErrorState error={error} onRetry={retry} />
  if (loading && !data) return <LoadingState label="Searching articles…" />
  if (data.items.length === 0) {
    return (
      <EmptyState
        title={
          query
            ? 'No articles match your search. Try different words, or submit a request for support.'
            : 'There are no published articles in this category.'
        }
      />
    )
  }

  return (
    <>
      <p className="meta" role="status">
        {data.total} {data.total === 1 ? 'article' : 'articles'}
      </p>
      <ul className="result-list">
        {data.items.map((article) => (
          <li key={article.id}>
            <h2>
              <Link to={`/knowledge/${article.id}`}>{article.title}</Link>
            </h2>
            <p className="meta">{categoryLabel(article.category)}</p>
            <p>{article.snippet}</p>
          </li>
        ))}
      </ul>
      {data.total > data.limit && (
        <Pagination total={data.total} limit={data.limit} offset={data.offset} onChange={onPage} />
      )}
    </>
  )
}

export default function KnowledgeListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const category = searchParams.get('category') ?? ''
  const offset = Number(searchParams.get('offset')) || 0
  const [draft, setDraft] = useState(query)

  function apply(nextQuery, nextCategory, nextOffset = 0) {
    const next = {}
    if (nextQuery) next.q = nextQuery
    if (nextCategory) next.category = nextCategory
    if (nextOffset) next.offset = nextOffset
    setSearchParams(next)
  }

  function handleSubmit(event) {
    event.preventDefault()
    apply(draft.trim(), category)
  }

  return (
    <>
      <h1>Knowledge base</h1>
      <form className="search-form" role="search" onSubmit={handleSubmit}>
        <label>
          <span className="visually-hidden">Search articles</span>
          <input
            type="search"
            value={draft}
            maxLength={MAX_QUERY_LENGTH}
            placeholder="Search articles, for example: wifi"
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <label>
          <span className="visually-hidden">Category</span>
          <select value={category} onChange={(event) => apply(query, event.target.value)}>
            {CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit">Search</Button>
      </form>
      <Results
        query={query}
        category={category}
        offset={offset}
        onPage={(nextOffset) => apply(query, category, nextOffset)}
      />
    </>
  )
}

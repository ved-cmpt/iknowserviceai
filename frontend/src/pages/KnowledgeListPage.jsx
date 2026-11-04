import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApiData } from '../api/useApiData'
import { ErrorNotice, Loading } from '../components/DataState'
import { CATEGORIES, categoryLabel } from '../knowledge/categories'

const MAX_QUERY_LENGTH = 200

function Results({ query, category }) {
  const params = new URLSearchParams({ limit: '20' })
  if (query) params.set('q', query)
  if (category) params.set('category', category)
  const { loading, data, error, retry } = useApiData(`/knowledge?${params}`)

  if (loading) return <Loading label="Searching articles…" />
  if (error) return <ErrorNotice error={error} onRetry={retry} />
  if (data.items.length === 0) {
    return (
      <p className="muted">
        {query
          ? 'No articles match your search. Try different words, or submit a request for support.'
          : 'There are no published articles in this category.'}
      </p>
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
    </>
  )
}

export default function KnowledgeListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const category = searchParams.get('category') ?? ''
  const [draft, setDraft] = useState(query)

  function apply(nextQuery, nextCategory) {
    const next = {}
    if (nextQuery) next.q = nextQuery
    if (nextCategory) next.category = nextCategory
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
          <select
            value={category}
            onChange={(event) => apply(query, event.target.value)}
          >
            {CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Search</button>
      </form>
      <Results query={query} category={category} />
    </>
  )
}

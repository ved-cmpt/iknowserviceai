import { useState } from 'react'
import { Link } from 'react-router-dom'
import { adminKnowledgePath } from '../api/knowledge'
import { useApiData } from '../api/useApiData'
import Badge from '../components/Badge'
import Button, { ButtonLink } from '../components/Button'
import Card from '../components/Card'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import FormField from '../components/FormField'
import LoadingState from '../components/LoadingState'
import Pagination from '../components/Pagination'
import Table from '../components/Table'
import { ARTICLE_STATUS_OPTIONS, articleStatusLabel } from '../knowledge/articleForm'
import ArticleStatusActions from '../knowledge/ArticleStatusActions'
import { CATEGORIES, categoryLabel } from '../knowledge/categories'
import { formatDate } from '../lib/format'
import { PAGE_SIZE } from '../requests/options'
import { useListParams } from '../requests/useListParams'

const STATUS_TONES = { DRAFT: 'warning', PUBLISHED: 'success', ARCHIVED: 'neutral' }

function ArticleList({ params, filtered, onPage }) {
  const { loading, data, error, retry, reload } = useApiData(adminKnowledgePath(params))

  if (error) return <ErrorState error={error} onRetry={retry} />
  if (loading && !data) return <LoadingState label="Loading articles…" />
  if (data.items.length === 0) {
    return filtered ? (
      <EmptyState title="No articles match these filters." />
    ) : (
      <EmptyState
        title="There are no articles yet."
        action={<ButtonLink to="/admin/knowledge/new">New article</ButtonLink>}
      />
    )
  }

  const columns = [
    {
      key: 'title',
      header: 'Title',
      primary: true,
      render: (article) => <Link to={`/admin/knowledge/${article.id}/edit`}>{article.title}</Link>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (article) => (
        <Badge tone={STATUS_TONES[article.status]}>{articleStatusLabel(article.status)}</Badge>
      ),
    },
    { key: 'version', header: 'Version', render: (article) => article.version },
    { key: 'category', header: 'Category', render: (article) => categoryLabel(article.category) },
    { key: 'updated', header: 'Updated', render: (article) => formatDate(article.updated_at) },
    {
      key: 'actions',
      header: 'Actions',
      render: (article) => <ArticleStatusActions article={article} size="sm" onChanged={reload} />,
    },
  ]

  return (
    <>
      <Table caption="Knowledge articles" columns={columns} rows={data.items} />
      <Pagination total={data.total} limit={data.limit} offset={data.offset} onChange={onPage} />
    </>
  )
}

export default function AdminKnowledgePage() {
  const [filters, setFilters] = useListParams(['status', 'category', 'q'])
  const [search, setSearch] = useState(filters.q)

  const params = {
    limit: PAGE_SIZE,
    offset: filters.offset,
    status: filters.status,
    category: filters.category,
    q: filters.q,
  }

  return (
    <>
      <div className="page-header">
        <h1>Knowledge admin</h1>
        <ButtonLink to="/admin/knowledge/new">New article</ButtonLink>
      </div>
      <Card as="div">
        <form
          className="filter-bar"
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            setFilters({ q: search.trim() })
          }}
        >
          <FormField label="Search title or slug">
            {(field) => (
              <input
                {...field}
                type="search"
                maxLength={200}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Status">
            {(field) => (
              <select
                {...field}
                value={filters.status}
                onChange={(event) => setFilters({ status: event.target.value })}
              >
                <option value="">All statuses</option>
                {ARTICLE_STATUS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="Category">
            {(field) => (
              <select
                {...field}
                value={filters.category}
                onChange={(event) => setFilters({ category: event.target.value })}
              >
                {CATEGORIES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        <ArticleList
          params={params}
          filtered={Boolean(filters.status || filters.category || filters.q)}
          onPage={(offset) => setFilters({ offset })}
        />
      </Card>
    </>
  )
}

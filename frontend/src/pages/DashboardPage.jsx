import { Link } from 'react-router-dom'
import { requestCountsPath, requestsPath } from '../api/requests'
import { useApiData } from '../api/useApiData'
import { PriorityBadge, StatusBadge } from '../components/Badge'
import { ButtonLink } from '../components/Button'
import Card from '../components/Card'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import FormField from '../components/FormField'
import LoadingState from '../components/LoadingState'
import Pagination from '../components/Pagination'
import Table from '../components/Table'
import { CATEGORIES, categoryLabel } from '../knowledge/categories'
import { formatDate } from '../lib/format'
import { STATUS_OPTIONS } from '../lib/labels'
import { DEFAULT_SORT, PAGE_SIZE, SORT_OPTIONS, sortParams } from '../requests/options'
import StatusCounts from '../requests/StatusCounts'
import { useListParams } from '../requests/useListParams'

const COLUMNS = [
  {
    key: 'title',
    header: 'Title',
    primary: true,
    render: (request) => <Link to={`/requests/${request.id}`}>{request.title}</Link>,
  },
  { key: 'status', header: 'Status', render: (request) => <StatusBadge status={request.status} /> },
  { key: 'category', header: 'Category', render: (request) => categoryLabel(request.category) },
  {
    key: 'priority',
    header: 'Priority',
    render: (request) => <PriorityBadge priority={request.priority} />,
  },
  { key: 'created', header: 'Created', render: (request) => formatDate(request.created_at) },
  { key: 'updated', header: 'Updated', render: (request) => formatDate(request.updated_at) },
]

function RequestList({ params, filtered, onPage }) {
  const { loading, data, error, retry } = useApiData(requestsPath(params))

  if (error) return <ErrorState error={error} onRetry={retry} />
  if (loading && !data) return <LoadingState label="Loading requests…" />
  if (data.items.length === 0) {
    return filtered ? (
      <EmptyState title="No requests match these filters.">
        Try a different status or category.
      </EmptyState>
    ) : (
      <EmptyState
        title="There are no requests yet."
        action={<ButtonLink to="/requests/new">New request</ButtonLink>}
      >
        Describe an IT problem and we will suggest next steps.
      </EmptyState>
    )
  }

  return (
    <>
      <Table caption="Your requests" columns={COLUMNS} rows={data.items} />
      <Pagination total={data.total} limit={data.limit} offset={data.offset} onChange={onPage} />
    </>
  )
}

export default function DashboardPage() {
  const [filters, setFilters] = useListParams(['status', 'category', 'sort'], {
    sort: DEFAULT_SORT,
  })
  const params = {
    mine: 'true',
    limit: PAGE_SIZE,
    offset: filters.offset,
    status: filters.status,
    category: filters.category,
    ...sortParams(filters.sort),
  }

  return (
    <>
      <div className="page-header">
        <h1>My requests</h1>
        <ButtonLink to="/requests/new">New request</ButtonLink>
      </div>
      <StatusCounts path={requestCountsPath({ mine: 'true' })} />
      <Card as="div">
        <div className="filter-bar">
          <FormField label="Status">
            {(field) => (
              <select
                {...field}
                value={filters.status}
                onChange={(event) => setFilters({ status: event.target.value })}
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map(([value, label]) => (
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
          <FormField label="Sort by">
            {(field) => (
              <select
                {...field}
                value={filters.sort}
                onChange={(event) => setFilters({ sort: event.target.value })}
              >
                {SORT_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </div>
        <RequestList
          params={params}
          filtered={Boolean(filters.status || filters.category)}
          onPage={(offset) => setFilters({ offset })}
        />
      </Card>
    </>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { friendlyMessage } from '../api/errors'
import { requestCountsPath, requestsPath, updateRequest } from '../api/requests'
import { useApiData } from '../api/useApiData'
import { useAuth } from '../auth/authContext'
import { useAnnounce } from '../components/announcerContext'
import { PriorityBadge, StatusBadge } from '../components/Badge'
import Banner from '../components/Banner'
import Button from '../components/Button'
import Card from '../components/Card'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import FormField from '../components/FormField'
import LoadingState from '../components/LoadingState'
import Pagination from '../components/Pagination'
import Table from '../components/Table'
import { CATEGORIES, categoryLabel } from '../knowledge/categories'
import { formatDate } from '../lib/format'
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '../lib/labels'
import { DEFAULT_SORT, PAGE_SIZE, SORT_OPTIONS, sortParams } from '../requests/options'
import StatusCounts from '../requests/StatusCounts'
import { useListParams } from '../requests/useListParams'

const REVIEW_STATUS = 'NEEDS_HUMAN_REVIEW'

function FilterSelect({ label, value, options, onChange, allLabel }) {
  return (
    <FormField label={label}>
      {(field) => (
        <select {...field} value={value} onChange={(event) => onChange(event.target.value)}>
          {allLabel && <option value="">{allLabel}</option>}
          {options.map(([optionValue, optionLabel]) => (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          ))}
        </select>
      )}
    </FormField>
  )
}

function assigneeText(request, user) {
  if (!request.assigned_agent_id) return 'Unassigned'
  return request.assigned_agent_id === user.id ? 'You' : 'Another team member'
}

function Queue({ params, filtered, onPage }) {
  const { user } = useAuth()
  const announce = useAnnounce()
  const { loading, data, error, retry, reload } = useApiData(requestsPath(params))
  const [assigning, setAssigning] = useState(null)
  const [assignError, setAssignError] = useState(null)

  async function assignToMe(request) {
    setAssigning(request.id)
    setAssignError(null)
    try {
      await updateRequest(request.id, {
        expected_version: request.version,
        assigned_agent_id: user.id,
      })
      announce(`Assigned to you: ${request.title}`)
    } catch (cause) {
      setAssignError(cause)
    } finally {
      setAssigning(null)
      reload() // Also the right response to a conflict: the list shows the latest version.
    }
  }

  if (error) return <ErrorState error={error} onRetry={retry} />
  if (loading && !data) return <LoadingState label="Loading the queue…" />

  const columns = [
    {
      key: 'title',
      header: 'Title',
      primary: true,
      render: (request) => <Link to={`/support/${request.id}`}>{request.title}</Link>,
    },
    { key: 'status', header: 'Status', render: (request) => <StatusBadge status={request.status} /> },
    {
      key: 'priority',
      header: 'Priority',
      render: (request) => <PriorityBadge priority={request.priority} />,
    },
    { key: 'category', header: 'Category', render: (request) => categoryLabel(request.category) },
    { key: 'assignee', header: 'Assigned to', render: (request) => assigneeText(request, user) },
    { key: 'created', header: 'Created', render: (request) => formatDate(request.created_at) },
    {
      key: 'action',
      header: 'Action',
      render: (request) =>
        request.assigned_agent_id === user.id || request.status === 'CLOSED' ? (
          <span className="meta">None</span>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            busy={assigning === request.id}
            onClick={() => assignToMe(request)}
            aria-label={`Assign to me: ${request.title}`}
          >
            Assign to me
          </Button>
        ),
    },
  ]

  return (
    <>
      {assignError && (
        <Banner tone="warning" role="alert">
          {friendlyMessage(assignError)}
        </Banner>
      )}
      {data.items.length === 0 ? (
        <EmptyState title={filtered ? 'No requests match these filters.' : 'The queue is empty.'} />
      ) : (
        <>
          <Table caption="Support queue" columns={columns} rows={data.items} />
          <Pagination total={data.total} limit={data.limit} offset={data.offset} onChange={onPage} />
        </>
      )}
    </>
  )
}

export default function SupportQueuePage() {
  const [filters, setFilters] = useListParams(['status', 'priority', 'category', 'assigned', 'sort'], {
    sort: DEFAULT_SORT,
  })
  const { data: counts } = useApiData(requestCountsPath())
  const reviewActive = filters.status === REVIEW_STATUS
  const reviewCount = counts?.counts[REVIEW_STATUS]

  const params = {
    limit: PAGE_SIZE,
    offset: filters.offset,
    status: filters.status,
    priority: filters.priority,
    category: filters.category,
    assigned_to: filters.assigned,
    ...sortParams(filters.sort),
  }

  return (
    <>
      <div className="page-header">
        <h1>Support queue</h1>
        <Button
          variant="secondary"
          className="btn-attention"
          aria-pressed={reviewActive}
          onClick={() => setFilters({ status: reviewActive ? '' : REVIEW_STATUS })}
        >
          Needs review{reviewCount !== undefined ? ` (${reviewCount})` : ''}
        </Button>
      </div>
      <StatusCounts data={counts} />
      <Card as="div">
        <div className="filter-bar">
          <FilterSelect
            label="Status"
            value={filters.status}
            options={STATUS_OPTIONS}
            allLabel="All statuses"
            onChange={(status) => setFilters({ status })}
          />
          <FilterSelect
            label="Priority"
            value={filters.priority}
            options={PRIORITY_OPTIONS}
            allLabel="All priorities"
            onChange={(priority) => setFilters({ priority })}
          />
          <FilterSelect
            label="Category"
            value={filters.category}
            options={CATEGORIES}
            onChange={(category) => setFilters({ category })}
          />
          <FilterSelect
            label="Assigned"
            value={filters.assigned}
            options={[
              ['', 'Anyone'],
              ['me', 'Me'],
              ['unassigned', 'Unassigned'],
            ]}
            onChange={(assigned) => setFilters({ assigned })}
          />
          <FilterSelect
            label="Sort by"
            value={filters.sort}
            options={SORT_OPTIONS}
            onChange={(sort) => setFilters({ sort })}
          />
        </div>
        <Queue
          params={params}
          filtered={Boolean(filters.status || filters.priority || filters.category || filters.assigned)}
          onPage={(offset) => setFilters({ offset })}
        />
      </Card>
    </>
  )
}

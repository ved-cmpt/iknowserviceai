import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { friendlyMessage } from '../api/errors'
import { requestCountsPath, requestsPath, updateRequest } from '../api/requests'
import { useApiData } from '../api/useApiData'
import { useAuth } from '../auth/authContext'
import { useAnnounce } from '../components/announcerContext'
import Avatar from '../components/Avatar'
import { PriorityBadge, StatusBadge } from '../components/Badge'
import Banner from '../components/Banner'
import Button from '../components/Button'
import Card from '../components/Card'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import FormField from '../components/FormField'
import Icon from '../components/icons'
import LoadingState from '../components/LoadingState'
import Pagination from '../components/Pagination'
import Table from '../components/Table'
import { CATEGORIES, categoryLabel } from '../knowledge/categories'
import { formatDate } from '../lib/format'
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '../lib/labels'
import { usePolling } from '../lib/usePolling'
import { useHotkeys } from '../lib/useHotkeys'
import { DEFAULT_SORT, PAGE_SIZE, SORT_OPTIONS, sortParams } from '../requests/options'
import StatusCounts from '../requests/StatusCounts'
import { useListParams } from '../requests/useListParams'

const REVIEW_STATUS = 'NEEDS_HUMAN_REVIEW'
const AUTO_REFRESH_MS = 30000
// Quick views beside "All requests" and "Needs review". The filters below hold every status.
const MORE_SEGMENTS = [
  ['NEW', 'New'],
  ['IN_PROGRESS', 'In progress'],
]

// j and k move between rows, and Enter opens the focused one, because the row's title is a link.
function useRowKeys(tableRef) {
  const bindings = useMemo(() => {
    function move(step) {
      const links = [...(tableRef.current?.querySelectorAll('td[data-primary="true"] a') ?? [])]
      if (links.length === 0) return
      const index = links.indexOf(document.activeElement)
      const next = index === -1 ? (step > 0 ? 0 : links.length - 1) : Math.min(Math.max(index + step, 0), links.length - 1)
      links[next].focus()
    }
    return { j: () => move(1), k: () => move(-1) }
  }, [tableRef])
  useHotkeys(bindings)
}

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
  if (request.assigned_agent_id === user.id) return 'You'
  return request.assigned_agent_name ?? 'Another team member'
}

function assigneeName(request, user) {
  return request.assigned_agent_id === user.id
    ? user.display_name
    : (request.assigned_agent_name ?? 'Team member')
}

function Queue({ list, filtered, onPage }) {
  const { user } = useAuth()
  const announce = useAnnounce()
  const { loading, data, error, retry, reload } = list
  const [assigning, setAssigning] = useState(null)
  const [assignError, setAssignError] = useState(null)
  const tableRef = useRef(null)
  useRowKeys(tableRef)

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

  // A failed background refresh keeps the last good list on screen, with the error above it.
  if (error && !data) return <ErrorState error={error} onRetry={retry} />
  if (loading && !data) return <LoadingState label="Loading the queue…" />

  const columns = [
    {
      key: 'title',
      header: 'Title',
      primary: true,
      render: (request) => (
        <>
          <Link to={`/support/${request.id}`}>{request.title}</Link>
          <span className="row-id mono">{String(request.id).slice(0, 8)}</span>
        </>
      ),
    },
    { key: 'status', header: 'Status', render: (request) => <StatusBadge status={request.status} /> },
    {
      key: 'priority',
      header: 'Priority',
      render: (request) => <PriorityBadge priority={request.priority} />,
    },
    { key: 'category', header: 'Category', render: (request) => categoryLabel(request.category) },
    {
      key: 'assignee',
      header: 'Assigned to',
      render: (request) => (
        <span className="with-avatar">
          <Avatar name={request.assigned_agent_id ? assigneeName(request, user) : null} />
          {assigneeText(request, user)}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (request) => <span className="mono">{formatDate(request.created_at)}</span>,
    },
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
      {error && <ErrorState error={error} onRetry={retry} />}
      {assignError && (
        <Banner tone="warning" role="alert">
          {friendlyMessage(assignError)}
        </Banner>
      )}
      {data.items.length === 0 ? (
        <EmptyState title={filtered ? 'No requests match these filters.' : 'The queue is empty.'} />
      ) : (
        <div ref={tableRef}>
          <Table
            caption="Support queue"
            columns={columns}
            rows={data.items}
            rowClassName={(request) => (request.status === REVIEW_STATUS ? 'row-attention' : undefined)}
          />
          <Pagination total={data.total} limit={data.limit} offset={data.offset} onChange={onPage} />
          <p className="meta keyboard-hint">
            <kbd>j</kbd> <kbd>k</kbd> move between rows, <kbd>Enter</kbd> opens one.
          </p>
        </div>
      )}
    </>
  )
}

export default function SupportQueuePage() {
  const [filters, setFilters] = useListParams(['status', 'priority', 'category', 'assigned', 'sort'], {
    sort: DEFAULT_SORT,
  })
  const announce = useAnnounce()
  const countsData = useApiData(requestCountsPath())
  const counts = countsData.data
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
  const list = useApiData(requestsPath(params))

  // Skips anything still loading, so a timer and a click cannot send the same request twice.
  function refresh() {
    if (!list.loading) list.reload()
    if (!countsData.loading) countsData.reload()
  }
  usePolling(refresh, { enabled: true, intervalMs: AUTO_REFRESH_MS })

  return (
    <>
      <div className="page-header">
        <h1>Support queue</h1>
        <div className="btn-group">
          <div className="segment" role="group" aria-label="View">
            <button
              type="button"
              className="segment-option"
              aria-pressed={!filters.status}
              onClick={() => setFilters({ status: '' })}
            >
              All requests
            </button>
            <button
              type="button"
              className="segment-option segment-attention"
              aria-pressed={reviewActive}
              onClick={() => setFilters({ status: reviewActive ? '' : REVIEW_STATUS })}
            >
              <Icon name="eye" size={14} />
              Needs review{reviewCount !== undefined ? ` (${reviewCount})` : ''}
            </button>
            {MORE_SEGMENTS.map(([status, label]) => (
              <button
                key={status}
                type="button"
                className="segment-option"
                aria-pressed={filters.status === status}
                onClick={() => setFilters({ status: filters.status === status ? '' : status })}
              >
                {label}
                {counts && ` (${counts.counts[status] ?? 0})`}
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              refresh()
              announce('Queue refreshed.')
            }}
          >
            <Icon name="refresh" />
            Refresh
          </Button>
        </div>
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
          list={list}
          filtered={Boolean(filters.status || filters.priority || filters.category || filters.assigned)}
          onPage={(offset) => setFilters({ offset })}
        />
      </Card>
    </>
  )
}

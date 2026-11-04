import { Link } from 'react-router-dom'
import { auditPath } from '../api/admin'
import { useApiData } from '../api/useApiData'
import Avatar from '../components/Avatar'
import Card from '../components/Card'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import FormField from '../components/FormField'
import Icon from '../components/icons'
import LoadingState from '../components/LoadingState'
import Pagination from '../components/Pagination'
import Table from '../components/Table'
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  auditActionLabel,
  auditEntityLabel,
  metadataIds,
  metadataSummary,
} from '../lib/audit'
import { formatDateTime } from '../lib/format'
import { PAGE_SIZE } from '../requests/options'
import { useListParams } from '../requests/useListParams'

function DetailsCell({ row }) {
  const summary = metadataSummary(row.safe_metadata, { action: row.action, names: row.names })
  const ids = metadataIds(row.safe_metadata)
  return (
    <>
      {summary || (ids ? null : 'None')}
      {ids && <div className="meta">{ids}</div>}
    </>
  )
}

function EntityCell({ row }) {
  const type = auditEntityLabel(row.entity_type)
  const label = row.entity_name ? `${type}: ${row.entity_name}` : type
  if (row.entity_id && row.entity_type === 'service_request') {
    return <Link to={`/support/${row.entity_id}`}>{label}</Link>
  }
  if (row.entity_id && row.entity_type === 'knowledge_article') {
    return <Link to={`/admin/knowledge/${row.entity_id}/edit`}>{label}</Link>
  }
  return label
}

function actionIcon(action) {
  if (action.startsWith('auth.')) return 'key'
  if (action.startsWith('knowledge.')) return 'book'
  if (action.includes('review') || action.includes('suggestion')) return 'shield'
  if (action.startsWith('ai.') || action.includes('analysis')) return 'sparkle'
  return 'ticket'
}

const COLUMNS = [
  {
    key: 'time',
    header: 'Time',
    primary: true,
    render: (row) => <span className="mono">{formatDateTime(row.occurred_at)}</span>,
  },
  {
    key: 'actor',
    header: 'Actor',
    render: (row) => (
      <span className="with-avatar">
        <Avatar name={row.actor_name} />
        {row.actor_name ?? 'System or unknown'}
      </span>
    ),
  },
  {
    key: 'action',
    header: 'Action',
    render: (row) => (
      <span className="with-avatar">
        <Icon name={actionIcon(row.action)} size={14} />
        {auditActionLabel(row.action)}
      </span>
    ),
  },
  { key: 'entity', header: 'Entity', render: (row) => <EntityCell row={row} /> },
  { key: 'details', header: 'Details', render: (row) => <DetailsCell row={row} /> },
]

function AuditTable({ params, filtered, onPage }) {
  const { loading, data, error, retry } = useApiData(auditPath(params))

  if (error) return <ErrorState error={error} onRetry={retry} />
  if (loading && !data) return <LoadingState label="Loading the audit log…" />
  if (data.items.length === 0) {
    return (
      <EmptyState
        title={filtered ? 'No audit records match these filters.' : 'There are no audit records yet.'}
      />
    )
  }
  return (
    <>
      <Table caption="Audit log" columns={COLUMNS} rows={data.items} />
      <Pagination total={data.total} limit={data.limit} offset={data.offset} onChange={onPage} />
    </>
  )
}

export default function AdminAuditPage() {
  const [filters, setFilters] = useListParams(['action', 'entity_type'])
  const params = {
    limit: PAGE_SIZE,
    offset: filters.offset,
    action: filters.action,
    entity_type: filters.entity_type,
  }

  return (
    <>
      <h1>Audit log</h1>
      <p className="muted">
        Newest first. Records are append-only, and hold metadata only: never passwords, tokens,
        comment text or reply text.
      </p>
      <Card as="div">
        <div className="filter-bar">
          <FormField label="Action">
            {(field) => (
              <select
                {...field}
                value={filters.action}
                onChange={(event) => setFilters({ action: event.target.value })}
              >
                <option value="">All actions</option>
                {AUDIT_ACTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="Entity">
            {(field) => (
              <select
                {...field}
                value={filters.entity_type}
                onChange={(event) => setFilters({ entity_type: event.target.value })}
              >
                <option value="">All entities</option>
                {AUDIT_ENTITIES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </div>
        <AuditTable
          params={params}
          filtered={Boolean(filters.action || filters.entity_type)}
          onPage={(offset) => setFilters({ offset })}
        />
      </Card>
    </>
  )
}

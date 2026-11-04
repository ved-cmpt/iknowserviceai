import { formatDateTime, formatDuration } from '../lib/format'
import { runStatusLabel } from '../lib/labels'
import Table from '../components/Table'

const RUN_COLUMNS = [
  {
    key: 'time',
    header: 'Started',
    primary: true,
    render: (run) => <span className="mono">{formatDateTime(run.started_at)}</span>,
  },
  { key: 'status', header: 'Result', render: (run) => runStatusLabel(run.status) },
  { key: 'mode', header: 'Mode', render: (run) => run.mode },
  { key: 'model', header: 'Model', render: (run) => run.model_id ?? 'None' },
  { key: 'prompt', header: 'Prompt', render: (run) => run.prompt_version },
  {
    key: 'duration',
    header: 'Duration',
    render: (run) => <span className="mono">{formatDuration(run.duration_ms)}</span>,
  },
  { key: 'error', header: 'Error code', render: (run) => run.error_code ?? 'None' },
]

// Collapsed by default, because it matters only when someone is investigating a run.
export default function RunHistory({ runs }) {
  return (
    <details className="disclosure">
      <summary>Run history ({runs.length})</summary>
      <div className="disclosure-body run-history">
        {runs.length === 0 ? (
          <p className="muted">No analysis has run.</p>
        ) : (
          <Table caption="AI run history" columns={RUN_COLUMNS} rows={runs} />
        )}
      </div>
    </details>
  )
}

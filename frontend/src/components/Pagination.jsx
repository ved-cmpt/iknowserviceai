import Button from './Button'

export default function Pagination({ total, limit, offset, onChange }) {
  const page = Math.floor(offset / limit) + 1
  const pages = Math.max(Math.ceil(total / limit), 1)

  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="meta">
        Page {page} of {pages} · {total} {total === 1 ? 'result' : 'results'}
      </span>
      {pages > 1 && (
        <span className="btn-group">
          <Button
            variant="secondary"
            size="sm"
            disabled={offset === 0}
            onClick={() => onChange(Math.max(offset - limit, 0))}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={offset + limit >= total}
            onClick={() => onChange(offset + limit)}
          >
            Next
          </Button>
        </span>
      )}
    </nav>
  )
}

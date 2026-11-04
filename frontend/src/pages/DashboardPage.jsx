import { useApiData } from '../api/useApiData'
import { ErrorNotice, Loading } from '../components/DataState'

function formatStatus(status) {
  const text = status.replaceAll('_', ' ').toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

function Profile() {
  const { loading, data, error, retry } = useApiData('/auth/me')
  if (loading) return <Loading label="Loading your profile…" />
  if (error) return <ErrorNotice error={error} onRetry={retry} />
  return (
    <section className="card" aria-label="Your profile">
      <h2 style={{ marginTop: 0 }}>{data.display_name}</h2>
      <p style={{ margin: 0 }}>{data.email}</p>
      <p style={{ margin: 0 }}>Role: {data.role}</p>
    </section>
  )
}

function RequestList() {
  const { loading, data, error, retry } = useApiData('/requests?limit=20')
  if (loading) return <Loading label="Loading requests…" />
  if (error) return <ErrorNotice error={error} onRetry={retry} />
  if (data.items.length === 0) return <p className="muted">There are no requests yet.</p>

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Title</th>
            <th scope="col">Status</th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((request) => (
            <tr key={request.id}>
              <td>{request.title}</td>
              <td className="status-text">{formatStatus(request.status)}</td>
              <td>{formatDate(request.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="meta">
        Showing {data.items.length} of {data.total}
      </p>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <>
      <h1>Dashboard</h1>
      <Profile />
      <section className="card" aria-labelledby="requests-heading">
        <h2 id="requests-heading" style={{ marginTop: 0 }}>
          Requests
        </h2>
        <RequestList />
      </section>
    </>
  )
}

import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <main className="page narrow">
      <h1>Page not found</h1>
      <p>This page does not exist.</p>
      <Link to="/dashboard">Go to the dashboard</Link>
    </main>
  )
}

import { Navigate, Outlet, useLocation } from 'react-router-dom'
import LoadingState from '../components/LoadingState'
import { useAuth } from './authContext'

// Convenience only. The backend enforces authorization on every request.
export default function ProtectedRoute() {
  const { user, restoring, signedOut } = useAuth()
  const location = useLocation()

  if (restoring) {
    return (
      <main className="page">
        <LoadingState label="Loading…" />
      </main>
    )
  }
  if (!user) {
    const state = signedOut ? undefined : { from: `${location.pathname}${location.search}` }
    return <Navigate to="/login" replace state={state} />
  }
  return <Outlet />
}

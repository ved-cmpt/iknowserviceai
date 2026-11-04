import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './authContext'

// Convenience only. The backend enforces authorization on every request.
export default function ProtectedRoute() {
  const { user, signedOut } = useAuth()
  const location = useLocation()

  if (!user) {
    const state = signedOut ? undefined : { from: `${location.pathname}${location.search}` }
    return <Navigate to="/login" replace state={state} />
  }
  return <Outlet />
}

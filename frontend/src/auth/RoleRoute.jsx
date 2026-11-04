import { Outlet } from 'react-router-dom'
import ForbiddenPage from '../pages/ForbiddenPage'
import { useAuth } from './authContext'

// Convenience only: it spares people a screen they cannot use. The backend remains the authority.
export default function RoleRoute({ allow }) {
  const { user } = useAuth()
  return allow.includes(user?.role) ? <Outlet /> : <ForbiddenPage />
}

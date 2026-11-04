import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import ApiStatus from './ApiStatus'

export default function Layout() {
  const { user, logout } = useAuth()

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/dashboard" className="brand">
            IknowServiceAI
          </Link>
          <nav aria-label="Main">
            <NavLink to="/dashboard">Dashboard</NavLink>
            <NavLink to="/knowledge">Knowledge</NavLink>
          </nav>
          <div className="topbar-user">
            <span>
              {user.display_name} ({user.role})
            </span>
            <button type="button" className="secondary" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="page">
        <Outlet />
        <ApiStatus />
      </main>
    </>
  )
}

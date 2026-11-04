import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { homeFor, navItemsFor } from '../auth/roles'
import { roleLabel } from '../lib/labels'
import { AnnouncerContext } from './announcerContext'
import ApiStatus from './ApiStatus'
import Button from './Button'

export default function Layout() {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const [message, setMessage] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const mainRef = useRef(null)
  const menuButtonRef = useRef(null)
  const previousPath = useRef(pathname)

  // A client-side navigation does not move focus, so keyboard and screen reader users would stay
  // on the old link. Move them to the new page instead.
  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname
      mainRef.current?.focus({ preventScroll: true })
      window.scrollTo?.(0, 0)
    }
  }, [pathname])

  return (
    <AnnouncerContext.Provider value={setMessage}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to={homeFor(user)} className="brand">
            IknowServiceAI
          </Link>
          {/* CSS shows this button on narrow screens only, where it collapses the links below. */}
          <button
            type="button"
            ref={menuButtonRef}
            className="btn btn-secondary btn-sm nav-toggle"
            aria-expanded={menuOpen}
            aria-controls="main-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            Menu
          </button>
          <nav
            id="main-nav"
            aria-label="Main"
            className={menuOpen ? 'nav-open' : undefined}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && menuOpen) {
                setMenuOpen(false)
                menuButtonRef.current?.focus()
              }
            }}
          >
            <ul className="nav-list">
              {navItemsFor(user).map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/requests/new'}
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="topbar-user">
            <span>
              {user.display_name} · {roleLabel(user.role)}
            </span>
            <Button variant="secondary" size="sm" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main id="main-content" className="page" tabIndex={-1} ref={mainRef}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <ApiStatus />
      </footer>
      <div className="visually-hidden" aria-live="polite" data-testid="live-region">
        {message}
      </div>
    </AnnouncerContext.Provider>
  )
}

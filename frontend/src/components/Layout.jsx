import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { homeFor, navItemsFor, navSectionsFor } from '../auth/roles'
import { readFlag, writeFlag } from '../lib/storage'
import { applyTheme, currentTheme } from '../lib/theme'
import { useHotkeys } from '../lib/useHotkeys'
import AccountMenu from './AccountMenu'
import { AnnouncerContext } from './announcerContext'
import ApiStatus from './ApiStatus'
import Breadcrumbs from './Breadcrumbs'
import CommandPalette from './CommandPalette'
import DemoBanner from './DemoBanner'
import Icon, { LogoMark } from './icons'
import ShortcutsHelp from './ShortcutsHelp'
import ThemeToggle from './ThemeToggle'
import Tour, { TOUR_KEY } from './Tour'

const TOAST_MS = 4000
const COLLAPSED_KEY = 'iks-sidebar-collapsed'

export default function Layout() {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => readFlag(COLLAPSED_KEY))
  const [overlay, setOverlay] = useState(null) // 'palette' | 'shortcuts' | null
  const [touring, setTouring] = useState(() => !readFlag(TOUR_KEY))
  const [theme, setTheme] = useState(currentTheme)
  const mainRef = useRef(null)
  const menuButtonRef = useRef(null)
  const previousPath = useRef(pathname)
  const toastTimer = useRef(null)

  // Screen readers hear the live region, and everyone else sees the same element as a brief toast.
  const announce = useCallback((text) => {
    setMessage(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setMessage(''), TOAST_MS)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // A client-side navigation does not move focus, so keyboard and screen reader users would stay
  // on the old link. Move them to the new page instead.
  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname
      mainRef.current?.focus({ preventScroll: true })
      window.scrollTo?.(0, 0)
    }
  }, [pathname])

  const toggleTheme = useCallback(() => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      writeFlag(COLLAPSED_KEY, !value)
      return !value
    })
  }, [])

  const finishTour = useCallback(() => {
    writeFlag(TOUR_KEY, true)
    setTouring(false)
  }, [])

  // Ctrl+K or Cmd+K opens search from anywhere, even inside a field.
  useEffect(() => {
    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOverlay((value) => (value === 'palette' ? null : 'palette'))
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const bindings = useMemo(() => {
    const keys = {
      '?': () => setOverlay('shortcuts'),
      '[': toggleCollapsed,
    }
    for (const item of navItemsFor(user)) keys[`g ${item.key}`] = () => navigate(item.to)
    return keys
  }, [user, navigate, toggleCollapsed])
  useHotkeys(bindings, { enabled: overlay === null })

  const paletteActions = useMemo(
    () => [
      { id: 'action-theme', label: `Use the ${theme === 'dark' ? 'light' : 'dark'} theme`, icon: 'sun', run: toggleTheme },
      { id: 'action-shortcuts', label: 'Keyboard shortcuts', icon: 'keyboard', hint: '?', run: () => setOverlay('shortcuts') },
      { id: 'action-sign-out', label: 'Sign out', icon: 'logout', run: logout },
    ],
    [theme, toggleTheme, logout],
  )

  const shellClass = ['app-shell', collapsed && 'app-shell-collapsed', menuOpen && 'app-shell-menu-open']
    .filter(Boolean)
    .join(' ')

  return (
    <AnnouncerContext.Provider value={announce}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className={shellClass}>
        <aside className="sidebar" aria-label="Sidebar">
          <div className="sidebar-top">
            <Link to={homeFor(user)} className="brand" aria-label="IknowServiceAI home">
              <LogoMark size={24} />
              <span className="brand-name">
                IknowService<span className="gradient-text">AI</span>
              </span>
            </Link>
          </div>
          <button
            type="button"
            className="sidebar-search"
            onClick={() => setOverlay('palette')}
          >
            <Icon name="search" />
            <span className="sidebar-label">Search</span>
            <kbd className="sidebar-label">Ctrl K</kbd>
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
            {navSectionsFor(user).map((section) => (
              <div className="nav-section" key={section.label}>
                <p className="nav-section-label">{section.label}</p>
                <ul className="nav-list">
                  {section.items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/requests/new'}
                        onClick={() => setMenuOpen(false)}
                        title={collapsed ? item.label : undefined}
                      >
                        <Icon name={item.icon} />
                        <span className="sidebar-label">{item.label}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <ApiStatus />
            <button
              type="button"
              className="sidebar-collapse"
              aria-pressed={collapsed}
              aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
              onClick={toggleCollapsed}
            >
              <Icon name="panel" />
            </button>
          </div>
        </aside>
        {menuOpen && <div className="sidebar-scrim" aria-hidden="true" onClick={() => setMenuOpen(false)} />}
        <div className="app-column">
          <header className="topbar">
            {/* CSS shows this button on narrow screens only, where the sidebar becomes a drawer. */}
            <button
              type="button"
              ref={menuButtonRef}
              className="btn btn-secondary btn-sm nav-toggle"
              aria-expanded={menuOpen}
              aria-controls="main-nav"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Icon name="panel" />
              Menu
            </button>
            <Breadcrumbs />
            <div className="topbar-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm icon-button topbar-search"
                aria-label="Open search"
                onClick={() => setOverlay('palette')}
              >
                <Icon name="search" />
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm icon-button"
                aria-label="Keyboard shortcuts"
                onClick={() => setOverlay('shortcuts')}
              >
                <Icon name="keyboard" />
              </button>
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              <AccountMenu
                user={user}
                theme={theme}
                onToggleTheme={toggleTheme}
                onSignOut={logout}
                onShowShortcuts={() => setOverlay('shortcuts')}
                onStartTour={() => setTouring(true)}
              />
            </div>
          </header>
          <DemoBanner />
          <main id="main-content" className="page" tabIndex={-1} ref={mainRef}>
            <Outlet />
          </main>
        </div>
      </div>
      {overlay === 'palette' && (
        <CommandPalette user={user} actions={paletteActions} onClose={() => setOverlay(null)} />
      )}
      {overlay === 'shortcuts' && <ShortcutsHelp user={user} onClose={() => setOverlay(null)} />}
      {touring && overlay === null && <Tour user={user} onDone={finishTour} />}
      <div
        className={message ? 'toast' : 'visually-hidden'}
        aria-live="polite"
        data-testid="live-region"
      >
        {message && <Icon name="checkCircle" className="toast-icon" />}
        {message}
      </div>
    </AnnouncerContext.Provider>
  )
}

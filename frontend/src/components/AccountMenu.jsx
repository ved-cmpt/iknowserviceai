import { useEffect, useId, useRef, useState } from 'react'
import { roleLabel } from '../lib/labels'
import Avatar from './Avatar'
import Icon from './icons'

// A menu button: arrow keys move between items, Escape closes and returns focus to the button.
export default function AccountMenu({ user, theme, onToggleTheme, onSignOut, onShowShortcuts, onStartTour }) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const menuId = useId()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  useEffect(() => {
    if (!open) return undefined
    menuRef.current?.querySelector('[role="menuitem"]')?.focus()
    function onPointerDown(event) {
      if (!menuRef.current?.contains(event.target) && !buttonRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function close(refocus = true) {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  function onMenuKeyDown(event) {
    const items = [...menuRef.current.querySelectorAll('[role="menuitem"]')]
    const index = items.indexOf(document.activeElement)
    const moves = {
      ArrowDown: items[(index + 1) % items.length],
      ArrowUp: items[(index - 1 + items.length) % items.length],
      Home: items[0],
      End: items[items.length - 1],
    }
    if (event.key in moves) {
      event.preventDefault()
      moves[event.key]?.focus()
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault()
      close(event.key === 'Escape')
    }
  }

  function choose(action) {
    close(false)
    action()
  }

  return (
    <div className="account">
      <button
        type="button"
        ref={buttonRef}
        className="account-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        {/* The name comes from the text, so it always contains what is on screen. */}
        <span className="visually-hidden">Account menu: </span>
        <Avatar name={user.display_name} />
        <span className="account-text">
          <span className="account-name">{user.display_name}</span>{' '}
          <span className="account-role">{roleLabel(user.role)}</span>
        </span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="menu" role="menu" id={menuId} ref={menuRef} aria-label="Account" onKeyDown={onMenuKeyDown}>
          <div className="menu-header" role="presentation">
            <span className="menu-header-name">{user.display_name}</span>
            <span className="menu-header-meta">{roleLabel(user.role)}</span>
            <span className="menu-header-meta mono">{user.email}</span>
          </div>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => choose(onToggleTheme)}
          >
            <Icon name={nextTheme === 'dark' ? 'moon' : 'sun'} />
            Use the {nextTheme} theme
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={() => choose(onShowShortcuts)}>
            <Icon name="keyboard" />
            Keyboard shortcuts
            <kbd>?</kbd>
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={() => choose(onStartTour)}>
            <Icon name="help" />
            Take the tour again
          </button>
          <a role="menuitem" className="menu-item" href="/">
            <Icon name="home" />
            Website
          </a>
          <div className="menu-separator" role="separator" />
          <button type="button" role="menuitem" className="menu-item" onClick={() => choose(onSignOut)}>
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

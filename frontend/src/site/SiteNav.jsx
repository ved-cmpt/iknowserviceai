import { useEffect, useRef, useState } from 'react'
import LogoMark from '../components/icons/LogoMark'
import { appHref } from '../lib/legacyPaths'
import { DOCS_URL, REPO_URL } from './links'

// sections: [href, label] pairs for this page's own anchors.
export default function SiteNav({ sections = [] }) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function onKey(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header className="site-nav">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="site-nav-inner">
        <a className="site-brand" href="/" aria-label="IknowServiceAI home">
          <LogoMark size={26} />
          <span>
            IknowService<span className="gradient-text">AI</span>
          </span>
        </a>
        <button
          type="button"
          ref={buttonRef}
          className="site-nav-toggle"
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={() => setOpen((value) => !value)}
        >
          Menu
        </button>
        <nav id="site-menu" aria-label="Website" className={open ? 'site-menu site-menu-open' : 'site-menu'}>
          <ul>
            {sections.map(([href, label]) => (
              <li key={href}>
                <a href={href} onClick={() => setOpen(false)}>
                  {label}
                </a>
              </li>
            ))}
            <li>
              <a href={DOCS_URL}>Docs</a>
            </li>
            <li>
              <a href={REPO_URL}>GitHub</a>
            </li>
          </ul>
          <a className="site-btn site-btn-primary site-btn-sm" href={appHref('/login')}>
            Open the app
          </a>
        </nav>
      </div>
    </header>
  )
}

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { knowledgePath } from '../api/knowledge'
import { requestsPath } from '../api/requests'
import { isStaff, navItemsFor } from '../auth/roles'
import { statusLabel } from '../lib/labels'
import Icon from './icons'
import Modal from './Modal'

const SEARCH_DELAY_MS = 200

function matches(text, query) {
  return text.toLowerCase().includes(query)
}

// Ctrl+K or Cmd+K: jump to a page, one of your requests, or a published article. It only reads
// what the person can already see, through the same API calls as the pages themselves.
export default function CommandPalette({ user, onClose, actions }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [requests, setRequests] = useState(null)
  const [articles, setArticles] = useState({ query: '', items: [] })
  const listId = useId()
  const listRef = useRef(null)
  const staff = isStaff(user)
  const term = query.trim().toLowerCase()

  useEffect(() => {
    let live = true
    apiFetch(requestsPath(staff ? { limit: 50 } : { limit: 50, mine: 'true' }))
      .then((page) => live && setRequests(page.items))
      .catch(() => live && setRequests([]))
    return () => {
      live = false
    }
  }, [staff])

  useEffect(() => {
    if (term.length < 2) return undefined
    let live = true
    const timer = setTimeout(() => {
      apiFetch(knowledgePath({ q: term, limit: 5 }))
        .then((page) => live && setArticles({ query: term, items: page.items }))
        .catch(() => live && setArticles({ query: term, items: [] }))
    }, SEARCH_DELAY_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [term])

  const groups = useMemo(() => {
    const pages = [
      ...navItemsFor(user).map((item) => ({
        id: `page-${item.to}`,
        label: item.label,
        icon: item.icon,
        hint: `g ${item.key}`,
        run: () => navigate(item.to),
      })),
      ...actions,
    ].filter((item) => !term || matches(item.label, term))

    const requestItems = (requests ?? [])
      .filter((request) => !term || matches(request.title, term) || String(request.id).startsWith(term))
      .slice(0, term ? 8 : 5)
      .map((request) => ({
        id: `request-${request.id}`,
        label: request.title,
        icon: 'ticket',
        hint: statusLabel(request.status),
        run: () => navigate(staff ? `/support/${request.id}` : `/requests/${request.id}`),
      }))

    const articleItems =
      term.length >= 2 && articles.query === term
        ? articles.items.map((article) => ({
            id: `article-${article.id}`,
            label: article.title,
            icon: 'book',
            run: () => navigate(`/knowledge/${article.id}`),
          }))
        : []

    return [
      ['Pages and actions', pages],
      [staff ? 'Requests' : 'Your requests', requestItems],
      ['Knowledge articles', articleItems],
    ].filter(([, items]) => items.length > 0)
  }, [user, actions, term, requests, articles, staff, navigate])

  const flat = groups.flatMap(([, items]) => items)
  const current = Math.min(active, Math.max(flat.length - 1, 0))

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [current])

  function run(item) {
    onClose()
    item.run()
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (flat.length === 0) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current + step + flat.length) % flat.length)
    } else if (event.key === 'Enter' && flat[current]) {
      event.preventDefault()
      run(flat[current])
    }
  }

  const loadingRequests = requests === null
  const searchingArticles = term.length >= 2 && articles.query !== term

  return (
    <Modal title="Search" titleHidden onClose={onClose} className="palette" initialFocus="input">
      <div className="palette-input">
        <Icon name="search" size={18} />
        <input
          type="text"
          role="combobox"
          aria-label="Search pages, requests and articles"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={flat[current] ? `${listId}-${flat[current].id}` : undefined}
          placeholder="Search pages, requests and articles…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck="false"
        />
        <kbd>Esc</kbd>
      </div>
      <div className="palette-list" id={listId} role="listbox" aria-label="Results" ref={listRef}>
        {groups.map(([heading, items]) => (
          <div key={heading} role="group" aria-label={heading}>
            <p className="palette-group" aria-hidden="true">
              {heading}
            </p>
            {items.map((item) => {
              const selected = flat[current]?.id === item.id
              return (
                <div
                  key={item.id}
                  id={`${listId}-${item.id}`}
                  role="option"
                  aria-selected={selected}
                  className="palette-option"
                  onMouseMove={() => setActive(flat.indexOf(item))}
                  onClick={() => run(item)}
                >
                  <Icon name={item.icon} />
                  <span className="palette-label">{item.label}</span>
                  {item.hint && <span className="palette-hint">{item.hint}</span>}
                </div>
              )
            })}
          </div>
        ))}
        {flat.length === 0 && !loadingRequests && !searchingArticles && (
          <p className="palette-empty">Nothing matches “{query.trim()}”.</p>
        )}
      </div>
      <p className="palette-status" role="status">
        {loadingRequests || searchingArticles
          ? 'Searching…'
          : `${flat.length} ${flat.length === 1 ? 'result' : 'results'}`}
      </p>
    </Modal>
  )
}

import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { countsResponse, HEALTH, mockFetch, page } from './helpers'
import { ADMIN_USER, AGENT_USER, DEFAULT_USER, renderSignedIn } from './renderApp'

// The app shell's tools: search, shortcuts, the account menu, the tour and the sidebar (ADR-066).
const ROUTES = {
  ...HEALTH,
  'GET /requests': () => page([]),
  'GET /requests/counts': () => countsResponse(),
  'GET /knowledge': () => page([]),
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('command palette', () => {
  const PALETTE_ROUTES = {
    ...ROUTES,
    'GET /requests': () =>
      page([
        { id: 'r-printer', title: 'Printer on floor 3 jams', status: 'NEW', category: 'HARDWARE', priority: 'LOW' },
        { id: 'r-vpn', title: 'VPN drops every few minutes', status: 'TRIAGED', category: 'NETWORK', priority: 'MEDIUM' },
      ]),
    'GET /knowledge': () => page([{ id: 'a1', title: 'VPN connectivity troubleshooting' }]),
    'GET /requests/r-vpn': () => new Promise(() => {}),
  }

  it('opens with Ctrl+K, finds requests and articles, and opens one with Enter', async () => {
    mockFetch(PALETTE_ROUTES)
    renderSignedIn('/knowledge', DEFAULT_USER)
    await userEvent.keyboard('{Control>}k{/Control}')
    const dialog = screen.getByRole('dialog', { name: 'Search' })
    const input = within(dialog).getByRole('combobox', { name: 'Search pages, requests and articles' })
    expect(input).toHaveFocus()
    await userEvent.type(input, 'vpn')
    expect(await within(dialog).findByRole('option', { name: /VPN drops every few minutes/ })).toBeInTheDocument()
    expect(within(dialog).queryByRole('option', { name: /Printer/ })).toBeNull()
    expect(await within(dialog).findByRole('option', { name: /VPN connectivity troubleshooting/ })).toBeInTheDocument()
    await userEvent.keyboard('{Enter}')
    expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull()
    expect(await screen.findByText('Loading request…')).toBeInTheDocument()
  })

  it('moves the selection with the arrow keys, and Escape closes it', async () => {
    mockFetch(PALETTE_ROUTES)
    renderSignedIn('/knowledge', DEFAULT_USER)
    await userEvent.click(screen.getByRole('button', { name: 'Open search' }))
    const dialog = screen.getByRole('dialog', { name: 'Search' })
    const input = within(dialog).getByRole('combobox')
    const first = within(dialog).getAllByRole('option')[0]
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', first.id)
    await userEvent.keyboard('{ArrowDown}')
    expect(within(dialog).getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Open search' })).toHaveFocus()
  })

  it('only offers pages this person can use', async () => {
    mockFetch(PALETTE_ROUTES)
    renderSignedIn('/knowledge', DEFAULT_USER)
    await userEvent.keyboard('{Control>}k{/Control}')
    const dialog = screen.getByRole('dialog', { name: 'Search' })
    expect(within(dialog).getByRole('option', { name: /My requests/ })).toBeInTheDocument()
    expect(within(dialog).queryByRole('option', { name: /Support queue/ })).toBeNull()
    expect(within(dialog).queryByRole('option', { name: /Audit/ })).toBeNull()
  })
})

describe('keyboard shortcuts', () => {
  it('lists the shortcuts on ?, and goes to a page with g then a key', async () => {
    mockFetch(ROUTES)
    renderSignedIn('/knowledge', ADMIN_USER)
    await userEvent.keyboard('?')
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
    expect(within(dialog).getByText('Audit')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.keyboard('gd')
    expect(await screen.findByRole('heading', { name: 'My requests' })).toBeInTheDocument()
  })

  it('ignores shortcuts while typing in a field', async () => {
    mockFetch(ROUTES)
    renderSignedIn('/knowledge', DEFAULT_USER)
    await userEvent.type(screen.getByLabelText('Search articles'), 'gd?')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Knowledge base' })).toBeInTheDocument()
  })
})

describe('account menu', () => {
  it('opens on the button, moves with arrows, and Escape returns focus', async () => {
    mockFetch(ROUTES)
    renderSignedIn('/knowledge', DEFAULT_USER)
    const button = screen.getByRole('button', { name: /^Account menu/ })
    await userEvent.click(button)
    const items = screen.getAllByRole('menuitem')
    expect(items[0]).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(items[items.length - 1]).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(button).toHaveFocus()
  })
})

describe('first-visit tour', () => {
  it('shows on a first visit, steps through, and is remembered when skipped', async () => {
    localStorage.removeItem('iks-tour-done')
    mockFetch(ROUTES)
    renderSignedIn('/knowledge', AGENT_USER)
    const tour = screen.getByTestId('tour')
    expect(within(tour).getByRole('heading', { name: 'Welcome, Alex' })).toBeInTheDocument()
    expect(tour).toHaveTextContent('1 / 4')
    await userEvent.click(within(tour).getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Your queue' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Skip the tour' }))
    expect(screen.queryByTestId('tour')).toBeNull()
    expect(localStorage.getItem('iks-tour-done')).toBe('1')
  })

  it('does not show again once done', () => {
    mockFetch(ROUTES)
    renderSignedIn('/knowledge', DEFAULT_USER)
    expect(screen.queryByTestId('tour')).toBeNull()
  })
})

describe('sidebar and breadcrumbs', () => {
  afterEach(() => {
    localStorage.removeItem('iks-sidebar-collapsed')
  })

  it('collapses, and remembers it', async () => {
    mockFetch(ROUTES)
    const { unmount } = renderSignedIn('/knowledge', DEFAULT_USER)
    await userEvent.click(screen.getByRole('button', { name: 'Collapse the sidebar' }))
    expect(localStorage.getItem('iks-sidebar-collapsed')).toBe('1')
    unmount()
    renderSignedIn('/knowledge', DEFAULT_USER)
    expect(screen.getByRole('button', { name: 'Expand the sidebar' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows where the page sits', () => {
    mockFetch({ ...ROUTES, 'GET /requests/r1': () => new Promise(() => {}) })
    renderSignedIn('/support/r1', AGENT_USER)
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Support queue' })).toHaveAttribute('href', '/support')
    expect(within(crumbs).getByText('Request')).toHaveAttribute('aria-current', 'page')
  })
})

describe('support queue keyboard', () => {
  it('moves between rows with j and k, and leaves g sequences alone', async () => {
    const rows = [
      { id: 'q1', title: 'First request', status: 'NEW', category: 'OTHER', priority: 'LOW', created_at: '2026-11-10T10:00:00Z', version: 1 },
      { id: 'q2', title: 'Second request', status: 'NEW', category: 'OTHER', priority: 'LOW', created_at: '2026-11-10T11:00:00Z', version: 1 },
    ]
    mockFetch({ ...ROUTES, 'GET /requests': () => page(rows) })
    renderSignedIn('/support', AGENT_USER)
    const first = await screen.findByRole('link', { name: 'First request' })
    await userEvent.keyboard('j')
    expect(first).toHaveFocus()
    await userEvent.keyboard('j')
    expect(screen.getByRole('link', { name: 'Second request' })).toHaveFocus()
    await userEvent.keyboard('k')
    expect(first).toHaveFocus()
    await userEvent.keyboard('gk')
    expect(await screen.findByRole('heading', { name: 'Knowledge base' })).toBeInTheDocument()
  })
})

describe('reply diff', () => {
  it('shows what staff changed in the draft, in words', async () => {
    const { render } = await import('@testing-library/react')
    const { default: ReplyDiff } = await import('../components/ReplyDiff')
    render(<ReplyDiff draft="Please send us your password." reply="Please never share your password." />)
    const diff = screen.getByTestId('reply-diff')
    expect(diff).toHaveTextContent('+2 words')
    expect(diff).toHaveTextContent('−2 words')
    expect(diff.querySelectorAll('ins')).toHaveLength(1)
    expect(diff.querySelectorAll('del')).toHaveLength(1)
  })
})

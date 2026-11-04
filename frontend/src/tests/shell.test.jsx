import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { friendlyMessage, needsReload } from '../api/errors'
import ConfirmDialog from '../components/ConfirmDialog'
import { countsResponse, HEALTH, jsonResponse, mockFetch, page } from './helpers'
import { ADMIN_USER, AGENT_USER, DEFAULT_USER, renderApp, renderSignedIn } from './renderApp'

const ROUTES = {
  ...HEALTH,
  'GET /requests': () => page([]),
  'GET /requests/counts': () => countsResponse(),
  'GET /knowledge': () => page([]),
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function navLabels() {
  const nav = screen.getByRole('navigation', { name: 'Main' })
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent)
}

describe('role-aware navigation', () => {
  const BASE = ['My requests', 'New request', 'Knowledge']

  it.each([
    ['USER', DEFAULT_USER, BASE],
    ['AGENT', AGENT_USER, [...BASE, 'Support queue']],
    ['ADMIN', ADMIN_USER, [...BASE, 'Support queue', 'Knowledge admin', 'Audit']],
  ])('shows %s only the links they can use', (_role, user, expected) => {
    mockFetch(ROUTES)
    renderSignedIn('/knowledge', user)
    expect(navLabels()).toEqual(expected)
  })

  it('shows the signed-in person, their role and a way to sign out', () => {
    mockFetch(ROUTES)
    renderSignedIn('/knowledge', AGENT_USER)
    const banner = screen.getByRole('banner')
    expect(within(banner).getByText('Alex Chen · Support agent')).toBeInTheDocument()
    expect(within(banner).getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('shows the public demo notice in the app shell', async () => {
    mockFetch({
      ...ROUTES,
      'GET /config': () =>
        jsonResponse({
          demo_mode: true,
          demo_password_hint: 'x',
          demo_banner: 'Public demo — resets daily.',
          ai_notice: null,
        }),
    })
    renderSignedIn('/knowledge', DEFAULT_USER)
    expect(await screen.findByTestId('demo-banner')).toHaveTextContent('Public demo — resets daily.')
  })

  it('has a skip link, a main landmark and a polite live region', () => {
    mockFetch(ROUTES)
    renderSignedIn('/knowledge')
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main-content')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
    expect(screen.getByTestId('live-region')).toHaveAttribute('aria-live', 'polite')
  })

  it('marks the current page in the navigation', () => {
    mockFetch(ROUTES)
    renderSignedIn('/knowledge')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Knowledge' })).toHaveAttribute('aria-current', 'page')
  })

  it('moves focus to the main content after navigating', async () => {
    mockFetch(ROUTES)
    renderSignedIn('/knowledge')
    await userEvent.click(screen.getByRole('link', { name: 'New request' }))
    expect(screen.getByRole('main')).toHaveFocus()
  })
})

describe('route guards', () => {
  it.each(['/support', '/support/r1', '/admin/knowledge', '/admin/audit'])(
    'shows a requester the access page at %s',
    (path) => {
      mockFetch(ROUTES)
      renderSignedIn(path)
      expect(screen.getByRole('heading', { name: "You don't have access" })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Go to my requests' })).toHaveAttribute('href', '/dashboard')
    },
  )

  it.each(['/admin/knowledge', '/admin/audit'])('shows an agent the access page at %s', (path) => {
    mockFetch(ROUTES)
    renderSignedIn(path, AGENT_USER)
    expect(screen.getByRole('heading', { name: "You don't have access" })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the support queue' })).toHaveAttribute('href', '/support')
  })
})

describe('not found page', () => {
  it('keeps the app shell and links to the right home for staff', () => {
    mockFetch(ROUTES)
    renderSignedIn('/no-such-page', ADMIN_USER)
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the support queue' })).toHaveAttribute('href', '/support')
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('links to sign in for a signed-out visitor', () => {
    mockFetch(HEALTH)
    renderApp('/no-such-page')
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/login')
  })
})

describe('friendly error messages', () => {
  const error = (code, extra = {}) => new ApiError({ status: 409, code, message: 'raw server text', ...extra })

  it.each([
    ['STALE_UPDATE', 'Someone else changed this request. Reload to see the latest version.'],
    ['ANALYZE_LIMIT_REACHED', 'Our support team will triage this manually.'],
    ['ANALYSIS_IN_PROGRESS', 'Analysis is already running. Check again in a moment.'],
    ['ANALYSIS_FAILED', 'We could not analyze this request right now. Your request is saved.'],
    ['AI_TIMEOUT', 'The AI provider took too long to respond. The request is saved.'],
    ['SLUG_CONFLICT', 'Another article already uses this slug. Choose a different one.'],
  ])('maps %s', (code, message) => {
    expect(friendlyMessage(error(code))).toBe(message)
  })

  it('states the wait from Retry-After on a 429', () => {
    expect(friendlyMessage(error('RATE_LIMITED', { retryAfter: 45 }))).toContain('wait 45 seconds')
    expect(friendlyMessage(error('RATE_LIMITED', { retryAfter: 1 }))).toContain('wait 1 second ')
    expect(friendlyMessage(error('RATE_LIMITED', { retryAfter: 3600 }))).toContain('about 60 minutes')
    expect(friendlyMessage(error('RATE_LIMITED'))).toContain('wait a moment')
  })

  it('falls back to the server message for codes it does not know', () => {
    expect(friendlyMessage(error('VALIDATION_ERROR'))).toBe('raw server text')
  })

  it('knows which errors a reload would fix', () => {
    expect(needsReload(error('STALE_UPDATE'))).toBe(true)
    expect(needsReload(error('UNSAFE_REPLY'))).toBe(false)
  })
})

describe('ConfirmDialog', () => {
  function Harness({ onConfirm = () => {}, onCancel = () => {} }) {
    return (
      <ConfirmDialog title="Approve this reply?" confirmLabel="Approve" onConfirm={onConfirm} onCancel={onCancel}>
        <p>The requester will see it.</p>
      </ConfirmDialog>
    )
  }

  it('is a labelled modal dialog that starts on the safe choice', () => {
    render(<Harness />)
    expect(screen.getByRole('dialog', { name: 'Approve this reply?' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('The requester will see it.')
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('keeps Tab inside the dialog in both directions', async () => {
    render(
      <>
        <button type="button">Outside</button>
        <Harness />
      </>,
    )
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    const approve = screen.getByRole('button', { name: 'Approve' })

    await userEvent.tab()
    expect(approve).toHaveFocus()
    await userEvent.tab()
    expect(cancel).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(approve).toHaveFocus()
  })

  it('cancels on Escape and confirms on its button', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(<Harness onCancel={onCancel} onConfirm={onConfirm} />)

    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('returns focus to the control that opened it', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()

    const { unmount } = render(<Harness />)
    expect(opener).not.toHaveFocus()
    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })
})

describe('narrow-screen menu', () => {
  const ROUTES = {
    ...HEALTH,
    'GET /requests': () => page([]),
    'GET /requests/counts': () => countsResponse(),
    'GET /knowledge': () => page([]),
  }

  it('is a labelled button that toggles the main navigation', async () => {
    mockFetch(ROUTES)
    renderSignedIn('/dashboard')
    const button = await screen.findByRole('button', { name: 'Menu' })
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveAttribute('aria-controls', nav.id)
    expect(nav).not.toHaveClass('nav-open')

    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(nav).toHaveClass('nav-open')
  })

  it('closes on Escape, returning focus to the button', async () => {
    mockFetch(ROUTES)
    renderSignedIn('/dashboard')
    const button = await screen.findByRole('button', { name: 'Menu' })
    await userEvent.click(button)
    screen.getByRole('link', { name: 'Knowledge' }).focus()
    await userEvent.keyboard('{Escape}')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveFocus()
  })

  it('closes after choosing a link', async () => {
    mockFetch(ROUTES)
    renderSignedIn('/dashboard')
    const button = await screen.findByRole('button', { name: 'Menu' })
    await userEvent.click(button)
    await userEvent.click(screen.getByRole('link', { name: 'Knowledge' }))
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })
})

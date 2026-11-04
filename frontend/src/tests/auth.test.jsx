import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { errorResponse, jsonResponse, mockFetch } from './helpers'
import { DEFAULT_USER, renderApp } from './renderApp'

const HEALTH = { 'GET /healthz': () => jsonResponse({ status: 'ok' }) }
const EMPTY_PAGE = { items: [], total: 0, limit: 20, offset: 0 }

function signInRoutes(extra = {}) {
  return {
    ...HEALTH,
    'POST /auth/login': () =>
      jsonResponse({
        access_token: 'test-token',
        token_type: 'bearer',
        expires_in: 1800,
        user: DEFAULT_USER,
      }),
    'GET /auth/me': () => jsonResponse(DEFAULT_USER),
    'GET /requests': () => jsonResponse(EMPTY_PAGE),
    ...extra,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('protected routes', () => {
  it('redirects a signed-out visitor to the login page', async () => {
    mockFetch(HEALTH)
    renderApp('/dashboard')
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })
})

describe('login', () => {
  it('validates that email and password are filled in', async () => {
    const fetchMock = mockFetch(HEALTH)
    renderApp('/login')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your email and password.')
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.anything(),
    )
  })

  it('shows a generic error for rejected credentials', async () => {
    mockFetch({
      ...HEALTH,
      'POST /auth/login': () =>
        errorResponse(401, 'INVALID_CREDENTIALS', 'Incorrect email or password'),
    })
    renderApp('/login')

    await userEvent.type(screen.getByLabelText('Email'), 'nobody@example.test')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('shows a network error when the API is unreachable', async () => {
    mockFetch({
      ...HEALTH,
      'POST /auth/login': () => {
        throw new TypeError('Failed to fetch')
      },
    })
    renderApp('/login')

    await userEvent.type(screen.getByLabelText('Email'), 'a@example.test')
    await userEvent.type(screen.getByLabelText('Password'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.')
  })

  it('pre-fills the email from the demo selector and signs in', async () => {
    const fetchMock = mockFetch(signInRoutes())
    renderApp('/login')

    await userEvent.selectOptions(
      screen.getByLabelText('Demo account'),
      DEFAULT_USER.email,
    )
    expect(screen.getByLabelText('Email')).toHaveValue(DEFAULT_USER.email)
    expect(screen.getByLabelText('Password')).toHaveValue('')

    await userEvent.type(screen.getByLabelText('Password'), 'demo-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()

    const authedCall = fetchMock.mock.calls.find(([url]) => url.endsWith('/auth/me'))
    expect(authedCall[1].headers.Authorization).toBe('Bearer test-token')
  })

  it('does not write the token to browser storage', async () => {
    mockFetch(signInRoutes())
    renderApp('/login')
    await userEvent.type(screen.getByLabelText('Email'), DEFAULT_USER.email)
    await userEvent.type(screen.getByLabelText('Password'), 'demo-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByRole('heading', { name: 'Dashboard' })

    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('returns to the login page on sign out', async () => {
    mockFetch(signInRoutes())
    renderApp('/login')
    await userEvent.type(screen.getByLabelText('Email'), DEFAULT_USER.email)
    await userEvent.type(screen.getByLabelText('Password'), 'demo-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })

  it('returns to the requested page after signing in', async () => {
    const page = { items: [], total: 0, limit: 20, offset: 0 }
    mockFetch(signInRoutes({ 'GET /knowledge': () => jsonResponse(page) }))
    renderApp('/knowledge?q=wifi')

    await screen.findByRole('heading', { name: /sign in/i })
    await userEvent.type(screen.getByLabelText('Email'), DEFAULT_USER.email)
    await userEvent.type(screen.getByLabelText('Password'), 'demo-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Knowledge base' })).toBeInTheDocument()
    expect(screen.getByLabelText('Search articles')).toHaveValue('wifi')
  })

  it('sends the next user to the dashboard after a deliberate sign-out', async () => {
    const page = { items: [], total: 0, limit: 20, offset: 0 }
    mockFetch(signInRoutes({ 'GET /knowledge': () => jsonResponse(page) }))
    renderApp('/knowledge')

    await screen.findByRole('heading', { name: /sign in/i })
    await userEvent.type(screen.getByLabelText('Email'), DEFAULT_USER.email)
    await userEvent.type(screen.getByLabelText('Password'), 'demo-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByRole('heading', { name: 'Knowledge base' })

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByRole('heading', { name: /sign in/i })
    await userEvent.type(screen.getByLabelText('Email'), DEFAULT_USER.email)
    await userEvent.type(screen.getByLabelText('Password'), 'demo-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('clears the session when the API rejects the token', async () => {
    mockFetch(
      signInRoutes({
        'GET /auth/me': () => errorResponse(401, 'UNAUTHORIZED', 'Authentication required'),
      }),
    )
    renderApp('/login')
    await userEvent.type(screen.getByLabelText('Email'), DEFAULT_USER.email)
    await userEvent.type(screen.getByLabelText('Password'), 'demo-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument(),
    )
  })
})

describe('not found', () => {
  it('shows a not-found page with a way back', () => {
    mockFetch(HEALTH)
    renderApp('/no-such-page')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument()
  })
})

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { callsTo, errorResponse, HEALTH, jsonResponse, mockFetch } from './helpers'
import { AGENT_USER, DEFAULT_USER, renderApp } from './renderApp'

const EMPTY_PAGE = { items: [], total: 0, limit: 20, offset: 0 }
const EMPTY_COUNTS = { counts: {}, total: 0 }

function signInRoutes(extra = {}, user = DEFAULT_USER) {
  return {
    ...HEALTH,
    'POST /auth/login': () =>
      jsonResponse({
        access_token: 'test-token',
        token_type: 'bearer',
        expires_in: 1800,
        user,
      }),
    'GET /requests': () => jsonResponse(EMPTY_PAGE),
    'GET /requests/counts': () => jsonResponse(EMPTY_COUNTS),
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
      await screen.findByLabelText('Demo account'),
      DEFAULT_USER.email,
    )
    expect(screen.getByLabelText('Email')).toHaveValue(DEFAULT_USER.email)
    expect(screen.getByLabelText('Password')).toHaveValue('')

    await userEvent.type(screen.getByLabelText('Password'), 'demo-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'My requests' })).toBeInTheDocument()

    const authedCall = fetchMock.mock.calls.find(([url]) => url.includes('/requests'))
    expect(authedCall[1].headers.Authorization).toBe('Bearer test-token')
  })

  it('no longer warns that reloading signs out', async () => {
    mockFetch(HEALTH)
    renderApp('/login')
    await screen.findByLabelText('Demo account')
    expect(screen.queryByText(/reloading the page signs you out/)).toBeNull()
  })

  it('shows the demo accounts and password only when the server says this is a demo', async () => {
    mockFetch(HEALTH)
    renderApp('/login')
    expect(await screen.findByText('Public demo password: public-demo-hint')).toBeInTheDocument()
    expect(screen.getByLabelText('Demo account')).toBeInTheDocument()
  })

  it('hides the demo help on a site that is not a demo', async () => {
    let answered = false
    mockFetch({
      ...HEALTH,
      'GET /config': () => {
        answered = true
        return jsonResponse({ demo_mode: false, demo_password_hint: null })
      },
    })
    renderApp('/login')
    await waitFor(() => expect(answered).toBe(true))
    await screen.findByRole('button', { name: 'Sign in' })
    expect(screen.queryByLabelText('Demo account')).toBeNull()
    expect(screen.queryByText(/demo password/i)).toBeNull()
  })

  it('hides the demo help if the setting cannot be read', async () => {
    mockFetch({ ...HEALTH, 'GET /config': () => errorResponse(500, 'INTERNAL_ERROR', 'raw') })
    renderApp('/login')
    await screen.findByRole('button', { name: 'Sign in' })
    expect(screen.queryByLabelText('Demo account')).toBeNull()
  })

  it('tells the person how long to wait when sign-in is rate limited', async () => {
    mockFetch({
      ...HEALTH,
      'POST /auth/login': () =>
        new Response(
          JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'raw', request_id: 'x' } }),
          { status: 429, headers: { 'Retry-After': '60' } },
        ),
    })
    renderApp('/login')
    await userEvent.type(screen.getByLabelText('Email'), DEFAULT_USER.email)
    await userEvent.type(screen.getByLabelText('Password'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('wait 60 seconds')
  })

  it('sends staff to the support queue by default', async () => {
    mockFetch(signInRoutes({}, AGENT_USER))
    renderApp('/login')
    await userEvent.type(screen.getByLabelText('Email'), AGENT_USER.email)
    await userEvent.type(screen.getByLabelText('Password'), 'demo-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Support queue' })).toBeInTheDocument()
  })

  it('does not write the token to browser storage', async () => {
    mockFetch(signInRoutes())
    renderApp('/login')
    await userEvent.type(screen.getByLabelText('Email'), DEFAULT_USER.email)
    await userEvent.type(screen.getByLabelText('Password'), 'demo-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByRole('heading', { name: 'My requests' })

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

    expect(await screen.findByRole('heading', { name: 'My requests' })).toBeInTheDocument()
  })

  it('clears the session and explains why when the API rejects the token', async () => {
    mockFetch(
      signInRoutes({
        'GET /requests': () => errorResponse(401, 'UNAUTHORIZED', 'Authentication required'),
      }),
    )
    renderApp('/login')
    await userEvent.type(screen.getByLabelText('Email'), DEFAULT_USER.email)
    await userEvent.type(screen.getByLabelText('Password'), 'demo-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument(),
    )
    expect(screen.getByText(/Your session ended/)).toBeInTheDocument()
  })
})

describe('keeping the session', () => {
  const session = (user = DEFAULT_USER) => ({
    access_token: 'restored-token',
    token_type: 'bearer',
    expires_in: 1800,
    user,
  })

  it('restores the session on load, without showing the sign-in page', async () => {
    const fetchMock = mockFetch(signInRoutes({ 'POST /auth/refresh': () => jsonResponse(session()) }))
    renderApp('/dashboard')

    expect(await screen.findByRole('heading', { name: 'My requests' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /sign in/i })).toBeNull()
    const [, options] = callsTo(fetchMock, 'POST', '/auth/refresh')[0]
    expect(options.headers['X-Requested-With']).toBe('iknowserviceai')
    const authed = fetchMock.mock.calls.find(([url]) => url.includes('/requests'))
    expect(authed[1].headers.Authorization).toBe('Bearer restored-token')
  })

  it('shows the sign-in page, keeping the destination, when there is no session', async () => {
    const fetchMock = mockFetch(
      signInRoutes({
        'POST /auth/refresh': () => errorResponse(401, 'UNAUTHORIZED', 'x'),
        'GET /knowledge': () => jsonResponse(EMPTY_PAGE),
      }),
    )
    renderApp('/knowledge')
    await screen.findByRole('heading', { name: /sign in/i })
    expect(screen.queryByText(/Your session ended/)).toBeNull()

    await userEvent.type(screen.getByLabelText('Email'), DEFAULT_USER.email)
    await userEvent.type(screen.getByLabelText('Password'), 'demo-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Knowledge base' })).toBeInTheDocument()
    expect(callsTo(fetchMock, 'POST', '/auth/refresh')).toHaveLength(1)
  })

  it('moves on from the sign-in page when a session is restored there', async () => {
    mockFetch(signInRoutes({ 'POST /auth/refresh': () => jsonResponse(session()) }))
    renderApp('/login')
    expect(await screen.findByRole('heading', { name: 'My requests' })).toBeInTheDocument()
  })

  it('refreshes once and retries when the access token has expired', async () => {
    let refreshed = false
    const fetchMock = mockFetch(
      signInRoutes({
        'POST /auth/refresh': () => {
          if (!refreshed) {
            refreshed = true
            return jsonResponse(session())
          }
          return jsonResponse({ ...session(), access_token: 'second-token' })
        },
        'GET /requests': ({ options }) =>
          options.headers.Authorization === 'Bearer second-token'
            ? jsonResponse(EMPTY_PAGE)
            : errorResponse(401, 'UNAUTHORIZED', 'expired'),
      }),
    )
    renderApp('/dashboard')
    expect(await screen.findByRole('heading', { name: 'My requests' })).toBeInTheDocument()
    await waitFor(() => expect(callsTo(fetchMock, 'POST', '/auth/refresh')).toHaveLength(2))
    expect(screen.queryByText(/Your session ended/)).toBeNull()
  })

  it('ends the session on the server when signing out', async () => {
    const fetchMock = mockFetch(
      signInRoutes({
        'POST /auth/refresh': () => jsonResponse(session()),
        'POST /auth/logout': () => new Response(null, { status: 204 }),
      }),
    )
    renderApp('/dashboard')
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    const [, options] = callsTo(fetchMock, 'POST', '/auth/logout')[0]
    expect(options.headers['X-Requested-With']).toBe('iknowserviceai')
  })

  it('still signs out locally when the server cannot be reached', async () => {
    mockFetch(
      signInRoutes({
        'POST /auth/refresh': () => jsonResponse(session()),
        'POST /auth/logout': () => {
          throw new TypeError('Failed to fetch')
        },
      }),
    )
    renderApp('/dashboard')
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })
})

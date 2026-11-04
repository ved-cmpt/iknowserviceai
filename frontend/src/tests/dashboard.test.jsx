import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { errorResponse, jsonResponse, mockFetch } from './helpers'
import { DEFAULT_USER, renderSignedIn } from './renderApp'

const BASE = {
  'GET /healthz': () => jsonResponse({ status: 'ok' }),
  'GET /auth/me': () => jsonResponse(DEFAULT_USER),
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('dashboard', () => {
  it('shows the profile and requests with text statuses', async () => {
    mockFetch({
      ...BASE,
      'GET /requests': () =>
        jsonResponse({
          items: [
            {
              id: 'r1',
              title: 'VPN disconnects',
              status: 'NEEDS_HUMAN_REVIEW',
              category: 'NETWORK',
              priority: 'HIGH',
              created_at: '2026-11-01T10:00:00Z',
              updated_at: '2026-11-01T10:00:00Z',
            },
          ],
          total: 1,
          limit: 20,
          offset: 0,
        }),
    })
    renderSignedIn('/dashboard')

    expect(await screen.findByText('Role: USER')).toBeInTheDocument()
    expect(await screen.findByText('VPN disconnects')).toBeInTheDocument()
    expect(screen.getByText('Needs human review')).toBeInTheDocument()
    expect(screen.getByText('Showing 1 of 1')).toBeInTheDocument()
  })

  it('shows a loading state while requests load', async () => {
    mockFetch({
      ...BASE,
      'GET /requests': () => new Promise(() => {}),
    })
    renderSignedIn('/dashboard')
    expect(await screen.findByText('Loading requests…')).toBeInTheDocument()
  })

  it('shows an empty state', async () => {
    mockFetch({
      ...BASE,
      'GET /requests': () => jsonResponse({ items: [], total: 0, limit: 20, offset: 0 }),
    })
    renderSignedIn('/dashboard')
    expect(await screen.findByText('There are no requests yet.')).toBeInTheDocument()
  })

  it('shows an error state and retries', async () => {
    let calls = 0
    mockFetch({
      ...BASE,
      'GET /requests': () => {
        calls += 1
        return calls === 1
          ? errorResponse(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
          : jsonResponse({ items: [], total: 0, limit: 20, offset: 0 })
      },
    })
    renderSignedIn('/dashboard')

    expect(await screen.findByRole('alert')).toHaveTextContent('An unexpected error occurred')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('There are no requests yet.')).toBeInTheDocument()
  })
})

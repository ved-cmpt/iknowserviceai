import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { callsTo, countsResponse, errorResponse, HEALTH, jsonResponse, mockFetch, page } from './helpers'
import { renderSignedIn } from './renderApp'

const REQUEST = {
  id: 'r1',
  title: 'VPN disconnects',
  status: 'NEEDS_HUMAN_REVIEW',
  category: 'NETWORK',
  priority: 'HIGH',
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-01T10:00:00Z',
}
const BASE = { ...HEALTH, 'GET /requests/counts': () => countsResponse({ NEW: 2, TRIAGED: 1 }) }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('dashboard', () => {
  it('shows requests with text statuses, linking to their detail page', async () => {
    mockFetch({ ...BASE, 'GET /requests': () => page([REQUEST]) })
    renderSignedIn('/dashboard')

    const link = await screen.findByRole('link', { name: 'VPN disconnects' })
    expect(link).toHaveAttribute('href', '/requests/r1')
    const row = link.closest('tr')
    expect(within(row).getByText('Needs human review')).toBeInTheDocument()
    expect(within(row).getByText('Network')).toBeInTheDocument()
    expect(within(row).getByText('High')).toBeInTheDocument()
  })

  it('shows counts by status as text', async () => {
    mockFetch({ ...BASE, 'GET /requests': () => page([]) })
    renderSignedIn('/dashboard')

    const counts = await screen.findByRole('list', { name: 'Requests by status' })
    expect(within(counts).getByText('New').closest('li')).toHaveTextContent('2New')
    expect(within(counts).getByText('Triaged').closest('li')).toHaveTextContent('1Triaged')
    expect(within(counts).getByText('Closed').closest('li')).toHaveTextContent('0Closed')
  })

  it('asks only for the signed-in person\'s own requests', async () => {
    const fetchMock = mockFetch({ ...BASE, 'GET /requests': () => page([]) })
    renderSignedIn('/dashboard')
    await screen.findByText('There are no requests yet.')

    const [[url]] = callsTo(fetchMock, 'GET', '/requests')
    expect(url).toContain('mine=true')
  })

  it('shows a loading state while requests load', async () => {
    mockFetch({ ...BASE, 'GET /requests': () => new Promise(() => {}) })
    renderSignedIn('/dashboard')
    expect(await screen.findByText('Loading requests…')).toBeInTheDocument()
  })

  it('shows an empty state with a way to create a request', async () => {
    mockFetch({ ...BASE, 'GET /requests': () => page([]) })
    renderSignedIn('/dashboard')

    const empty = (await screen.findByText('There are no requests yet.')).closest('div')
    expect(within(empty).getByRole('link', { name: 'New request' })).toHaveAttribute(
      'href',
      '/requests/new',
    )
  })

  it('shows an error state and retries', async () => {
    let calls = 0
    mockFetch({
      ...BASE,
      'GET /requests': () => {
        calls += 1
        return calls === 1
          ? errorResponse(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
          : page([])
      },
    })
    renderSignedIn('/dashboard')

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('There are no requests yet.')).toBeInTheDocument()
  })

  it('sends filters and sorting to the API, and says when nothing matches', async () => {
    const fetchMock = mockFetch({
      ...BASE,
      'GET /requests': ({ search }) => (search.includes('status=CLOSED') ? page([]) : page([REQUEST])),
    })
    renderSignedIn('/dashboard')
    await screen.findByRole('link', { name: 'VPN disconnects' })

    await userEvent.selectOptions(screen.getByLabelText('Category'), 'NETWORK')
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'priority:desc')
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'CLOSED')

    expect(await screen.findByText('No requests match these filters.')).toBeInTheDocument()
    const urls = callsTo(fetchMock, 'GET', '/requests').map(([url]) => url)
    const last = urls[urls.length - 1]
    expect(last).toContain('status=CLOSED')
    expect(last).toContain('category=NETWORK')
    expect(last).toContain('sort=priority')
    expect(last).toContain('direction=desc')
  })

  it('pages through results', async () => {
    const fetchMock = mockFetch({
      ...BASE,
      'GET /requests': ({ search }) =>
        page([{ ...REQUEST, title: search.includes('offset=20') ? 'Second page' : 'First page' }], {
          total: 25,
          offset: search.includes('offset=20') ? 20 : 0,
        }),
    })
    renderSignedIn('/dashboard')
    await screen.findByRole('link', { name: 'First page' })
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByRole('link', { name: 'Second page' })).toBeInTheDocument()
    expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument()
    expect(callsTo(fetchMock, 'GET', '/requests').at(-1)[0]).toContain('offset=20')
  })
})

describe('jsonResponse helper', () => {
  it('keeps the shared test helpers honest', async () => {
    expect(await jsonResponse({ a: 1 }).json()).toEqual({ a: 1 })
  })
})

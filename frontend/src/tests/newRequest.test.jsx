import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bodiesSentTo, callsTo, errorResponse, HEALTH, jsonResponse, mockFetch } from './helpers'
import { AGENT_USER, renderSignedIn } from './renderApp'

const VALID_TITLE = 'Wi-Fi connects but pages fail'
const VALID_DESCRIPTION = 'My laptop shows connected, but every website times out.'
const DETAIL = {
  id: 'r1',
  title: VALID_TITLE,
  description: VALID_DESCRIPTION,
  status: 'NEW',
  category: 'OTHER',
  priority: 'MEDIUM',
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-01T10:00:00Z',
  resolved_at: null,
  comments: [],
  events: [],
  suggestion_state: null,
  suggestion: null,
}
const CREATED = () => jsonResponse({ id: 'r1', title: VALID_TITLE, status: 'NEW' }, 201)

afterEach(() => {
  vi.unstubAllGlobals()
})

async function fillIn(title = VALID_TITLE, description = VALID_DESCRIPTION) {
  if (title) await userEvent.type(screen.getByLabelText(/^Title/), title)
  if (description) await userEvent.type(screen.getByLabelText(/^Description/), description)
}

describe('new request form', () => {
  it('shows live character counts wired to the fields', async () => {
    mockFetch(HEALTH)
    renderSignedIn('/requests/new')

    await userEvent.type(screen.getByLabelText(/^Title/), 'Hello')

    const count = screen.getByText('5 of 120 characters')
    expect(screen.getByLabelText(/^Title/).getAttribute('aria-describedby')).toContain(count.id)
    expect(screen.getByText('0 of 4000 characters')).toBeInTheDocument()
  })

  it.each([
    ['ab', VALID_DESCRIPTION, /title of at least 3/],
    ['x'.repeat(121), VALID_DESCRIPTION, /title to 120/],
    [VALID_TITLE, 'too short', /at least 10/],
    [VALID_TITLE, '          ', /at least 10/],
  ])('rejects title %j and description %j without calling the API', async (title, description, message) => {
    const fetchMock = mockFetch(HEALTH)
    renderSignedIn('/requests/new')

    await userEvent.click(screen.getByLabelText(/^Title/))
    await userEvent.paste(title)
    await userEvent.click(screen.getByLabelText(/^Description/))
    await userEvent.paste(description)
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }))

    expect(screen.getByText(message)).toBeInTheDocument()
    expect(callsTo(fetchMock, 'POST', '/requests')).toHaveLength(0)
  })

  it('marks the invalid field and moves focus to it', async () => {
    mockFetch(HEALTH)
    renderSignedIn('/requests/new')

    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }))

    const title = screen.getByLabelText(/^Title/)
    expect(title).toHaveAttribute('aria-invalid', 'true')
    expect(title).toHaveFocus()
    const error = screen.getByText(/title of at least 3/)
    expect(title.getAttribute('aria-describedby')).toContain(error.id)
  })

  it('accepts text at the upper bounds and trims what it sends', async () => {
    const fetchMock = mockFetch({
      ...HEALTH,
      'POST /requests': CREATED,
      'GET /requests/r1': () => jsonResponse(DETAIL),
      'POST /requests/r1/analyze': () => jsonResponse(DETAIL),
    })
    renderSignedIn('/requests/new')
    const longTitle = 'x'.repeat(120)
    const longBody = 'y'.repeat(4000)

    await userEvent.click(screen.getByLabelText(/^Title/))
    await userEvent.paste(`  ${longTitle}  `)
    await userEvent.click(screen.getByLabelText(/^Description/))
    await userEvent.paste(longBody)
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }))

    await waitFor(() =>
      expect(bodiesSentTo(fetchMock, 'POST', '/requests')).toEqual([
        { title: longTitle, description: longBody },
      ]),
    )
  })

  it('does not submit twice on a double click', async () => {
    let release
    const fetchMock = mockFetch({
      ...HEALTH,
      'POST /requests': () =>
        new Promise((resolve) => {
          release = () => resolve(CREATED())
        }),
      'GET /requests/r1': () => jsonResponse(DETAIL),
      'POST /requests/r1/analyze': () => jsonResponse(DETAIL),
    })
    renderSignedIn('/requests/new')
    await fillIn()

    await userEvent.dblClick(screen.getByRole('button', { name: 'Submit request' }))

    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled()
    expect(callsTo(fetchMock, 'POST', '/requests')).toHaveLength(1)
    release()
    await screen.findByRole('heading', { name: VALID_TITLE })
    expect(callsTo(fetchMock, 'POST', '/requests')).toHaveLength(1)
  })

  it('keeps the typed text and shows the server error when creating fails', async () => {
    mockFetch({
      ...HEALTH,
      'POST /requests': () => errorResponse(500, 'INTERNAL_ERROR', 'boom'),
    })
    renderSignedIn('/requests/new')
    await fillIn()
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side')
    expect(screen.getByLabelText(/^Title/)).toHaveValue(VALID_TITLE)
    expect(screen.getByRole('button', { name: 'Submit request' })).toBeEnabled()
  })

  it('opens the detail page and analyzes exactly once, showing the visible step', async () => {
    let finish
    const fetchMock = mockFetch({
      ...HEALTH,
      'POST /requests': CREATED,
      'GET /requests/r1': () => jsonResponse(DETAIL),
      'POST /requests/r1/analyze': () =>
        new Promise((resolve) => {
          finish = () =>
            resolve(
              jsonResponse({
                ...DETAIL,
                status: 'TRIAGED',
                suggestion_state: 'AVAILABLE',
                suggestion: {
                  id: 's1',
                  reply: 'Try restarting the adapter.',
                  citations: [],
                  label: 'x',
                  feedback_submitted: false,
                },
              }),
            )
        }),
    })
    renderSignedIn('/requests/new')
    await fillIn()
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }))

    expect(await screen.findByText('Analyzing your request…')).toBeInTheDocument()
    await waitFor(() => expect(callsTo(fetchMock, 'POST', '/requests/r1/analyze')).toHaveLength(1))

    finish()
    expect(await screen.findByText('Try restarting the adapter.')).toBeInTheDocument()
    expect(callsTo(fetchMock, 'POST', '/requests/r1/analyze')).toHaveLength(1)
  })

  it('does not analyze again when a request page is simply opened', async () => {
    const fetchMock = mockFetch({ ...HEALTH, 'GET /requests/r1': () => jsonResponse(DETAIL) })
    renderSignedIn('/requests/r1')

    expect(await screen.findByRole('button', { name: 'Analyze' })).toBeInTheDocument()
    expect(callsTo(fetchMock, 'POST', '/requests/r1/analyze')).toHaveLength(0)
  })

  it('sends staff to the staff screen after creating a request', async () => {
    const staffDetail = {
      ...DETAIL,
      version: 1,
      requester: { id: AGENT_USER.id, email: AGENT_USER.email, display_name: 'Alex Chen', role: 'AGENT' },
      assigned_agent: null,
      attempts_remaining: 3,
      ai_runs: [],
    }
    const fetchMock = mockFetch({
      ...HEALTH,
      'POST /requests': CREATED,
      'GET /requests/r1': () => jsonResponse(staffDetail),
      'POST /requests/r1/analyze': () => jsonResponse(staffDetail),
    })
    renderSignedIn('/requests/new', AGENT_USER)
    await fillIn()
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }))

    await screen.findByRole('heading', { level: 1, name: VALID_TITLE })
    expect(screen.getByText('Support request')).toBeInTheDocument()
    expect(callsTo(fetchMock, 'POST', '/requests')).toHaveLength(1)
    await waitFor(() => expect(callsTo(fetchMock, 'POST', '/requests/r1/analyze')).toHaveLength(1))
  })
})

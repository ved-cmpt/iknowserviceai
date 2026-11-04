import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bodiesSentTo, callsTo, errorResponse, HEALTH, jsonResponse, mockFetch } from './helpers'
import { renderSignedIn } from './renderApp'

const HELD_TEXT = 'HELD-DRAFT-TEXT please share your password'
const REPLY = 'First restart the adapter.\nThen forget the network.'
const BASE_REQUEST = {
  id: 'r1',
  title: 'Wi-Fi connects but pages fail',
  description: 'Every website times out.',
  status: 'TRIAGED',
  category: 'NETWORK',
  priority: 'MEDIUM',
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-02T10:00:00Z',
  resolved_at: null,
  comments: [],
  events: [],
  suggestion_state: null,
  suggestion: null,
}
const SUGGESTION = {
  id: 's1',
  reply: REPLY,
  citations: [{ id: 'a1', title: 'Wi-Fi connected but websites not loading' }],
  label: 'AI-generated suggestion; verify before acting',
  feedback_submitted: false,
}
const WITH_SUGGESTION = { ...BASE_REQUEST, suggestion_state: 'AVAILABLE', suggestion: SUGGESTION }
const NEW_REQUEST = { ...BASE_REQUEST, status: 'NEW', category: 'OTHER' }

function renderDetail(request, extra = {}) {
  const fetchMock = mockFetch({
    ...HEALTH,
    'GET /requests/r1': () => jsonResponse(request),
    ...extra,
  })
  const view = renderSignedIn('/requests/r1')
  return { fetchMock, ...view }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('request header', () => {
  it('shows the title, status, category and priority as text', async () => {
    renderDetail(WITH_SUGGESTION)
    expect(await screen.findByRole('heading', { level: 1, name: BASE_REQUEST.title })).toBeInTheDocument()
    expect(screen.getByText('Triaged')).toBeInTheDocument()
    expect(screen.getByText('Network')).toBeInTheDocument()
    expect(screen.getByText('Medium')).toBeInTheDocument()
    expect(screen.getByText('Every website times out.')).toBeInTheDocument()
  })

  it('shows the not-found page for a request this user cannot see', async () => {
    mockFetch({
      ...HEALTH,
      'GET /requests/r1': () => errorResponse(404, 'NOT_FOUND', 'Request not found'),
    })
    renderSignedIn('/requests/r1')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to my requests' })).toHaveAttribute('href', '/dashboard')
  })
})

describe('AI section states', () => {
  it('shows the labelled suggestion with citation links that open in the app', async () => {
    renderDetail(WITH_SUGGESTION)

    expect(await screen.findByText('AI-generated suggestion — verify before acting')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: SUGGESTION.citations[0].title })).toHaveAttribute(
      'href',
      '/knowledge/a1',
    )
    expect(screen.getByRole('button', { name: 'Helpful' })).toBeEnabled()
  })

  it('renders the reply as plain text with its line breaks kept', async () => {
    const reply = '<img src=x onerror="alert(1)"><b>bold</b>\nline two'
    const { container } = renderDetail({
      ...WITH_SUGGESTION,
      suggestion: { ...SUGGESTION, reply },
    })

    const shown = await screen.findByTestId('suggestion-reply')
    expect(shown.textContent).toBe(reply)
    expect(shown).toHaveClass('preserve-lines')
    expect(container.querySelector('img')).toBeNull()
    expect(shown.querySelector('b')).toBeNull()
  })

  it('shows only the banner while awaiting review, even if a payload wrongly holds reply text', async () => {
    const { container } = renderDetail({
      ...BASE_REQUEST,
      status: 'NEEDS_HUMAN_REVIEW',
      suggestion_state: 'AWAITING_STAFF_REVIEW',
      suggestion: { ...SUGGESTION, reply: HELD_TEXT, proposed_reply: HELD_TEXT },
    })

    expect(
      await screen.findByText(
        "A support team member is reviewing this request. We'll show guidance here once it's approved.",
      ),
    ).toBeInTheDocument()
    expect(container).not.toHaveTextContent('HELD-DRAFT-TEXT')
    expect(screen.queryByRole('button', { name: 'Helpful' })).toBeNull()
    expect(screen.queryByText(/AI-generated suggestion/)).toBeNull()
  })

  it('shows no trace of AI text when a suggestion was rejected', async () => {
    const { container } = renderDetail({
      ...BASE_REQUEST,
      suggestion_state: null,
      suggestion: { ...SUGGESTION, reply: HELD_TEXT },
    })

    await screen.findByRole('heading', { level: 1, name: BASE_REQUEST.title })
    expect(container).not.toHaveTextContent('HELD-DRAFT-TEXT')
    expect(screen.queryByText(/AI-generated/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Analyze' })).toBeNull()
  })

  it('offers Analyze for a new request', async () => {
    renderDetail(NEW_REQUEST)
    expect(await screen.findByRole('button', { name: 'Analyze' })).toBeEnabled()
    expect(screen.getByText('This request has not been analyzed yet.')).toBeInTheDocument()
  })

  it('shows progress while analyzing, then replaces the page with the result', async () => {
    let finish
    const { fetchMock } = renderDetail(NEW_REQUEST, {
      'POST /requests/r1/analyze': () =>
        new Promise((resolve) => {
          finish = () => resolve(jsonResponse(WITH_SUGGESTION))
        }),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Analyze' }))

    const progress = screen.getByText('Analyzing your request…').closest('[aria-live]')
    expect(progress).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByRole('button', { name: 'Analyze' })).toBeNull()

    finish()
    expect(await screen.findByTestId('suggestion-reply')).toHaveTextContent('First restart')
    expect(callsTo(fetchMock, 'POST', '/requests/r1/analyze')).toHaveLength(1)
  })

  it('offers a retry with attempts remaining after a retryable failure', async () => {
    let calls = 0
    renderDetail(NEW_REQUEST, {
      'POST /requests/r1/analyze': () => {
        calls += 1
        return calls === 1
          ? errorResponse(503, 'ANALYSIS_FAILED', 'raw provider message', {
              extra: { retryable: true, attempts_remaining: 2 },
            })
          : jsonResponse(WITH_SUGGESTION)
      },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Analyze' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Your request is saved')
    expect(alert).toHaveTextContent('2 attempts remaining')
    expect(alert).not.toHaveTextContent('raw provider message')
    expect(alert).not.toHaveTextContent('ANALYSIS_FAILED')

    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('suggestion-reply')).toBeInTheDocument()
  })

  it.each([
    ['a 503 that cannot be retried', () =>
      errorResponse(503, 'ANALYSIS_FAILED', 'x', { extra: { retryable: false, attempts_remaining: 0 } })],
    ['the per-request limit', () => errorResponse(429, 'ANALYZE_LIMIT_REACHED', 'x')],
  ])('hands over to staff with no retry after %s', async (_name, respond) => {
    renderDetail(NEW_REQUEST, { 'POST /requests/r1/analyze': respond })
    await userEvent.click(await screen.findByRole('button', { name: 'Analyze' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Our support team will triage this manually.')
    expect(within(alert).queryByRole('button')).toBeNull()
  })

  it('tells the person how long to wait when rate limited', async () => {
    renderDetail(NEW_REQUEST, {
      'POST /requests/r1/analyze': () =>
        errorResponse(429, 'RATE_LIMITED', 'x', { headers: { 'Retry-After': '30' } }),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Analyze' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('wait 30 seconds')
  })

  it('says analysis is already running, and checks again on request', async () => {
    let reads = 0
    mockFetch({
      ...HEALTH,
      'GET /requests/r1': () => {
        reads += 1
        return jsonResponse(reads < 3 ? NEW_REQUEST : WITH_SUGGESTION)
      },
      'POST /requests/r1/analyze': () => errorResponse(409, 'ANALYSIS_IN_PROGRESS', 'x'),
    })
    renderSignedIn('/requests/r1')
    await userEvent.click(await screen.findByRole('button', { name: 'Analyze' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Analysis is already running')
    await waitFor(() => expect(reads).toBe(2))

    await userEvent.click(within(alert).getByRole('button', { name: 'Check again' }))
    expect(await screen.findByTestId('suggestion-reply')).toBeInTheDocument()
  })

  it('simply reloads when the request has already moved on', async () => {
    let reads = 0
    mockFetch({
      ...HEALTH,
      'GET /requests/r1': () => {
        reads += 1
        return jsonResponse(reads === 1 ? NEW_REQUEST : WITH_SUGGESTION)
      },
      'POST /requests/r1/analyze': () => errorResponse(409, 'INVALID_STATE', 'x'),
    })
    renderSignedIn('/requests/r1')
    await userEvent.click(await screen.findByRole('button', { name: 'Analyze' }))

    expect(await screen.findByTestId('suggestion-reply')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('lets a stuck analysis be restarted', async () => {
    const { fetchMock } = renderDetail(
      { ...BASE_REQUEST, status: 'ANALYZING' },
      { 'POST /requests/r1/analyze': () => jsonResponse(WITH_SUGGESTION) },
    )
    expect(await screen.findByText(/Analysis is running/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Restart analysis' }))
    expect(await screen.findByTestId('suggestion-reply')).toBeInTheDocument()
    expect(callsTo(fetchMock, 'POST', '/requests/r1/analyze')).toHaveLength(1)
  })
})

describe('reviewed replies', () => {
  const REVIEWED = {
    ...WITH_SUGGESTION,
    suggestion: { ...SUGGESTION, source: 'STAFF_REVIEWED', label: 'Reviewed by the support team' },
  }

  it('labels a staff-approved reply as reviewed, not as AI', async () => {
    renderDetail(REVIEWED)
    expect(await screen.findByText('Reviewed by the support team')).toBeInTheDocument()
    expect(screen.queryByText(/AI-generated suggestion/)).toBeNull()
  })

  it('keeps the AI label on an unreviewed suggestion', async () => {
    renderDetail({ ...WITH_SUGGESTION, suggestion: { ...SUGGESTION, source: 'AI' } })
    expect(await screen.findByText('AI-generated suggestion — verify before acting')).toBeInTheDocument()
    expect(screen.queryByText('Reviewed by the support team')).toBeNull()
  })
})

describe('failed analysis, after a reload', () => {
  it('shows the attempts remaining without another try', async () => {
    renderDetail({ ...NEW_REQUEST, attempts_remaining: 2, last_analysis_failed: true })
    expect(await screen.findByText('The last analysis did not finish. Your request is saved.')).toBeInTheDocument()
    expect(screen.getByText('2 attempts remaining.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Analyze' })).toBeNull()
  })

  it('uses the singular for one attempt', async () => {
    renderDetail({ ...NEW_REQUEST, attempts_remaining: 1, last_analysis_failed: true })
    expect(await screen.findByText('1 attempt remaining.')).toBeInTheDocument()
  })

  it('hands over to staff with no button when no attempts remain', async () => {
    renderDetail({ ...NEW_REQUEST, attempts_remaining: 0, last_analysis_failed: true })
    expect(await screen.findByText(/Our support team will triage this manually/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Analyze' })).toBeNull()
  })

  it('keeps the plain Analyze button when nothing has failed', async () => {
    renderDetail({ ...NEW_REQUEST, attempts_remaining: 3, last_analysis_failed: false })
    expect(await screen.findByRole('button', { name: 'Analyze' })).toBeInTheDocument()
  })
})

describe('live updates', () => {
  const AWAITING = {
    ...BASE_REQUEST,
    status: 'NEEDS_HUMAN_REVIEW',
    suggestion_state: 'AWAITING_STAFF_REVIEW',
  }
  const reads = (fetchMock) => callsTo(fetchMock, 'GET', '/requests/r1').length

  function setHidden(hidden) {
    Object.defineProperty(document, 'hidden', { configurable: true, value: hidden })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  afterEach(() => {
    vi.useRealTimers()
    delete document.hidden
  })

  it('polls every 5 seconds while awaiting review, then shows the approved reply and stops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let approved = false
    const fetchMock = mockFetch({
      ...HEALTH,
      'GET /requests/r1': () => jsonResponse(approved ? WITH_SUGGESTION : AWAITING),
    })
    renderSignedIn('/requests/r1')
    await screen.findByText('Awaiting staff review')
    const first = reads(fetchMock)

    await vi.advanceTimersByTimeAsync(5100)
    await waitFor(() => expect(reads(fetchMock)).toBe(first + 1))

    approved = true
    await vi.advanceTimersByTimeAsync(5100)
    expect(await screen.findByTestId('suggestion-reply')).toBeInTheDocument()
    const settled = reads(fetchMock)

    await vi.advanceTimersByTimeAsync(20000)
    expect(reads(fetchMock)).toBe(settled)
  })

  it('polls while analysis is running elsewhere', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { fetchMock } = renderDetail({ ...BASE_REQUEST, status: 'ANALYZING' })
    await screen.findByText(/Analysis is running/)
    const first = reads(fetchMock)
    await vi.advanceTimersByTimeAsync(5100)
    await waitFor(() => expect(reads(fetchMock)).toBe(first + 1))
  })

  it('does not poll a settled request', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { fetchMock } = renderDetail(WITH_SUGGESTION)
    await screen.findByTestId('suggestion-reply')
    const first = reads(fetchMock)
    await vi.advanceTimersByTimeAsync(30000)
    expect(reads(fetchMock)).toBe(first)
  })

  it('never stacks requests while one is in flight', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let hang = false
    const fetchMock = mockFetch({
      ...HEALTH,
      'GET /requests/r1': () => (hang ? new Promise(() => {}) : jsonResponse(AWAITING)),
    })
    renderSignedIn('/requests/r1')
    await screen.findByText('Awaiting staff review')
    const first = reads(fetchMock)
    hang = true
    await vi.advanceTimersByTimeAsync(5100)
    await waitFor(() => expect(reads(fetchMock)).toBe(first + 1))
    await vi.advanceTimersByTimeAsync(9000)
    expect(reads(fetchMock)).toBe(first + 1)
  })

  it('pauses while the tab is hidden, and checks at once on return', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { fetchMock } = renderDetail(AWAITING)
    await screen.findByText('Awaiting staff review')
    setHidden(true)
    const first = reads(fetchMock)
    await vi.advanceTimersByTimeAsync(30000)
    expect(reads(fetchMock)).toBe(first)

    setHidden(false)
    await waitFor(() => expect(reads(fetchMock)).toBe(first + 1))
  })

  it('stops after about 5 minutes, and offers a way to check again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { fetchMock } = renderDetail(AWAITING)
    await screen.findByText('Awaiting staff review')
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 5100)
    const button = await screen.findByRole('button', { name: 'Check for updates' })
    const stopped = reads(fetchMock)
    await vi.advanceTimersByTimeAsync(30000)
    expect(reads(fetchMock)).toBe(stopped)

    fireEvent.click(button)
    await waitFor(() => expect(reads(fetchMock)).toBe(stopped + 1))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Check for updates' })).toBeNull())
  })
})

describe('feedback', () => {
  const created = () => jsonResponse({ id: 'f1', helpful: true }, 201)

  it('sends the rating and optional comment, then disables the buttons and says thanks', async () => {
    const { fetchMock } = renderDetail(WITH_SUGGESTION, { 'POST /requests/r1/feedback': created })
    await userEvent.type(await screen.findByLabelText(/^Comment \(optional\)/), 'Worked for me')
    await userEvent.click(screen.getByRole('button', { name: 'Not helpful' }))

    expect(await screen.findByText('Thank you for your feedback.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Helpful' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Not helpful' })).toBeDisabled()
    expect(bodiesSentTo(fetchMock, 'POST', '/requests/r1/feedback')).toEqual([
      { helpful: false, comment: 'Worked for me' },
    ])
  })

  it('leaves the comment out when there is none', async () => {
    const { fetchMock } = renderDetail(WITH_SUGGESTION, { 'POST /requests/r1/feedback': created })
    await userEvent.click(await screen.findByRole('button', { name: 'Helpful' }))
    await screen.findByText('Thank you for your feedback.')
    expect(bodiesSentTo(fetchMock, 'POST', '/requests/r1/feedback')).toEqual([{ helpful: true }])
  })

  it('shows a friendly message for a duplicate rating', async () => {
    renderDetail(WITH_SUGGESTION, {
      'POST /requests/r1/feedback': () => errorResponse(409, 'FEEDBACK_EXISTS', 'raw'),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Helpful' }))

    expect(await screen.findByText('You have already rated this suggestion. Thank you!')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Helpful' })).toBeDisabled()
  })

  it('starts disabled when feedback was already given', async () => {
    renderDetail({ ...WITH_SUGGESTION, suggestion: { ...SUGGESTION, feedback_submitted: true } })
    expect(await screen.findByRole('button', { name: 'Helpful' })).toBeDisabled()
  })

  it('lets the person try again after a failure', async () => {
    renderDetail(WITH_SUGGESTION, {
      'POST /requests/r1/feedback': () => errorResponse(500, 'INTERNAL_ERROR', 'raw'),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Helpful' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side')
    expect(screen.getByRole('button', { name: 'Helpful' })).toBeEnabled()
  })
})

describe('comments and timeline', () => {
  const comment = {
    id: 'c1',
    author_name: 'Alex Chen',
    body: '<b>Please</b> try the guest network',
    created_at: '2026-11-02T10:00:00Z',
  }

  it('lists comments as plain text', async () => {
    const { container } = renderDetail({ ...BASE_REQUEST, comments: [comment] })
    expect(await screen.findByText(comment.body)).toBeInTheDocument()
    expect(screen.getByText('Alex Chen')).toBeInTheDocument()
    expect(container.querySelector('.comment b')).toBeNull()
  })

  it('validates, sends the comment, clears the form and reloads', async () => {
    let reads = 0
    const fetchMock = mockFetch({
      ...HEALTH,
      'GET /requests/r1': () => {
        reads += 1
        return jsonResponse({ ...BASE_REQUEST, comments: reads > 1 ? [comment] : [] })
      },
      'POST /requests/r1/comments': () => jsonResponse(comment, 201),
    })
    renderSignedIn('/requests/r1')

    await userEvent.click(await screen.findByRole('button', { name: 'Add comment' }))
    expect(screen.getByText('Write a comment first.')).toBeInTheDocument()
    expect(callsTo(fetchMock, 'POST', '/requests/r1/comments')).toHaveLength(0)

    const field = screen.getByLabelText(/^Add a comment/)
    await userEvent.type(field, 'Still broken')
    await userEvent.click(screen.getByRole('button', { name: 'Add comment' }))

    expect(await screen.findByText(comment.body)).toBeInTheDocument()
    expect(field).toHaveValue('')
    expect(bodiesSentTo(fetchMock, 'POST', '/requests/r1/comments')).toEqual([
      { body: 'Still broken', is_internal: false },
    ])
  })

  it('rejects an overlong comment on the client', async () => {
    const { fetchMock } = renderDetail(BASE_REQUEST)
    const field = await screen.findByLabelText(/^Add a comment/)
    await userEvent.click(field)
    await userEvent.paste('x'.repeat(2001))
    await userEvent.click(screen.getByRole('button', { name: 'Add comment' }))

    expect(screen.getByText(/2000 characters or fewer/)).toBeInTheDocument()
    expect(callsTo(fetchMock, 'POST', '/requests/r1/comments')).toHaveLength(0)
  })

  it('keeps typed text when sending fails', async () => {
    renderDetail(BASE_REQUEST, {
      'POST /requests/r1/comments': () => errorResponse(409, 'REQUEST_CLOSED', 'raw'),
    })
    const field = await screen.findByLabelText(/^Add a comment/)
    await userEvent.type(field, 'Still broken')
    await userEvent.click(screen.getByRole('button', { name: 'Add comment' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This request is closed')
    expect(field).toHaveValue('Still broken')
  })

  it('offers no internal option to requesters', async () => {
    renderDetail(BASE_REQUEST)
    await screen.findByLabelText(/^Add a comment/)
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('shows comments read-only on a closed request', async () => {
    renderDetail({ ...BASE_REQUEST, status: 'CLOSED', comments: [comment] })
    expect(await screen.findByText(/comments are read-only/)).toBeInTheDocument()
    expect(screen.getByText(comment.body)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Add a comment/)).toBeNull()
  })

  it('gives timeline events readable labels', async () => {
    renderDetail({
      ...BASE_REQUEST,
      events: [
        { event_type: 'REQUEST_CREATED', details: {}, created_at: '2026-11-01T10:00:00Z' },
        {
          event_type: 'STATUS_CHANGED',
          details: { from: 'NEW', to: 'NEEDS_HUMAN_REVIEW' },
          created_at: '2026-11-01T10:01:00Z',
        },
        {
          event_type: 'CATEGORY_CHANGED',
          details: { from: 'OTHER', to: 'ACCOUNT_ACCESS' },
          created_at: '2026-11-01T10:02:00Z',
        },
      ],
    })
    expect(await screen.findByText('Request submitted')).toBeInTheDocument()
    expect(screen.getByText('Status changed from New to Needs human review')).toBeInTheDocument()
    expect(screen.getByText('Category changed from Other to Account access')).toBeInTheDocument()
  })
})

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STAFF_TRANSITIONS } from '../requests/transitions'
import {
  bodiesSentTo,
  callsTo,
  countsResponse,
  errorResponse,
  HEALTH,
  jsonResponse,
  mockFetch,
  page,
} from './helpers'
import { ADMIN_USER, AGENT_USER, renderSignedIn } from './renderApp'

const QUEUE_ITEM = {
  id: 'r1',
  title: 'Printer keeps jamming',
  status: 'TRIAGED',
  category: 'HARDWARE',
  priority: 'HIGH',
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-01T10:00:00Z',
  requester_id: 'u1',
  assigned_agent_id: null,
  version: 4,
}

const PENDING = {
  id: 's1',
  ai_run_id: 'run1',
  summary: 'Possible account compromise',
  proposed_category: 'ACCOUNT_ACCESS',
  proposed_priority: 'HIGH',
  proposed_reply: 'Original AI draft text.',
  published_reply: null,
  confidence: 0.85,
  risk_flags: ['ACCOUNT_COMPROMISE'],
  rationale_short: 'Matched account keywords.',
  citations: [
    { id: 'a1', title: 'Compromised account guide', status: 'PUBLISHED' },
    { id: 'a2', title: 'Old draft guide', status: 'DRAFT' },
  ],
  review_state: 'PENDING_REVIEW',
  reviewed_by: null,
  reviewed_at: null,
  review_reason: null,
  feedback: [],
}

const DETAIL = {
  id: 'r1',
  title: 'Someone accessed my account',
  description: 'Original request description.',
  status: 'NEEDS_HUMAN_REVIEW',
  category: 'ACCOUNT_ACCESS',
  priority: 'HIGH',
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-01T10:00:00Z',
  resolved_at: null,
  version: 3,
  requester: { id: 'u1', email: 'riley@demo.test', display_name: 'Riley Morgan', role: 'USER' },
  assigned_agent: null,
  attempts_remaining: 2,
  comments: [],
  events: [],
  suggestion: PENDING,
  ai_runs: [
    {
      id: 'run1',
      mode: 'MOCK',
      model_id: null,
      status: 'SUCCEEDED',
      started_at: '2026-11-01T10:00:00Z',
      ended_at: '2026-11-01T10:00:01Z',
      duration_ms: 12,
      token_counts: null,
      error_code: null,
      prompt_version: 'triage-v1',
    },
    {
      id: 'run2',
      mode: 'GEMINI',
      model_id: 'test-model',
      status: 'FAILED',
      started_at: '2026-11-01T09:00:00Z',
      ended_at: '2026-11-01T09:00:45Z',
      duration_ms: 45000,
      token_counts: null,
      error_code: 'AI_TIMEOUT',
      prompt_version: 'triage-v1',
    },
  ],
}
const NO_SUGGESTION = { ...DETAIL, status: 'TRIAGED', suggestion: null, ai_runs: [] }

const QUEUE_ROUTES = {
  ...HEALTH,
  'GET /requests/counts': () => countsResponse({ NEEDS_HUMAN_REVIEW: 3, NEW: 1 }),
}

function renderDetail(detail = DETAIL, routes = {}, user = AGENT_USER) {
  const fetchMock = mockFetch({
    ...HEALTH,
    'GET /requests/r1': () => jsonResponse(detail),
    ...routes,
  })
  renderSignedIn('/support/r1', user)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('support queue', () => {
  it('lists requests with text labels, linking to the staff screen', async () => {
    mockFetch({ ...QUEUE_ROUTES, 'GET /requests': () => page([QUEUE_ITEM]) })
    renderSignedIn('/support', AGENT_USER)

    const link = await screen.findByRole('link', { name: QUEUE_ITEM.title })
    expect(link).toHaveAttribute('href', '/support/r1')
    const row = link.closest('tr')
    expect(within(row).getByText('Triaged')).toBeInTheDocument()
    expect(within(row).getByText('High')).toBeInTheDocument()
    expect(within(row).getByText('Hardware')).toBeInTheDocument()
    expect(within(row).getByText('Unassigned')).toBeInTheDocument()
  })

  it('does not limit the queue to the signed-in person\'s own requests', async () => {
    const fetchMock = mockFetch({ ...QUEUE_ROUTES, 'GET /requests': () => page([QUEUE_ITEM]) })
    renderSignedIn('/support', AGENT_USER)
    await screen.findByRole('link', { name: QUEUE_ITEM.title })
    expect(callsTo(fetchMock, 'GET', '/requests')[0][0]).not.toContain('mine=')
  })

  it('sends every filter and the sort to the API', async () => {
    const fetchMock = mockFetch({ ...QUEUE_ROUTES, 'GET /requests': () => page([QUEUE_ITEM]) })
    renderSignedIn('/support', AGENT_USER)
    await screen.findByRole('link', { name: QUEUE_ITEM.title })

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'TRIAGED')
    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'HIGH')
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'HARDWARE')
    await userEvent.selectOptions(screen.getByLabelText('Assigned'), 'unassigned')
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'priority:desc')

    await waitFor(() => {
      const last = callsTo(fetchMock, 'GET', '/requests').at(-1)[0]
      for (const part of [
        'status=TRIAGED',
        'priority=HIGH',
        'category=HARDWARE',
        'assigned_to=unassigned',
        'sort=priority',
        'direction=desc',
      ]) {
        expect(last).toContain(part)
      }
    })
  })

  it('has a Needs review quick filter that shows its count and toggles', async () => {
    const fetchMock = mockFetch({ ...QUEUE_ROUTES, 'GET /requests': () => page([QUEUE_ITEM]) })
    renderSignedIn('/support', AGENT_USER)

    const quick = await screen.findByRole('button', { name: 'Needs review (3)' })
    expect(quick).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(quick)
    expect(quick).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Status')).toHaveValue('NEEDS_HUMAN_REVIEW')
    await waitFor(() =>
      expect(callsTo(fetchMock, 'GET', '/requests').at(-1)[0]).toContain('status=NEEDS_HUMAN_REVIEW'),
    )

    await userEvent.click(quick)
    expect(quick).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('Status')).toHaveValue('')
  })

  it('shows counts per status', async () => {
    mockFetch({ ...QUEUE_ROUTES, 'GET /requests': () => page([]) })
    renderSignedIn('/support', AGENT_USER)
    const counts = await screen.findByRole('list', { name: 'Requests by status' })
    expect(within(counts).getByText('Needs human review').closest('li')).toHaveTextContent('3')
  })

  it('assigns to me using the row version, then reloads the list', async () => {
    let assigned = false
    const fetchMock = mockFetch({
      ...QUEUE_ROUTES,
      'GET /requests': () =>
        page([{ ...QUEUE_ITEM, assigned_agent_id: assigned ? AGENT_USER.id : null }]),
      'PATCH /requests/r1': () => {
        assigned = true
        return jsonResponse(DETAIL)
      },
    })
    renderSignedIn('/support', AGENT_USER)

    await userEvent.click(
      await screen.findByRole('button', { name: `Assign to me: ${QUEUE_ITEM.title}` }),
    )

    expect(await screen.findByText('You')).toBeInTheDocument()
    expect(bodiesSentTo(fetchMock, 'PATCH', '/requests/r1')).toEqual([
      { expected_version: 4, assigned_agent_id: AGENT_USER.id },
    ])
    expect(screen.queryByRole('button', { name: /Assign to me/ })).toBeNull()
  })

  it('explains a stale assignment and shows the latest list', async () => {
    mockFetch({
      ...QUEUE_ROUTES,
      'GET /requests': () => page([QUEUE_ITEM]),
      'PATCH /requests/r1': () => errorResponse(409, 'STALE_UPDATE', 'raw'),
    })
    renderSignedIn('/support', AGENT_USER)
    await userEvent.click(await screen.findByRole('button', { name: /Assign to me/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else changed this request')
    expect(screen.getByRole('link', { name: QUEUE_ITEM.title })).toBeInTheDocument()
  })

  it('offers no assignment on a closed request', async () => {
    mockFetch({
      ...QUEUE_ROUTES,
      'GET /requests': () => page([{ ...QUEUE_ITEM, status: 'CLOSED' }]),
    })
    renderSignedIn('/support', AGENT_USER)
    await screen.findByRole('link', { name: QUEUE_ITEM.title })
    expect(screen.queryByRole('button', { name: /Assign to me/ })).toBeNull()
  })

  it('has loading, empty and error states', async () => {
    let call = 0
    mockFetch({
      ...QUEUE_ROUTES,
      'GET /requests': () => {
        call += 1
        return call === 1 ? errorResponse(500, 'INTERNAL_ERROR', 'raw') : page([])
      },
    })
    renderSignedIn('/support', AGENT_USER)
    expect(screen.getByText('Loading the queue…')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side')

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('The queue is empty.')).toBeInTheDocument()
  })
})

describe('staff detail: AI analysis panel', () => {
  it('shows the request, requester and every analysis field in readable form', async () => {
    renderDetail()

    expect(await screen.findByRole('heading', { level: 1, name: DETAIL.title })).toBeInTheDocument()
    expect(screen.getByText('Original request description.')).toBeInTheDocument()
    expect(screen.getByText('Riley Morgan')).toBeInTheDocument()
    expect(screen.getByText('Possible account compromise', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('Matched account keywords.')).toBeInTheDocument()
    expect(screen.getByText('85%')).toBeInTheDocument()
    expect(screen.getByText('Possible account compromise', { selector: '.badge' })).toBeInTheDocument()
    expect(screen.queryByText('ACCOUNT_COMPROMISE')).toBeNull()
  })

  it('shows run history including the sanitized error code', async () => {
    renderDetail()
    const table = await screen.findByRole('table', { name: 'AI run history' })
    expect(within(table).getByText('MOCK')).toBeInTheDocument()
    expect(within(table).getAllByText('triage-v1')).toHaveLength(2)
    expect(within(table).getByText('12 ms')).toBeInTheDocument()
    expect(within(table).getByText('45.0 s')).toBeInTheDocument()
    expect(within(table).getByText('AI_TIMEOUT')).toBeInTheDocument()
    expect(within(table).getByText('test-model')).toBeInTheDocument()
  })

  it('links draft citations for an admin but not for an agent', async () => {
    renderDetail(DETAIL, {}, AGENT_USER)
    await screen.findByRole('link', { name: 'Compromised account guide' })
    expect(screen.queryByRole('link', { name: 'Old draft guide' })).toBeNull()
    expect(screen.getByText(/Old draft guide/)).toBeInTheDocument()
  })

  it('links draft citations for an admin', async () => {
    renderDetail(DETAIL, {}, ADMIN_USER)
    expect(await screen.findByRole('link', { name: 'Old draft guide' })).toHaveAttribute(
      'href',
      '/knowledge/a2',
    )
  })

  it('shows staff the specific failure, and offers a retry with the budget', async () => {
    renderDetail(
      { ...NO_SUGGESTION, status: 'NEW' },
      {
        'POST /requests/r1/analyze': () =>
          errorResponse(503, 'AI_TIMEOUT', 'raw', { extra: { retryable: true, attempts_remaining: 1 } }),
      },
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Analyze' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('took too long')
    expect(alert).toHaveTextContent('1 attempt remaining')
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('offers Analyze only while attempts remain', async () => {
    renderDetail({ ...NO_SUGGESTION, status: 'NEW', attempts_remaining: 0 })
    await screen.findByText('This request has no AI suggestion.')
    expect(screen.queryByRole('button', { name: 'Analyze' })).toBeNull()
  })
})

describe('staff detail: review', () => {
  async function fillReason(text = 'Safe escalation language') {
    await userEvent.type(await screen.findByLabelText(/^Review reason/), text)
  }

  it('shows the draft read-only and prefills the editable reply', async () => {
    renderDetail()
    expect(await screen.findByTestId('ai-draft')).toHaveTextContent('Original AI draft text.')
    expect(screen.getByTestId('ai-draft').tagName).toBe('DIV')
    expect(screen.getByLabelText(/^Reply to publish/)).toHaveValue('Original AI draft text.')
  })

  it('requires a reason before asking to confirm', async () => {
    const fetchMock = renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }))

    expect(screen.getByText(/Enter a reason of 3 to 300/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(callsTo(fetchMock, 'POST', '/requests/r1/review')).toHaveLength(0)
  })

  it('requires a reply to approve', async () => {
    renderDetail()
    await fillReason()
    await userEvent.clear(screen.getByLabelText(/^Reply to publish/))
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(screen.getByText('Enter the reply to publish.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('approves the edited reply after confirming, with the expected suggestion ID', async () => {
    const approved = {
      ...DETAIL,
      status: 'IN_PROGRESS',
      version: 4,
      suggestion: {
        ...PENDING,
        review_state: 'APPROVED',
        published_reply: 'Edited safe reply.',
        review_reason: 'Safe escalation language',
      },
    }
    const fetchMock = renderDetail(DETAIL, { 'POST /requests/r1/review': () => jsonResponse(approved) })
    await fillReason()
    const reply = screen.getByLabelText(/^Reply to publish/)
    await userEvent.clear(reply)
    await userEvent.type(reply, 'Edited safe reply.')
    await userEvent.selectOptions(screen.getByLabelText('Next status'), 'IN_PROGRESS')

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    const dialog = screen.getByRole('dialog', { name: 'Approve and publish this reply?' })
    expect(dialog).toHaveTextContent('Edited safe reply.')
    expect(callsTo(fetchMock, 'POST', '/requests/r1/review')).toHaveLength(0)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve and publish' }))

    expect(await screen.findByTestId('published-reply')).toHaveTextContent('Edited safe reply.')
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(bodiesSentTo(fetchMock, 'POST', '/requests/r1/review')).toEqual([
      {
        decision: 'APPROVED',
        published_reply: 'Edited safe reply.',
        review_reason: 'Safe escalation language',
        expected_suggestion_id: 's1',
        next_status: 'IN_PROGRESS',
      },
    ])
  })

  it('rejects without sending a reply', async () => {
    const rejected = {
      ...DETAIL,
      status: 'TRIAGED',
      suggestion: { ...PENDING, review_state: 'REJECTED', review_reason: 'Not useful' },
    }
    const fetchMock = renderDetail(DETAIL, { 'POST /requests/r1/review': () => jsonResponse(rejected) })
    await fillReason('Not useful')

    await userEvent.click(screen.getByRole('button', { name: 'Reject' }))
    const dialog = screen.getByRole('dialog', { name: 'Reject this suggestion?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject suggestion' }))

    expect(await screen.findByText('Rejected')).toBeInTheDocument()
    const [body] = bodiesSentTo(fetchMock, 'POST', '/requests/r1/review')
    expect(body.decision).toBe('REJECTED')
    expect(body).not.toHaveProperty('published_reply')
  })

  it('cancelling the dialog sends nothing', async () => {
    const fetchMock = renderDetail()
    await fillReason()
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(callsTo(fetchMock, 'POST', '/requests/r1/review')).toHaveLength(0)
  })

  it('shows UNSAFE_REPLY on the reply field and keeps the text', async () => {
    renderDetail(DETAIL, {
      'POST /requests/r1/review': () => errorResponse(422, 'UNSAFE_REPLY', 'raw'),
    })
    await fillReason()
    const reply = screen.getByLabelText(/^Reply to publish/)
    await userEvent.clear(reply)
    await userEvent.type(reply, 'Please send us your password.')
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve and publish' }))

    const message = await screen.findByText(/appears to ask for a password, code or token/)
    expect(reply.getAttribute('aria-describedby')).toContain(message.id)
    expect(reply).toHaveAttribute('aria-invalid', 'true')
    expect(reply).toHaveValue('Please send us your password.')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it.each(['STALE_REVIEW', 'ALREADY_REVIEWED', 'INVALID_STATE', 'NO_PENDING_SUGGESTION'])(
    'prompts a reload on 409 %s',
    async (code) => {
      renderDetail(DETAIL, { 'POST /requests/r1/review': () => errorResponse(409, code, 'raw') })
      await fillReason()
      await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
      await userEvent.click(screen.getByRole('button', { name: 'Approve and publish' }))

      const alert = await screen.findByRole('alert')
      expect(within(alert).getByRole('button', { name: 'Reload' })).toBeInTheDocument()
      expect(alert).not.toHaveTextContent('raw')
    },
  )

  it('warns when the draft itself was flagged', async () => {
    renderDetail({
      ...DETAIL,
      suggestion: { ...PENDING, risk_flags: ['OUTPUT_ASKS_CREDENTIALS'] },
    })
    expect(await screen.findByText('Check this draft carefully before publishing')).toBeInTheDocument()
    expect(screen.getByText(/Flagged: AI draft asks for credentials/)).toBeInTheDocument()
  })

  it('hides the review form on a self-submitted request, with an explanation', async () => {
    renderDetail({
      ...DETAIL,
      requester: { id: AGENT_USER.id, email: 'a@test', display_name: 'Alex Chen', role: 'AGENT' },
    })
    expect(await screen.findByText(/you cannot review its AI suggestion/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByLabelText(/^Reply to publish/)).toBeNull()
  })

  it('shows no review form when nothing is pending', async () => {
    renderDetail(NO_SUGGESTION)
    await screen.findByText('This request has no AI suggestion.')
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })
})

describe('staff detail: status controls', () => {
  const LABELS = {
    TRIAGED: 'Move to Triaged',
    IN_PROGRESS: 'Move to In progress',
    RESOLVED: 'Move to Resolved',
    CLOSED: 'Move to Closed',
    NEEDS_HUMAN_REVIEW: 'Escalate to review',
  }
  const statusButtons = () => {
    const card = screen.getByRole('heading', { name: 'Status' }).closest('section')
    return within(card)
      .queryAllByRole('button')
      .map((button) => button.textContent)
      .sort()
  }

  it.each(Object.entries(STAFF_TRANSITIONS))(
    'offers exactly the allowed moves from %s',
    async (status, targets) => {
      renderDetail({ ...NO_SUGGESTION, status })
      await screen.findByRole('heading', { level: 1, name: DETAIL.title })
      expect(statusButtons()).toEqual(targets.map((target) => LABELS[target]).sort())
    },
  )

  it('matches the backend state machine', () => {
    expect(STAFF_TRANSITIONS).toEqual({
      NEW: ['TRIAGED', 'NEEDS_HUMAN_REVIEW'],
      ANALYZING: [],
      TRIAGED: ['IN_PROGRESS', 'NEEDS_HUMAN_REVIEW'],
      NEEDS_HUMAN_REVIEW: ['TRIAGED', 'IN_PROGRESS'],
      IN_PROGRESS: ['RESOLVED', 'NEEDS_HUMAN_REVIEW'],
      RESOLVED: ['CLOSED', 'NEEDS_HUMAN_REVIEW'],
      CLOSED: [],
    })
  })

  it('offers no status move while a draft is waiting for review', async () => {
    renderDetail()
    await screen.findByText('Approve or reject the AI draft to move this request on.')
    expect(statusButtons()).toEqual([])
  })

  it('sends a status change with the expected version', async () => {
    const fetchMock = renderDetail(NO_SUGGESTION, {
      'PATCH /requests/r1': () => jsonResponse({ ...NO_SUGGESTION, status: 'IN_PROGRESS', version: 4 }),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Move to In progress' }))

    await screen.findByRole('button', { name: 'Move to Resolved' })
    expect(bodiesSentTo(fetchMock, 'PATCH', '/requests/r1')).toEqual([
      { expected_version: 3, status: 'IN_PROGRESS' },
    ])
  })

  it('confirms before escalating, then sends the update', async () => {
    const fetchMock = renderDetail(NO_SUGGESTION, {
      'PATCH /requests/r1': () =>
        jsonResponse({ ...NO_SUGGESTION, status: 'NEEDS_HUMAN_REVIEW', version: 4 }),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Escalate to review' }))
    const dialog = screen.getByRole('dialog', { name: 'Escalate to review?' })
    expect(callsTo(fetchMock, 'PATCH', '/requests/r1')).toHaveLength(0)

    await userEvent.click(within(dialog).getByRole('button', { name: 'Escalate' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(bodiesSentTo(fetchMock, 'PATCH', '/requests/r1')).toEqual([
      { expected_version: 3, status: 'NEEDS_HUMAN_REVIEW' },
    ])
  })

  it('assigns and unassigns', async () => {
    const assigned = {
      ...NO_SUGGESTION,
      version: 4,
      assigned_agent: { id: AGENT_USER.id, email: AGENT_USER.email, display_name: 'Alex Chen', role: 'AGENT' },
    }
    const fetchMock = renderDetail(NO_SUGGESTION, {
      'PATCH /requests/r1': ({ body }) =>
        jsonResponse(body.assigned_agent_id ? assigned : { ...NO_SUGGESTION, version: 5 }),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Assign to me' }))
    expect(await screen.findByText('Assigned to you.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Unassign' }))
    expect(await screen.findByText('Nobody is assigned.')).toBeInTheDocument()
    expect(bodiesSentTo(fetchMock, 'PATCH', '/requests/r1')).toEqual([
      { expected_version: 3, assigned_agent_id: AGENT_USER.id },
      { expected_version: 4, assigned_agent_id: null },
    ])
  })

  it('hides the update controls on a closed request', async () => {
    renderDetail({ ...NO_SUGGESTION, status: 'CLOSED' })
    await screen.findByText('This request is closed. Closed is final.')
    expect(screen.queryByRole('button', { name: 'Assign to me' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })
})

describe('staff detail: priority and category', () => {
  it('requires a reason, and sends only what changed', async () => {
    const fetchMock = renderDetail(NO_SUGGESTION, {
      'PATCH /requests/r1': () => jsonResponse({ ...NO_SUGGESTION, priority: 'URGENT', version: 4 }),
    })
    await userEvent.selectOptions(await screen.findByLabelText('Priority'), 'URGENT')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(screen.getByText(/Enter a reason of 3 to 300/)).toBeInTheDocument()
    expect(callsTo(fetchMock, 'PATCH', '/requests/r1')).toHaveLength(0)

    const reason = screen.getByLabelText(/^Reason for the change/)
    await userEvent.type(reason, 'Whole floor affected')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(reason).toHaveValue(''))
    expect(bodiesSentTo(fetchMock, 'PATCH', '/requests/r1')).toEqual([
      { expected_version: 3, priority: 'URGENT', reason: 'Whole floor affected' },
    ])
  })

  it('says when nothing has changed', async () => {
    const fetchMock = renderDetail(NO_SUGGESTION)
    await userEvent.click(await screen.findByRole('button', { name: 'Save changes' }))
    expect(screen.getByText('Change the priority or category first.')).toBeInTheDocument()
    expect(callsTo(fetchMock, 'PATCH', '/requests/r1')).toHaveLength(0)
  })

  it('handles a stale update: explains, keeps typed text, and saves after a reload', async () => {
    let reads = 0
    let patches = 0
    const fetchMock = mockFetch({
      ...HEALTH,
      'GET /requests/r1': () => {
        reads += 1
        return jsonResponse(
          reads === 1 ? NO_SUGGESTION : { ...NO_SUGGESTION, category: 'NETWORK', version: 9 },
        )
      },
      'PATCH /requests/r1': () => {
        patches += 1
        return patches === 1
          ? errorResponse(409, 'STALE_UPDATE', 'raw')
          : jsonResponse({ ...NO_SUGGESTION, category: 'NETWORK', priority: 'URGENT', version: 10 })
      },
    })
    renderSignedIn('/support/r1', AGENT_USER)

    await userEvent.selectOptions(await screen.findByLabelText('Priority'), 'URGENT')
    const reason = screen.getByLabelText(/^Reason for the change/)
    await userEvent.type(reason, 'Whole floor affected')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'Someone else changed this request. Reload to see the latest version.',
    )
    expect(reason).toHaveValue('Whole floor affected')

    await userEvent.click(within(alert).getByRole('button', { name: 'Reload' }))

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    await waitFor(() => expect(screen.getByLabelText('Category')).toHaveValue('NETWORK'))
    expect(reason).toHaveValue('Whole floor affected')
    expect(screen.getByLabelText('Priority')).toHaveValue('URGENT')

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(reason).toHaveValue(''))
    // The retry uses the fresh version, and does not revert the other person's category change.
    expect(bodiesSentTo(fetchMock, 'PATCH', '/requests/r1')[1]).toEqual({
      expected_version: 9,
      priority: 'URGENT',
      reason: 'Whole floor affected',
    })
  })

  it('keeps the review text through a reload after a conflict', async () => {
    renderDetail(DETAIL, {
      'POST /requests/r1/review': () => errorResponse(409, 'STALE_REVIEW', 'raw'),
    })
    const reply = await screen.findByLabelText(/^Reply to publish/)
    await userEvent.clear(reply)
    await userEvent.type(reply, 'My careful edit')
    const reason = screen.getByLabelText(/^Review reason/)
    await userEvent.type(reason, 'My reason')
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await userEvent.click(screen.getByRole('button', { name: 'Approve and publish' }))

    const alert = await screen.findByRole('alert')
    await userEvent.click(within(alert).getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())

    expect(screen.getByLabelText(/^Reply to publish/)).toHaveValue('My careful edit')
    expect(screen.getByLabelText(/^Review reason/)).toHaveValue('My reason')
  })
})

describe('staff detail: comments', () => {
  const internal = {
    id: 'c1',
    author_id: 'u3',
    author_name: 'Alex Chen',
    body: 'Staff-only note',
    is_internal: true,
    created_at: '2026-11-01T10:00:00Z',
  }
  const external = { ...internal, id: 'c2', body: 'Public reply', is_internal: false }

  it('clearly marks internal comments, and only those', async () => {
    renderDetail({ ...NO_SUGGESTION, comments: [internal, external] })

    const note = (await screen.findByText('Staff-only note')).closest('li')
    expect(within(note).getByText('Internal — not visible to requester')).toBeInTheDocument()
    const reply = screen.getByText('Public reply').closest('li')
    expect(within(reply).queryByText(/Internal/)).toBeNull()
  })

  it('sends an internal comment when the box is ticked', async () => {
    const fetchMock = renderDetail(NO_SUGGESTION, {
      'POST /requests/r1/comments': () => jsonResponse(internal, 201),
    })
    await userEvent.type(await screen.findByLabelText(/^Add a comment/), 'Staff-only note')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Internal — not visible to requester' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add internal comment' }))

    await waitFor(() =>
      expect(bodiesSentTo(fetchMock, 'POST', '/requests/r1/comments')).toEqual([
        { body: 'Staff-only note', is_internal: true },
      ]),
    )
  })

  it('defaults to a public comment', async () => {
    renderDetail(NO_SUGGESTION)
    expect(await screen.findByRole('checkbox', { name: /Internal/ })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Add comment' })).toBeInTheDocument()
  })

  it('shows staff reasons in the timeline, with readable labels', async () => {
    renderDetail({
      ...NO_SUGGESTION,
      events: [
        {
          id: 'e1',
          actor_id: 'u3',
          event_type: 'PRIORITY_CHANGED',
          details: { from: 'LOW', to: 'HIGH', reason: 'Whole floor affected' },
          created_at: '2026-11-01T10:00:00Z',
        },
        {
          id: 'e2',
          actor_id: null,
          event_type: 'SOME_FUTURE_EVENT',
          details: {},
          created_at: '2026-11-01T10:01:00Z',
        },
      ],
    })
    expect(await screen.findByText('Priority changed from Low to High')).toBeInTheDocument()
    expect(screen.getByText('Reason: Whole floor affected')).toBeInTheDocument()
    expect(screen.getByText('SOME_FUTURE_EVENT')).toBeInTheDocument()
  })
})

describe('staff detail: not found', () => {
  it('shows the not-found page', async () => {
    mockFetch({
      ...HEALTH,
      'GET /requests/r1': () => errorResponse(404, 'NOT_FOUND', 'raw'),
    })
    renderSignedIn('/support/r1', AGENT_USER)
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})

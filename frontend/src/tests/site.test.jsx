import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import snapshot from '../../public/data/landing-snapshot.json'
import Site from '../site/Site'
import { jsonResponse } from './helpers'

let fetchMock

beforeEach(() => {
  // The website may read its own static data file, and nothing else.
  fetchMock = vi.fn(async (url) => {
    if (url === '/data/landing-snapshot.json') return jsonResponse(snapshot)
    throw new Error(`Unexpected fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the public website', () => {
  it('shows the pitch at /, reads only its static data, and calls no API', async () => {
    render(<Site path="/" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('people stay in charge')
    expect(screen.getAllByRole('link', { name: 'Try the live demo' })[0]).toHaveAttribute('href', '/app/login')
    expect(screen.getAllByRole('link', { name: 'View on GitHub' })[0]).toHaveAttribute(
      'href',
      'https://github.com/ved-cmpt/iknowserviceai',
    )
    await screen.findByRole('tablist', { name: 'Demos' })
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/data/landing-snapshot.json'])
  })

  it('shows its own not-found page for any other address', () => {
    render(<Site path="/no-such-page" />)
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the website' })).toHaveAttribute('href', '/')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('has a skip link, a main landmark and section links', () => {
    render(<Site path="/" />)
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
    const nav = screen.getByRole('navigation', { name: 'Website' })
    for (const name of ['How it works', 'Demo', 'Security', 'Evaluation', 'Docs', 'GitHub']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument()
    }
  })
})

describe('the hero replay', () => {
  it('replays the recorded runs and can be paused', async () => {
    render(<Site path="/" />)
    const replay = await screen.findByRole('figure', { name: /A replay of two recorded runs/ })
    expect(within(replay).getByText(snapshot.scenarios.ordinary.input.title)).toBeInTheDocument()
    const pause = within(replay).getByRole('button', { name: 'Pause the replay' })
    await userEvent.click(pause)
    expect(within(replay).getByRole('button', { name: 'Play the replay' })).toBeInTheDocument()
  })

  it('shows the sensitive run held by code', async () => {
    render(<Site path="/" />)
    const replay = await screen.findByRole('figure', { name: /A replay of two recorded runs/ })
    await userEvent.click(within(replay).getByRole('button', { name: 'Pause the replay' }))
    await userEvent.click(within(replay).getByRole('button', { name: 'Sensitive request' }))
    expect(within(replay).getByText(/Held for staff review/)).toBeInTheDocument()
    expect(within(replay).getByText('Model asks for review: no')).toBeInTheDocument()
  })
})

describe('the demo tabs', () => {
  it('moves between tabs with the arrow keys', async () => {
    render(<Site path="/" />)
    const first = await screen.findByRole('tab', { name: 'Ordinary request' })
    expect(first).toHaveAttribute('aria-selected', 'true')
    first.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Sensitive request' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Sensitive request' })).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Staff review' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Ordinary request' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows the requester the cited suggestion for an ordinary request', async () => {
    render(<Site path="/" />)
    const panel = await screen.findByRole('tabpanel')
    expect(within(panel).getByText('AI-generated suggestion — verify before acting')).toBeInTheDocument()
    const sources = within(panel).getByRole('list', { name: 'Sources' })
    expect(within(sources).getByText('VPN connectivity troubleshooting')).toBeInTheDocument()
  })

  it('puts the requester’s view beside the staff view for a sensitive request', async () => {
    render(<Site path="/" />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Sensitive request' }))
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByText('Awaiting staff review')).toBeInTheDocument()
    expect(within(panel).getByText('Possible account compromise')).toBeInTheDocument()
    expect(within(panel).queryByText('AI-generated suggestion — verify before acting')).toBeNull()
  })

  it('replays the refused and the accepted staff reply', async () => {
    render(<Site path="/" />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Staff review' }))
    const panel = screen.getByRole('tabpanel')
    await userEvent.click(within(panel).getByRole('button', { name: /Try an unsafe reply/ }))
    expect(within(panel).getByText(/Refused · HTTP 422 UNSAFE_REPLY/)).toBeInTheDocument()
    await userEvent.click(within(panel).getByRole('button', { name: /Publish a safe reply/ }))
    expect(within(panel).getByText('Reviewed by the support team')).toBeInTheDocument()
  })

  it('links each tab into the app as the matching demo person', async () => {
    render(<Site path="/" />)
    const link = await screen.findByRole('link', { name: 'See it in the app' })
    expect(link).toHaveAttribute('href', '/app/login?as=riley&next=%2Frequests%2Fnew')
    await userEvent.click(screen.getByRole('tab', { name: 'Prompt injection' }))
    expect(screen.getByRole('link', { name: 'See it in the app' })).toHaveAttribute(
      'href',
      '/app/login?as=alex&next=%2Fsupport%3Fstatus%3DNEEDS_HUMAN_REVIEW',
    )
  })
})

describe('the evaluation numbers', () => {
  it('name the file each number comes from', async () => {
    render(<Site path="/" />)
    const section = (await screen.findByRole('heading', { name: 'Real numbers, with their caveats' })).closest(
      'section',
    )
    await within(section).findByText('100%')
    const sources = within(section).getAllByRole('link', { name: /backend\/eval\/results\// })
    expect(sources).toHaveLength(4)
    expect(within(section).getByText(/The first run held 19 of 22 \(86\.4%\)/)).toBeInTheDocument()
  })
})

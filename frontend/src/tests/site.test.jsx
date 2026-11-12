import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Site from '../site/Site'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the public website', () => {
  it('shows the pitch at /, and makes no API call', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<Site path="/" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('people stay in charge')
    expect(screen.getAllByRole('link', { name: 'Try the live demo' })[0]).toHaveAttribute('href', '/app/login')
    expect(screen.getByRole('link', { name: 'View on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/ved-cmpt/iknowserviceai',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows its own not-found page for any other address', () => {
    render(<Site path="/no-such-page" />)
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the website' })).toHaveAttribute('href', '/')
  })

  it('has a skip link to the main content', () => {
    render(<Site path="/" />)
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
  })
})

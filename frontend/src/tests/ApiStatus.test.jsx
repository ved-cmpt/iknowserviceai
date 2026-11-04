import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ApiStatus from '../components/ApiStatus'
import { jsonResponse } from './helpers'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ApiStatus', () => {
  it('shows connected when the health check succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ status: 'ok' })),
    )
    render(<ApiStatus />)
    expect(await screen.findByText('API connected')).toBeInTheDocument()
  })

  it('shows unreachable when the network fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    render(<ApiStatus />)
    expect(await screen.findByText('API unreachable')).toBeInTheDocument()
  })

  it('shows unreachable when the server returns an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bad gateway', { status: 502 })),
    )
    render(<ApiStatus />)
    expect(await screen.findByText('API unreachable')).toBeInTheDocument()
  })
})

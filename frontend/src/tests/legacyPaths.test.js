import { describe, expect, it } from 'vitest'
import { safeNext } from '../auth/deepLink'
import { appHref, legacyRedirect } from '../lib/legacyPaths'

describe('old app paths', () => {
  it.each([
    ['/login', '/app/login'],
    ['/dashboard', '/app/dashboard'],
    ['/requests/new', '/app/requests/new'],
    ['/requests/7f3c', '/app/requests/7f3c'],
    ['/knowledge', '/app/knowledge'],
    ['/knowledge/42', '/app/knowledge/42'],
    ['/support', '/app/support'],
    ['/support/7f3c', '/app/support/7f3c'],
    ['/admin/knowledge', '/app/admin/knowledge'],
    ['/admin/knowledge/new', '/app/admin/knowledge/new'],
    ['/admin/knowledge/9/edit', '/app/admin/knowledge/9/edit'],
    ['/admin/audit', '/app/admin/audit'],
  ])('moves %s to %s', (pathname, expected) => {
    expect(legacyRedirect({ pathname })).toBe(expected)
  })

  it('keeps the query string and the fragment', () => {
    expect(legacyRedirect({ pathname: '/support', search: '?status=NEEDS_HUMAN_REVIEW', hash: '#top' })).toBe(
      '/app/support?status=NEEDS_HUMAN_REVIEW#top',
    )
  })

  it.each(['/', '/app', '/app/login', '/app/requests/1', '/no-such-page', '/loginx', '/applications'])(
    'leaves %s alone',
    (pathname) => {
      expect(legacyRedirect({ pathname })).toBeNull()
    },
  )

  it('builds plain links into the app', () => {
    expect(appHref()).toBe('/app/')
    expect(appHref('/login')).toBe('/app/login')
  })
})

describe('deep links from the website', () => {
  it.each([
    ['/requests/new', '/requests/new'],
    ['/support?status=NEEDS_HUMAN_REVIEW', '/support?status=NEEDS_HUMAN_REVIEW'],
    ['/app/support', '/support'],
    ['/app', '/'],
  ])('accepts the app path %s', (value, expected) => {
    expect(safeNext(value)).toBe(expected)
  })

  it.each([null, '', 'requests', '//evil.example', 'https://evil.example', '/\\evil.example', '/ x', '/login'])(
    'refuses %s',
    (value) => {
      expect(safeNext(value)).toBeNull()
    },
  )
})

// Checks that only make sense against the production image. Other runs skip this file.
import { expect, request as playwrightRequest, test } from '@playwright/test'
import { expectAccessible, signInAt } from './helpers'

test.skip(!process.env.PRODUCTION, 'Runs against the production image only.')

const BASE = process.env.API_URL.replace(/\/api\/v1$/, '')

test.describe('Production image @mobile', () => {
  test('sends the security headers, and hides the API docs', async () => {
    const api = await playwrightRequest.newContext()
    const page = await api.get(`${BASE}/`)
    expect(page.ok()).toBeTruthy()
    const headers = page.headers()
    expect(headers['content-security-policy']).toContain("default-src 'self'")
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['permissions-policy']).toContain('camera=()')
    expect(headers['cache-control']).toBe('no-cache')

    expect((await api.get(`${BASE}/api/v1/healthz`)).headers()['x-content-type-options']).toBe('nosniff')
    expect((await api.get(`${BASE}/openapi.json`)).status()).toBe(404)
    expect(await (await api.get(`${BASE}/docs`)).text()).not.toContain('swagger')
    expect((await api.get(`${BASE}/api/v1/no-such-endpoint`)).status()).toBe(404)
    await api.dispose()
  })

  test('hashed assets are cached for a long time', async ({ page }) => {
    const assets = []
    page.on('response', (response) => {
      if (response.url().includes('/assets/')) assets.push(response.headers()['cache-control'])
    })
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Sign in to IknowServiceAI' })).toBeVisible()
    expect(assets.length).toBeGreaterThan(0)
    for (const value of assets) expect(value).toContain('immutable')
  })

  test('client routes load directly, with no content security violations', async ({ page }) => {
    const problems = []
    page.on('console', (message) => {
      if (/Content Security Policy|Refused to/i.test(message.text())) problems.push(message.text())
    })
    page.on('pageerror', (error) => problems.push(error.message))

    await signInAt(page, 'jordan', '/admin/knowledge')
    await expect(page.getByRole('heading', { name: 'Knowledge admin' })).toBeVisible()
    await page.goto('/knowledge')
    await expect(page.getByRole('heading', { name: 'Knowledge base' })).toBeVisible()
    await expectAccessible(page, 'production: knowledge list')
    await page.goto('/support')
    await expect(page.getByRole('heading', { name: 'Support queue' })).toBeVisible()
    await expectAccessible(page, 'production: support queue')
    await page.goto('/admin/audit')
    await expect(page.getByRole('table')).toBeVisible()
    await expectAccessible(page, 'production: audit log')
    expect(problems).toEqual([])
  })

  test('the session cookie is HttpOnly, Secure and SameSite=Strict, on the auth path only', async ({ page, context }) => {
    await signInAt(page, 'riley')
    const cookie = (await context.cookies('http://localhost:8080/api/v1/auth/refresh')).find(
      (item) => item.name === 'iks_refresh',
    )
    expect(cookie).toBeTruthy()
    expect(cookie.httpOnly).toBe(true)
    expect(cookie.secure).toBe(true)
    expect(cookie.sameSite).toBe('Strict')
    expect(cookie.path).toBe('/api/v1/auth')
    expect(await page.evaluate(() => document.cookie)).toBe('')
  })
})

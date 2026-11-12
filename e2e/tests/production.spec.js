// Checks that only make sense against the production image. Other runs skip this file.
import { request as playwrightRequest } from '@playwright/test'
import { expect, test } from './fixtures'
import { expectAccessible, fillSignIn, signInAt } from './helpers'

test.skip(!process.env.PRODUCTION, 'Runs against the production image only.')

const BASE = process.env.API_URL.replace(/\/api\/v1$/, '')

test.describe('Production image @mobile', () => {
  test('sends the security headers, and hides the API docs @smoke', async () => {
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

  test('the public demo banner is on the sign-in page and in the app shell', async ({ page }) => {
    await page.goto('/app/login')
    const banner = page.getByTestId('demo-banner')
    await expect(banner).toContainText('Public demo — shared synthetic data, resets daily.')
    await expect(banner).toContainText('simulated by the built-in mock agent')
    await fillSignIn(page, 'riley')
    await expect(page.getByTestId('demo-banner')).toContainText('resets daily')
    await expectAccessible(page, 'production: shell with demo banner')
  })

  test('dark is the default even on a light system, and a choice survives a reload, with no violations', async ({ browser }) => {
    const { baseURL, viewport, isMobile, hasTouch } = test.info().project.use
    const context = await browser.newContext({ baseURL, viewport, isMobile, hasTouch, colorScheme: 'light' })
    const page = await context.newPage()
    const problems = []
    page.on('console', (message) => {
      if (/Content Security Policy|Refused to/i.test(message.text())) problems.push(message.text())
    })
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)

    await page.goto('/app/login')
    await expect(page.getByRole('heading', { name: 'Sign in to IknowServiceAI' })).toBeVisible()
    expect(await background()).toBe('rgb(10, 10, 12)')

    await page.getByRole('button', { name: 'Switch to light theme' }).click()
    expect(await background()).toBe('rgb(250, 250, 251)')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Sign in to IknowServiceAI' })).toBeVisible()
    expect(await background()).toBe('rgb(250, 250, 251)')
    await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible()

    // Self-hosted fonts load under the policy, with no external request.
    expect(await page.evaluate(() => document.fonts.check('16px "Inter Variable"'))).toBe(true)
    expect(problems).toEqual([])
    await context.close()
  })

  test('hashed assets are cached for a long time', async ({ page }) => {
    const assets = []
    page.on('response', (response) => {
      if (response.url().includes('/assets/')) assets.push(response.headers()['cache-control'])
    })
    await page.goto('/app/login')
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

    await signInAt(page, 'jordan', '/app/admin/knowledge')
    await expect(page.getByRole('heading', { name: 'Knowledge admin' })).toBeVisible()
    await page.goto('/app/knowledge')
    await expect(page.getByRole('heading', { name: 'Knowledge base' })).toBeVisible()
    await expectAccessible(page, 'production: knowledge list')
    await page.goto('/app/support')
    await expect(page.getByRole('heading', { name: 'Support queue' })).toBeVisible()
    await expectAccessible(page, 'production: support queue')
    await page.goto('/app/admin/audit')
    await expect(page.getByRole('table')).toBeVisible()
    await expectAccessible(page, 'production: audit log')
    expect(problems).toEqual([])
  })

  test('the website runs under the policy, compressed, with search and sharing metadata @smoke', async ({ page }) => {
    const problems = []
    page.on('console', (message) => {
      if (/Content Security Policy|Refused to/i.test(message.text())) problems.push(message.text())
    })
    page.on('pageerror', (error) => problems.push(error.message))
    const response = await page.goto('/')
    expect(response.headers()['content-security-policy']).toContain("script-src 'self'")
    await expect(page.getByRole('tablist', { name: 'Demos' })).toBeVisible()
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://iknowserviceai.onrender.com/')
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /og-image\.png$/)
    await expect(page.locator('link[rel="preload"][as="font"]')).toHaveCount(1)
    expect(await page.evaluate(() => document.fonts.check('16px "Inter Variable"'))).toBe(true)
    expect(problems).toEqual([])

    const api = await playwrightRequest.newContext()
    const html = await api.get(`${BASE}/`, { headers: { 'Accept-Encoding': 'gzip' } })
    expect(html.headers()['content-encoding']).toBe('gzip')
    const robots = await (await api.get(`${BASE}/robots.txt`)).text()
    expect(robots).toContain('Disallow: /app/')
    expect(await (await api.get(`${BASE}/sitemap.xml`)).text()).toContain('<loc>https://iknowserviceai.onrender.com/</loc>')
    expect((await api.get(`${BASE}/og-image.png`)).headers()['content-type']).toBe('image/png')
    expect((await api.get(`${BASE}/data/landing-snapshot.json`)).ok()).toBeTruthy()
    const app = await api.get(`${BASE}/app/dashboard`)
    expect(await app.text()).toContain('noindex')
    await api.dispose()
  })

  test('the session cookie is HttpOnly, Secure and SameSite=Strict, on the auth path only @smoke', async ({ page, context, baseURL }) => {
    await signInAt(page, 'riley')
    const cookie = (await context.cookies(`${baseURL}/api/v1/auth/refresh`)).find(
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

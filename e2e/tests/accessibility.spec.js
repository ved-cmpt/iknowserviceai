import { expect, test } from '@playwright/test'
import {
  AI_LABEL,
  AWAITING_TEXT,
  expectAccessible,
  openNav,
  seedRequest,
  SENSITIVE_TEXT,
  signInAt,
  uniqueTag,
  WIFI_BODY,
  WIFI_TITLE,
} from './helpers'

test.describe('Accessibility and mobile layout @mobile', () => {
  test('login page', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Sign in to IknowServiceAI' })).toBeVisible()
    await expect(page.getByText('API connected')).toBeVisible()
    await expectAccessible(page, 'login')
  })

  test('requester pages', async ({ page }) => {
    await signInAt(page, 'riley')
    await expect(page.getByRole('heading', { name: 'My requests' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Requests by status' })).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()
    await expectAccessible(page, 'dashboard')

    await openNav(page, 'New request')
    await expect(page.getByRole('heading', { name: 'New request' })).toBeVisible()
    await expectAccessible(page, 'new request')
    await page.getByRole('button', { name: 'Submit request' }).click()
    await expect(page.getByText(/title of at least 3/)).toBeVisible()
    await expectAccessible(page, 'new request with errors')

    await openNav(page, 'Knowledge')
    await expect(page.getByRole('heading', { name: 'Knowledge base' })).toBeVisible()
    await expect(page.getByRole('link').filter({ hasText: 'Wi-Fi' }).first()).toBeVisible()
    await expectAccessible(page, 'knowledge list')
    await page.getByRole('link').filter({ hasText: 'Wi-Fi' }).first().click()
    await expect(page.getByRole('article')).toBeVisible()
    await expectAccessible(page, 'knowledge article')
  })

  test('request detail in each AI state', async ({ page }) => {
    const tag = uniqueTag()
    const noAnalysis = await seedRequest('riley', {
      title: `No analysis yet ${tag}`,
      description: WIFI_BODY,
      analyze: false,
    })
    const suggestion = await seedRequest('riley', { title: `${WIFI_TITLE} ${tag}`, description: WIFI_BODY })
    const awaiting = await seedRequest('riley', {
      title: `Sensitive ${tag}`,
      description: SENSITIVE_TEXT,
    })

    await signInAt(page, 'riley', `/requests/${noAnalysis}`)
    await expect(page.getByRole('button', { name: 'Analyze', exact: true })).toBeVisible()
    await expectAccessible(page, 'request: no analysis yet')

    // In-app navigation keeps the session, so go through the list link rather than page.goto.
    const openFromDashboard = async (title) => {
      await openNav(page, 'My requests')
      await page.getByRole('link', { name: title, exact: true }).click()
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    }

    // The analyzing state: hold the response, then fail it for the failed state.
    let release
    const held = new Promise((resolve) => {
      release = resolve
    })
    await page.route('**/api/v1/requests/*/analyze', async (route) => {
      await held
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'ANALYSIS_FAILED', message: 'x', request_id: 'e2e' },
          retryable: true,
          attempts_remaining: 2,
        }),
      })
    })
    await page.getByRole('button', { name: 'Analyze', exact: true }).click()
    await expect(page.getByText('Analyzing your request…')).toBeVisible()
    await expectAccessible(page, 'request: analyzing')

    release()
    await expect(page.getByText('Analysis did not finish')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    await expect(page.getByText('2 attempts remaining.')).toBeVisible()
    await expectAccessible(page, 'request: analysis failed')
    await page.unroute('**/api/v1/requests/*/analyze')

    await openFromDashboard(`${WIFI_TITLE} ${tag}`)
    await expect(page.getByText(AI_LABEL)).toBeVisible()
    await expect(page).toHaveURL(new RegExp(suggestion))
    await expectAccessible(page, 'request: suggestion available')

    await openFromDashboard(`Sensitive ${tag}`)
    await expect(page.getByText(AWAITING_TEXT)).toBeVisible()
    await expect(page).toHaveURL(new RegExp(awaiting))
    await expectAccessible(page, 'request: awaiting staff review')
  })

  test('staff pages', async ({ page }) => {
    const tag = uniqueTag()
    const id = await seedRequest('riley', { title: `Review page ${tag}`, description: SENSITIVE_TEXT })

    await signInAt(page, 'alex', '/support')
    await expect(page.getByRole('heading', { name: 'Support queue' })).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()
    await expectAccessible(page, 'support queue')

    await page.getByRole('link', { name: `Review page ${tag}` }).click()
    await expect(page).toHaveURL(new RegExp(id))
    await expect(page.getByTestId('ai-draft')).toBeVisible()
    await expectAccessible(page, 'review page')

    await page.getByLabel(/^Review reason/).fill('A valid reason')
    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Cancel' })).toBeFocused()
    await expectAccessible(page, 'review confirmation dialog')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeFocused()
  })

  test('admin pages', async ({ page }) => {
    await signInAt(page, 'jordan', '/admin/knowledge')
    await expect(page.getByRole('heading', { name: 'Knowledge admin' })).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()
    await expectAccessible(page, 'knowledge admin')

    await page.getByRole('link', { name: 'New article' }).click()
    await page.getByLabel(/^Title/).fill('Accessibility check')
    await page.getByLabel(/^Body/).fill('## A heading\n\n- One\n- Two\n\n[A link](https://example.test)')
    await expect(page.getByTestId('article-preview').getByRole('heading', { name: 'A heading' })).toBeVisible()
    await expectAccessible(page, 'article editor with preview')

    await openNav(page, 'Audit')
    await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()
    await expectAccessible(page, 'audit log')
  })

  test('access and not-found pages', async ({ page }) => {
    await signInAt(page, 'riley', '/support')
    await expect(page.getByRole('heading', { name: "You don't have access" })).toBeVisible()
    await expectAccessible(page, '403 page')
  })

  test('not-found page, signed out', async ({ page }) => {
    await page.goto('/no-such-page')
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    await expectAccessible(page, '404 page')
  })
})

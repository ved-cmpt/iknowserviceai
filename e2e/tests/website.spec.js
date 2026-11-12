// The public website at /, and the move of the app under /app (ADR-063).
import { expect, test } from './fixtures'
import { expectAccessible, fillSignIn } from './helpers'

// Collects anything that would show the page broke: script errors, refused resources and API calls.
function watch(page) {
  const problems = []
  const apiCalls = []
  page.on('console', (message) => {
    if (message.type() === 'error' || /Content Security Policy|Refused to/i.test(message.text())) {
      problems.push(message.text())
    }
  })
  page.on('pageerror', (error) => problems.push(error.message))
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiCalls.push(request.url())
  })
  return { problems, apiCalls }
}

test.describe('Website @mobile', () => {
  test('loads with no API calls, no session probe and no errors @smoke', async ({ page, context }) => {
    const { problems, apiCalls } = watch(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('people stay in charge')
    await page.waitForLoadState('networkidle')
    expect(apiCalls).toEqual([])
    expect(problems).toEqual([])
    expect(await context.cookies()).toEqual([])
    await expectAccessible(page, 'website')
  })

  test('"Try the live demo" opens the app at its sign-in page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Try the live demo' }).first().click()
    await expect(page).toHaveURL(/\/app\/login$/)
    await expect(page.getByRole('heading', { name: 'Sign in to IknowServiceAI' })).toBeVisible()
  })

  test('an unknown address gets the website not-found page', async ({ page }) => {
    await page.goto('/no-such-page')
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open the app' }).last()).toHaveAttribute('href', '/app/login')
    await expectAccessible(page, 'website 404')
  })
})

test.describe('Old app addresses @mobile', () => {
  for (const [old, moved] of [
    ['/login', '/app/login'],
    ['/dashboard', '/app/login'],
    ['/knowledge', '/app/login'],
    ['/admin/audit', '/app/login'],
  ]) {
    test(`${old} redirects into /app`, async ({ page }) => {
      await page.goto(old)
      await expect(page).toHaveURL(new RegExp(`${moved}$`))
      await expect(page.getByRole('heading', { name: 'Sign in to IknowServiceAI' })).toBeVisible()
    })
  }

  test('an old deep link keeps its query, and lands there after sign-in @smoke', async ({ page }) => {
    await page.goto('/support?status=NEEDS_HUMAN_REVIEW')
    await expect(page).toHaveURL(/\/app\/login$/)
    await fillSignIn(page, 'alex')
    await expect(page).toHaveURL(/\/app\/support\?status=NEEDS_HUMAN_REVIEW$/)
    await expect(page.getByRole('heading', { name: 'Support queue' })).toBeVisible()
  })
})

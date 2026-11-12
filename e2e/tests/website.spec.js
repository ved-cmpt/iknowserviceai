// The public website at /, and the move of the app under /app (ADR-063).
import { expect, test } from './fixtures'
import { expectAccessible, fillSignIn, signInAt } from './helpers'

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

// The headline and buttons start near the top of the first screen, with the replay beside them on wide
// screens and below them on phones.
async function expectHeroAtTop(page) {
  await page.goto('/')
  const replay = page.getByRole('figure', { name: /A replay of two recorded runs/ })
  await expect(replay).toBeVisible()
  const viewport = page.viewportSize()
  const heading = await page.getByRole('heading', { level: 1 }).boundingBox()
  const buttons = await page.getByRole('link', { name: 'Try the live demo' }).first().boundingBox()
  const panel = await replay.boundingBox()
  expect(heading.y).toBeLessThan(240)
  expect(buttons.y + buttons.height).toBeLessThan(Math.min(viewport.height, 640))
  if (viewport.width >= 1100) {
    expect(panel.x).toBeGreaterThan(heading.x + heading.width)
    expect(panel.y).toBeLessThan(heading.y)
  } else {
    expect(panel.y).toBeGreaterThan(buttons.y + buttons.height)
  }
}

test.describe('Website hero @mobile', () => {
  test('the headline and buttons are near the top of the first screen', async ({ page }) => {
    await expectHeroAtTop(page)
  })
})

test.describe('Website hero at 1920 px', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })

  test('the headline and buttons are near the top of the first screen', async ({ page }) => {
    await expectHeroAtTop(page)
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

test.describe('Website demos @mobile', () => {
  test('each demo tab shows its recorded run, with no accessibility findings', async ({ page }) => {
    const { problems, apiCalls } = watch(page)
    await page.goto('/#demo')
    const tabs = page.getByRole('tablist', { name: 'Demos' })
    await expect(tabs).toBeVisible()

    await expect(page.getByRole('tabpanel')).toContainText('AI-generated suggestion — verify before acting')
    await tabs.getByRole('tab', { name: 'Sensitive request' }).click()
    await expect(page.getByRole('tabpanel')).toContainText('Awaiting staff review')
    await expectAccessible(page, 'website: sensitive demo')
    await tabs.getByRole('tab', { name: 'Prompt injection' }).click()
    await expect(page.getByRole('tabpanel')).toContainText('Possible prompt injection')
    await tabs.getByRole('tab', { name: 'Staff review' }).click()
    const panel = page.getByRole('tabpanel')
    await panel.getByRole('button', { name: /Try an unsafe reply/ }).click()
    await expect(panel).toContainText('UNSAFE_REPLY')
    await panel.getByRole('button', { name: /Publish a safe reply/ }).click()
    await expect(panel).toContainText('Reviewed by the support team')
    await expectAccessible(page, 'website: staff review demo')
    expect(apiCalls).toEqual([])
    expect(problems).toEqual([])
  })

  test('"See it in the app" signs in as the matching person and opens the right page @smoke', async ({ page }) => {
    await page.goto('/#demo')
    await page.getByRole('link', { name: 'See it in the app' }).click()
    await expect(page).toHaveURL(/\/app\/login\?as=riley&next=/)
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue('riley.morgan@demo.iknowservice.test')
    await page.getByLabel('Password', { exact: true }).fill(process.env.DEMO_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/app\/requests\/new$/)
  })

  test('the hero replay can be paused', async ({ page }) => {
    await page.goto('/')
    const replay = page.getByRole('figure', { name: /A replay of two recorded runs/ })
    // Tests run with reduced motion, so it starts paused on its last frame.
    await expect(replay.getByRole('button', { name: 'Play the replay' })).toBeVisible()
    await expect(replay).toContainText('Shown to the requester')
    await replay.getByRole('button', { name: 'Sensitive request' }).click()
    await expect(replay).toContainText('Held for staff review')
  })
})

test.describe('App shell tools', () => {
  test('the command palette jumps to a page, and ? lists the shortcuts', async ({ page }) => {
    await signInAt(page, 'jordan')
    await page.keyboard.press('Control+k')
    const palette = page.getByRole('dialog', { name: 'Search' })
    await expect(palette).toBeVisible()
    await palette.getByRole('combobox').fill('audit')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible()
    await expectAccessible(page, 'audit log, after the palette')

    await page.keyboard.press('?')
    const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
    await expect(help).toBeVisible()
    await expectAccessible(page, 'keyboard shortcuts')
    await page.keyboard.press('Escape')
    await page.keyboard.press('g')
    await page.keyboard.press('k')
    await expect(page.getByRole('heading', { name: 'Knowledge base' })).toBeVisible()
  })

  test('the palette passes axe while open', async ({ page }) => {
    await signInAt(page, 'riley')
    await page.getByRole('button', { name: 'Open search', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible()
    await expectAccessible(page, 'command palette')
  })

  test('the first-visit tour shows once, and passes axe @mobile', async ({ page, context }) => {
    // Lets the tour show for this context only (fixtures.js marks it seen otherwise).
    await context.addInitScript(() => sessionStorage.setItem('iks-e2e-tour', '1'))
    await page.goto('/app/login')
    await page.evaluate(() => localStorage.removeItem('iks-tour-done'))
    await fillSignIn(page, 'alex')
    const tour = page.getByTestId('tour')
    await expect(tour.getByRole('heading', { name: 'Welcome, Alex' })).toBeVisible()
    await expectAccessible(page, 'first-visit tour')
    await tour.getByRole('button', { name: 'Next' }).click()
    await expect(tour.getByRole('heading', { name: 'Your queue' })).toBeVisible()
    await tour.getByRole('button', { name: 'Skip the tour' }).click()
    await expect(tour).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Support queue' })).toBeVisible()
    await expect(page.getByTestId('tour')).toHaveCount(0)
  })
})

// Every screen at the two widths between the phone and desktop projects (375 and 1440 px), in both
// themes, with no horizontal scroll. expectAccessible fails on any axe finding (ADR-067).
import { expect, test } from './fixtures'
import { expectAccessible, seedRequest, SENSITIVE_TEXT, signInAt, uniqueTag, WIFI_BODY, WIFI_TITLE } from './helpers'

for (const width of [768, 1280]) {
  test.describe(`Every screen at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test('website, sign-in and error pages', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('tablist', { name: 'Demos' })).toBeVisible()
      await expectAccessible(page, `website at ${width}`)
      await page.goto('/no-such-page')
      await expectAccessible(page, `website 404 at ${width}`)
      await page.goto('/app/login')
      await expect(page.getByRole('heading', { name: 'Sign in to IknowServiceAI' })).toBeVisible()
      await expectAccessible(page, `sign-in at ${width}`)
    })

    test('requester screens', async ({ page }) => {
      const tag = uniqueTag()
      const cited = await seedRequest('riley', { title: `${WIFI_TITLE} ${tag}`, description: WIFI_BODY })
      const held = await seedRequest('riley', { title: `Sensitive ${tag}`, description: SENSITIVE_TEXT })
      await signInAt(page, 'riley', '/app/dashboard')
      await expect(page.getByRole('table')).toBeVisible()
      await expectAccessible(page, `dashboard at ${width}`)
      await page.goto('/app/requests/new')
      await expectAccessible(page, `new request at ${width}`)
      await page.goto(`/app/requests/${cited}`)
      await expect(page.getByTestId('suggestion-reply')).toBeVisible()
      await expectAccessible(page, `suggestion at ${width}`)
      await page.goto(`/app/requests/${held}`)
      await expect(page.getByText('Awaiting staff review')).toBeVisible()
      await expectAccessible(page, `awaiting review at ${width}`)
      await page.goto('/app/knowledge')
      await expect(page.getByRole('heading', { name: 'Knowledge base' })).toBeVisible()
      await expectAccessible(page, `knowledge at ${width}`)
      await page.getByRole('link').filter({ hasText: 'Wi-Fi' }).first().click()
      await expect(page.getByRole('article')).toBeVisible()
      await expectAccessible(page, `article at ${width}`)
      await page.goto('/app/support')
      await expect(page.getByRole('heading', { name: "You don't have access" })).toBeVisible()
      await expectAccessible(page, `403 at ${width}`)
    })

    test('staff and admin screens', async ({ page }) => {
      const held = await seedRequest('riley', { title: `Held ${uniqueTag()}`, description: SENSITIVE_TEXT })
      await signInAt(page, 'jordan', '/app/support')
      await expect(page.getByRole('table')).toBeVisible()
      await expectAccessible(page, `support queue at ${width}`)
      await page.goto(`/app/support/${held}`)
      await expect(page.getByRole('heading', { name: 'Review the AI draft' })).toBeVisible()
      await page.getByLabel(/^Reply to publish/).fill('Our support team will contact you through a verified channel.')
      await expect(page.getByTestId('reply-diff')).toBeVisible()
      await expectAccessible(page, `review workspace at ${width}`)
      await page.goto('/app/admin/knowledge')
      await expect(page.getByRole('heading', { name: 'Knowledge admin' })).toBeVisible()
      await expectAccessible(page, `knowledge admin at ${width}`)
      await page.goto('/app/admin/knowledge/new')
      await expectAccessible(page, `article editor at ${width}`)
      await page.goto('/app/admin/audit')
      await expect(page.getByRole('table')).toBeVisible()
      await expectAccessible(page, `audit log at ${width}`)
      await page.keyboard.press('Control+k')
      await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible()
      await expectAccessible(page, `command palette at ${width}`)
    })
  })
}

test.describe('Motion', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } })

  test('with motion allowed, the hero plays, can be paused, and stays accessible mid-animation', async ({ page }) => {
    await page.goto('/')
    const replay = page.getByRole('figure', { name: /A replay of two recorded runs/ })
    const pause = replay.getByRole('button', { name: 'Pause the replay' })
    await expect(pause).toBeVisible()
    await expect(replay.locator('[aria-current="step"]')).toBeVisible()
    await page.waitForTimeout(2500)
    await expectAccessible(page, 'website while the hero plays')
    await pause.click()
    const step = await replay.locator('[aria-current="step"]').textContent()
    await page.waitForTimeout(2500)
    expect(await replay.locator('[aria-current="step"]').textContent()).toBe(step)
  })
})

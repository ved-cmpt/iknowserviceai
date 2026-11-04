import { expect, test } from './fixtures'
import {
  AI_LABEL,
  apiAs,
  AWAITING_TEXT,
  expectAccessible,
  labelled,
  labelledSlug,
  newSession,
  openNav,
  paceLogin,
  REVIEWED_LABEL,
  scenarioTitle,
  seedRequest,
  SENSITIVE_TEXT,
  signInAt,
  submitNewRequest,
  uniqueTag,
  USERS,
  WIFI_ARTICLE,
  WIFI_BODY,
  WIFI_TITLE,
} from './helpers'

const SAFE_REPLY =
  'Our support team will contact you through a verified channel. Please do not share your password with anyone.'
const UNSAFE_REPLY = 'Please send us your password so we can check your account.'

test.describe('1. Ordinary', () => {
  test('a requester gets a labelled, cited suggestion and rates it @mobile @smoke', async ({ page }, testInfo) => {
    const title = scenarioTitle(WIFI_TITLE, testInfo)
    let analyzeCalls = 0
    await page.route('**/api/v1/requests/*/analyze', async (route) => {
      analyzeCalls += 1
      await new Promise((resolve) => setTimeout(resolve, 600)) // Long enough to see the progress.
      await route.continue()
    })

    await signInAt(page, 'riley')
    await expect(page.getByRole('heading', { name: 'My requests' })).toBeVisible()
    await submitNewRequest(page, title, WIFI_BODY)

    await expect(page.getByText('Analyzing your request…')).toBeVisible()
    await expect(page.getByText(AI_LABEL)).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    // The reply is built from the article: an opening, its first steps and an escalation line.
    const suggested = page.getByTestId('suggestion-reply')
    await expect(suggested).toContainText(WIFI_ARTICLE)
    await expect(suggested).toContainText('1. Turn Wi-Fi off and on again')
    await expect(suggested).toContainText("If this doesn't help, add a comment")
    await expect(page.getByText(REVIEWED_LABEL)).toHaveCount(0)
    await expect(page.getByText('Triaged', { exact: true })).toBeVisible()

    // Only the Wi-Fi article is cited, and the citation opens inside the app.
    const citations = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: /Wi-Fi|VPN/ }) })
    await expect(citations).toHaveCount(1)
    await page.getByRole('link', { name: WIFI_ARTICLE }).click()
    await expect(page).toHaveURL(/\/knowledge\//)
    await expect(page.getByRole('heading', { level: 1, name: WIFI_ARTICLE })).toBeVisible()

    await page.goBack()
    await page.getByRole('button', { name: 'Helpful', exact: true }).click()
    await expect(page.getByText('Thank you for your feedback.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Helpful', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Not helpful' })).toBeDisabled()

    expect(analyzeCalls, 'analysis must run exactly once, even after going back').toBe(1)
  })

  test('the whole journey works with the keyboard alone', async ({ page }) => {
    const pressTabUntilFocused = async (locator, key = 'Tab', maxTabs = 40) => {
      for (let tabs = 0; tabs < maxTabs; tabs += 1) {
        await page.keyboard.press(key)
        if (await locator.evaluate((element) => element === document.activeElement)) return
      }
      throw new Error(`Could not reach ${locator} with Tab`)
    }
    const title = labelled(`${WIFI_TITLE} ${uniqueTag()}`)

    await page.goto('/login')
    await pressTabUntilFocused(page.getByLabel('Email', { exact: true }))
    await page.keyboard.type(USERS.riley)
    await page.keyboard.press('Tab')
    await page.keyboard.type(process.env.DEMO_PASSWORD)
    await paceLogin()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'My requests' })).toBeVisible()

    // Focus moved into the page after sign-in loaded a new document state: start from the top.
    await page.evaluate(() => document.activeElement?.blur())
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeInViewport()

    const nav = page.getByRole('navigation', { name: 'Main' })
    await pressTabUntilFocused(nav.getByRole('link', { name: 'New request' }))
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'New request' })).toBeVisible()

    await pressTabUntilFocused(page.getByLabel(/^Title/))
    await page.keyboard.type(title)
    await pressTabUntilFocused(page.getByLabel(/^Description/))
    await page.keyboard.type(WIFI_BODY)
    await pressTabUntilFocused(page.getByRole('button', { name: 'Submit request' }))
    await page.keyboard.press('Space')

    await expect(page.getByText(AI_LABEL)).toBeVisible()

    await pressTabUntilFocused(page.getByRole('button', { name: 'Helpful', exact: true }))
    await page.keyboard.press('Space')
    await expect(page.getByText('Thank you for your feedback.')).toBeVisible()

    // Back up to the citation with Shift+Tab, and open it with Enter.
    const citation = page.getByRole('link', { name: WIFI_ARTICLE })
    await pressTabUntilFocused(citation, 'Shift+Tab')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name: WIFI_ARTICLE })).toBeVisible()
  })
})

test.describe('2. Sensitive', () => {
  test('held text is hidden until staff approve an edited, safe reply @mobile @smoke', async ({ page, browser }, testInfo) => {
    const title = scenarioTitle(SENSITIVE_TEXT, testInfo)
    const rileyResponses = []
    page.on('response', async (response) => {
      if (/\/api\/v1\/requests\/[0-9a-f-]+(\/analyze)?$/.test(response.url()) && response.ok()) {
        rileyResponses.push(await response.text().catch(() => ''))
      }
    })

    await signInAt(page, 'riley')
    await submitNewRequest(page, title, `${SENSITIVE_TEXT}. Please help.`)

    await expect(page.getByText(AWAITING_TEXT)).toBeVisible()
    await expect(page.getByText(AI_LABEL)).toHaveCount(0)
    await expect(page.getByTestId('suggestion-reply')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Helpful', exact: true })).toHaveCount(0)
    const requestUrl = page.url()
    const requestId = requestUrl.split('/').pop()

    // What staff can see is exactly what Riley's page and responses must not contain.
    const staffApi = await apiAs('alex')
    const heldReply = (await staffApi.get(`/requests/${requestId}`)).suggestion.proposed_reply
    await staffApi.dispose()
    expect(heldReply.length).toBeGreaterThan(10)
    await expect(page.locator('body')).not.toContainText(heldReply)
    expect(rileyResponses.length).toBeGreaterThan(0)
    for (const body of rileyResponses) {
      expect(body).not.toContain(heldReply)
      expect(body).not.toContain('proposed_reply')
      expect(body).not.toContain('risk_flags')
    }

    // Alex finds it from the queue.
    const staff = await newSession(browser, 'alex', '/support')
    const alex = staff.page
    await alex.getByRole('button', { name: /^Needs review/ }).click()
    await alex.getByRole('link', { name: title, exact: true }).click()
    await expect(alex.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await expect(alex.getByTestId('ai-draft')).toHaveText(heldReply)
    await expect(alex.getByText('Possible account compromise').first()).toBeVisible()

    // An unsafe reply is refused by the server check, on the field, before any dialog opens.
    const reply = alex.getByLabel(/^Reply to publish/)
    await expect(reply).toHaveValue(heldReply)
    await reply.fill(UNSAFE_REPLY)
    await alex.getByLabel(/^Review reason/).fill('Sensitive issue; using safe wording')
    await alex.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(alex.getByText(/appears to ask for a password, code or token/)).toBeVisible()
    await expect(alex.getByRole('dialog')).toHaveCount(0)
    await expect(reply).toHaveValue(UNSAFE_REPLY)

    // The edited safe reply goes through.
    await reply.fill(SAFE_REPLY)
    await alex.getByRole('button', { name: 'Approve', exact: true }).click()
    await alex.getByRole('dialog').getByRole('button', { name: 'Approve and publish' }).click()
    await expect(alex.getByTestId('published-reply')).toHaveText(SAFE_REPLY)
    await expect(alex.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0)
    await staff.context.close()

    // Riley's open page updates by itself, showing exactly the approved reply, labelled as reviewed.
    await expect(page.getByTestId('suggestion-reply')).toHaveText(SAFE_REPLY)
    await expect(page).toHaveURL(requestUrl)
    await expect(page.getByText(REVIEWED_LABEL)).toBeVisible()
    await expect(page.getByText(AI_LABEL)).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText(heldReply)
    await expect(page.getByText(AWAITING_TEXT)).toHaveCount(0)
  })
})

test.describe('3. Reject', () => {
  test('a rejected suggestion never reaches the requester', async ({ page, browser }) => {
    const title = labelled(`Reject me: ${SENSITIVE_TEXT} ${uniqueTag()}`)
    await signInAt(page, 'riley')
    await submitNewRequest(page, title, `${SENSITIVE_TEXT}. Please help.`)
    await expect(page.getByText(AWAITING_TEXT)).toBeVisible()
    const requestUrl = page.url()

    const staff = await newSession(browser, 'alex', '/support?status=NEEDS_HUMAN_REVIEW')
    const alex = staff.page
    await alex.getByRole('link', { name: title, exact: true }).click()
    const heldReply = await alex.getByTestId('ai-draft').textContent()
    await alex.getByLabel(/^Review reason/).fill('Draft does not fit this case')
    await alex.getByRole('button', { name: 'Reject', exact: true }).click()
    await alex.getByRole('dialog').getByRole('button', { name: 'Reject suggestion' }).click()
    await expect(alex.getByText('Rejected', { exact: true })).toBeVisible()
    await staff.context.close()

    let rileyBody = ''
    page.on('response', async (response) => {
      if (response.url().endsWith(requestUrl.split('/').pop()) && response.ok()) {
        rileyBody = await response.text().catch(() => '')
      }
    })
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await expect(page.locator('body')).not.toContainText(heldReply)
    await expect(page.getByText(AI_LABEL)).toHaveCount(0)
    await expect(page.getByText(AWAITING_TEXT)).toHaveCount(0)
    await expect(page.getByText(/reject/i)).toHaveCount(1) // The title alone, in the page heading.
    await expect.poll(() => rileyBody).not.toBe('')
    expect(JSON.parse(rileyBody).suggestion).toBeNull()
    expect(rileyBody).not.toContain(heldReply)
  })
})

test.describe('4. Admin knowledge', () => {
  test('publishing and unpublishing controls what requesters can find', async ({ page, browser }) => {
    const term = `zq${uniqueTag()}`
    const title = labelled(`Guide to ${term} docking stations`)

    await signInAt(page, 'jordan')
    await openNav(page, 'Knowledge admin')
    await page.getByRole('link', { name: 'New article' }).click()
    await page.getByLabel(/^Title/).fill(title)
    await expect(page.getByLabel(/^Slug/)).toHaveValue(labelledSlug(`guide-to-${term}-docking-stations`))
    await page.getByLabel(/^Category/).selectOption('HARDWARE')
    await page.getByLabel(/^Tags/).fill('docking, hardware')
    await page.getByLabel(/^Body/).fill(`## Docking\n\nReseat the ${term} cable.\n\n<script>window.__pwned = true</script>`)

    // The preview renders markdown and leaves script inert.
    const preview = page.getByTestId('article-preview')
    await expect(preview.getByRole('heading', { level: 2, name: 'Docking' })).toBeVisible()
    await expect(preview.locator('script')).toHaveCount(0)
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined()

    await page.getByRole('button', { name: 'Create draft' }).click()
    await expect(page.getByRole('heading', { name: 'Edit article' })).toBeVisible()
    await expect(page.getByText('Version 1')).toBeVisible()

    // A draft is not searchable yet.
    const requester = await newSession(browser, 'riley', `/knowledge?q=${term}`)
    const riley = requester.page
    await expect(riley.getByText(/No articles match your search/)).toBeVisible()

    await page.getByRole('button', { name: `Publish: ${title}` }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Publish' }).click()
    await expect(page.getByRole('button', { name: `Unpublish: ${title}` })).toBeVisible()

    const search = async () => {
      await riley.getByLabel('Search articles').fill(term)
      await riley.getByRole('button', { name: 'Search' }).click()
    }
    await riley.reload()
    await search()
    await expect(riley.getByRole('link', { name: title })).toBeVisible()

    // A content edit raises the version.
    await page.getByLabel(/^Body/).fill(`## Docking\n\nReseat the ${term} cable, then restart.`)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Saved. This is now version 2.')).toBeVisible()

    await page.getByRole('button', { name: `Unpublish: ${title}` }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Unpublish' }).click()
    await expect(page.getByRole('button', { name: `Publish: ${title}` })).toBeVisible()

    await riley.reload()
    await search()
    await expect(riley.getByText(/No articles match your search/)).toBeVisible()
    await expect(riley.getByRole('link', { name: title })).toHaveCount(0)
    await requester.context.close()
  })

  test('a duplicate slug is explained on the field', async ({ page }) => {
    await signInAt(page, 'jordan', '/admin/knowledge/new')
    await page.getByLabel(/^Title/).fill('A duplicate slug')
    await page.getByLabel(/^Slug/).fill('wifi-connected-no-internet')
    await page.getByLabel(/^Body/).fill('Body text')
    await page.getByRole('button', { name: 'Create draft' }).click()
    await expect(page.getByText('Another article already uses this slug. Choose a different one.')).toBeVisible()
  })
})

test.describe('5. Authorization', () => {
  test('a requester sees the access page at /support @mobile', async ({ page }) => {
    await signInAt(page, 'riley', '/support')
    await expect(page.getByRole('heading', { name: "You don't have access" })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Go to my requests' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Support queue' })).toHaveCount(0)
  })

  test('a requester gets 404 for another person\'s request @mobile @smoke', async ({ page }) => {
    const samsRequest = await seedRequest('sam', {
      title: labelled(`Sam's private request ${uniqueTag()}`),
      description: 'A request only Sam and the support team may read.',
      analyze: false,
    })

    await signInAt(page, 'riley', `/requests/${samsRequest}`)
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText("Sam's private request")
  })

  test('a reload keeps you signed in, and Sign out ends the session for good @mobile @smoke', async ({ page }) => {
    await signInAt(page, 'riley')
    await expect(page.getByRole('heading', { name: 'My requests' })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'My requests' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
    const stored = await page.evaluate(() => [localStorage.length, sessionStorage.length])
    expect(stored).toEqual([0, 0])

    // A direct visit to a deep link works too.
    await page.goto('/knowledge')
    await expect(page.getByRole('heading', { name: 'Knowledge base' })).toBeVisible()

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('heading', { name: 'Sign in to IknowServiceAI' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Sign in to IknowServiceAI' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0)
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Sign in to IknowServiceAI' })).toBeVisible()
  })

  test('an agent cannot open the admin pages', async ({ page }) => {
    await signInAt(page, 'alex', '/admin/audit')
    await expect(page.getByRole('heading', { name: "You don't have access" })).toBeVisible()
  })
})

test.describe('7. Staying current', () => {
  test('the Refresh button brings a new request into the queue', async ({ page }) => {
    await signInAt(page, 'alex', '/support')
    await expect(page.getByRole('table')).toBeVisible()

    const title = labelled(`Arrived after loading ${uniqueTag()}`)
    await seedRequest('riley', {
      title,
      description: 'This request is created after the queue was loaded.',
      analyze: false,
    })
    await expect(page.getByRole('link', { name: title })).toHaveCount(0)
    await page.getByRole('button', { name: 'Refresh' }).click()
    await expect(page.getByRole('link', { name: title })).toBeVisible()
  })

  test('a wide screen shows the links, with no menu button', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'This is about the wide layout.')
    await signInAt(page, 'riley')
    await expect(page.getByRole('heading', { name: 'My requests' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden()
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Knowledge' })).toBeVisible()
  })

  test('the narrow-screen menu opens, navigates and closes @mobile', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'The menu button only shows on narrow screens.')
    await signInAt(page, 'riley')
    const menu = page.getByRole('button', { name: 'Menu' })
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(menu).toHaveAttribute('aria-expanded', 'false')
    await expect(nav.getByRole('link', { name: 'Knowledge' })).toHaveCount(0)

    await menu.click()
    await expect(menu).toHaveAttribute('aria-expanded', 'true')
    await expectAccessible(page, 'narrow-screen menu open')

    await nav.getByRole('link', { name: 'Knowledge' }).click()
    await expect(page.getByRole('heading', { name: 'Knowledge base' })).toBeVisible()
    await expect(menu).toHaveAttribute('aria-expanded', 'false')
  })
})

test.describe('7. Staying current, staff', () => {
  test('the staff page shows changes by others, and leaves typed text alone', async ({ browser }) => {
    const title = labelled(`Refreshes itself ${uniqueTag()}`)
    const id = await seedRequest('riley', {
      title,
      description: 'My monitor flickers on and off.',
      analyze: false,
    })
    const staff = await newSession(browser, 'alex', `/support/${id}`)
    await expect(staff.page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    const comment = staff.page.getByLabel(/^Add a comment/)
    await comment.fill('Half-written note')
    await comment.blur()

    const requester = await apiAs('riley')
    await requester.post(`/requests/${id}/comments`, { body: 'It got worse this morning.' })
    await requester.dispose()

    await expect(staff.page.getByText('It got worse this morning.')).toBeVisible({ timeout: 20_000 })
    await expect(comment).toHaveValue('Half-written note')
    await staff.context.close()
  })
})

test.describe('6. Stale update', () => {
  test('the second staff save shows the stale message, keeps the text, and works after reload', async ({ browser }) => {
    const title = labelled(`Two people edit this ${uniqueTag()}`)
    const id = await seedRequest('sam', {
      title,
      description: 'The second floor printer needs attention soon.',
      analyze: false,
    })
    const first = await newSession(browser, 'alex', `/support/${id}`)
    const second = await newSession(browser, 'jordan', `/support/${id}`)
    await expect(second.page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await expect(first.page.getByRole('heading', { level: 1, name: title })).toBeVisible()

    // The second person is already in a field, so the page's own refresh waits.
    await second.page.getByLabel(/^Reason for the change/).focus()
    await first.page.getByLabel('Priority', { exact: true }).selectOption('HIGH')
    await first.page.getByLabel(/^Reason for the change/).fill('Affects the whole floor')
    await first.page.getByRole('button', { name: 'Save changes' }).click()
    await expect(first.page.getByLabel(/^Reason for the change/)).toHaveValue('')

    const typed = 'Exam week, so raising this further'
    const stale = second.page
    await stale.getByLabel('Priority', { exact: true }).selectOption('URGENT')
    await stale.getByLabel(/^Reason for the change/).fill(typed)
    await stale.getByRole('button', { name: 'Save changes' }).click()

    const alert = stale.getByRole('alert')
    await expect(alert).toContainText('Someone else changed this request. Reload to see the latest version.')
    await expect(stale.getByLabel(/^Reason for the change/)).toHaveValue(typed)

    await alert.getByRole('button', { name: 'Reload' }).click()
    await expect(stale.getByRole('alert')).toHaveCount(0)
    await expect(stale.getByLabel(/^Reason for the change/)).toHaveValue(typed)
    await expect(stale.getByText('Reason: Affects the whole floor')).toBeVisible()

    await stale.getByRole('button', { name: 'Save changes' }).click()
    await expect(stale.getByLabel(/^Reason for the change/)).toHaveValue('')
    await expect(stale.getByText('Priority changed from High to Urgent')).toBeVisible()

    await first.context.close()
    await second.context.close()
  })
})

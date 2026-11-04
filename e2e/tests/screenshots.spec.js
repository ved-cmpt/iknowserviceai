// Captures the README screenshots from synthetic demo data, against the production image, so the
// public demo banner is in them. run-prod.mjs resets the data first.
//
// Tracked set: light desktop and mobile, plus two dark. SCREENSHOT_ALL_DARK=1 adds every screen in
// dark, for reviewing the redesign by eye.
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  AI_LABEL,
  AWAITING_TEXT,
  REVIEWED_LABEL,
  openNav,
  seedRequest,
  SENSITIVE_TEXT,
  signInAt,
  WIFI_BODY,
  WIFI_TITLE,
  apiAs,
} from './helpers'

const DIRECTORY = process.env.SCREENSHOT_DIR ?? 'screenshots'
const ALL_DARK = Boolean(process.env.SCREENSHOT_ALL_DARK)
const TRACKED_DARK = new Set(['review-workspace', 'request-suggestion'])
const MOBILE = { width: 375, height: 812 }
const SAFE_REPLY =
  'Our support team will contact you through a verified channel. Please do not share your password with anyone.'

async function setTheme(page, theme) {
  await page.evaluate((value) => {
    document.documentElement.dataset.theme = value
  }, theme)
}

async function capture(page, name, fullPage = false) {
  // Let the health check and any late layout settle, so pictures are stable.
  await expect(page.getByText('Checking API…')).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  // A full-page picture of a sticky column is only right from the top of the page.
  await page.evaluate(() => document.activeElement?.blur())
  await page.evaluate(() => window.scrollTo(0, 0))
  await setTheme(page, 'light')
  await page.screenshot({ path: join(DIRECTORY, `${name}.png`), fullPage })
  if (ALL_DARK || TRACKED_DARK.has(name)) {
    await setTheme(page, 'dark')
    await page.screenshot({ path: join(DIRECTORY, `${name}-dark.png`), fullPage })
    await setTheme(page, 'light')
  }
}

test.describe.configure({ mode: 'serial' })

test('sign-in page', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Sign in to IknowServiceAI' })).toBeVisible()
  await expect(page.getByTestId('demo-banner')).toBeVisible()
  await capture(page, 'login')

  await page.setViewportSize(MOBILE)
  await capture(page, 'mobile-login', true)
})

test('requester pages', async ({ page }) => {
  const wifi = await seedRequest('riley', { title: WIFI_TITLE, description: WIFI_BODY })
  await seedRequest('riley', { title: SENSITIVE_TEXT, description: `${SENSITIVE_TEXT}. Please help.` })

  await signInAt(page, 'riley')
  await expect(page.getByRole('table')).toBeVisible()
  await capture(page, 'requester-dashboard')

  await page.getByRole('link', { name: WIFI_TITLE }).click()
  await expect(page.getByText(AI_LABEL)).toBeVisible()
  await expect(page).toHaveURL(new RegExp(wifi))
  await capture(page, 'request-suggestion', true)

  await openNav(page, 'My requests')
  await page.getByRole('link', { name: SENSITIVE_TEXT }).click()
  await expect(page.getByText(AWAITING_TEXT)).toBeVisible()
  await capture(page, 'awaiting-review', true)

  await openNav(page, 'Knowledge')
  await page.getByRole('link').filter({ hasText: 'Wi-Fi' }).first().click()
  await expect(page.getByRole('article')).toBeVisible()
  await capture(page, 'knowledge-article', true)
})

test('mobile requester pages', async ({ page }) => {
  await page.setViewportSize(MOBILE)
  await signInAt(page, 'riley')
  await expect(page.getByRole('table')).toBeVisible()
  await capture(page, 'mobile-dashboard', true)

  await page.getByRole('link', { name: WIFI_TITLE }).click()
  await expect(page.getByText(AI_LABEL)).toBeVisible()
  await capture(page, 'mobile-request-suggestion', true)
})

test('staff pages', async ({ page }) => {
  await signInAt(page, 'alex', '/support')
  await expect(page.getByRole('table')).toBeVisible()
  await capture(page, 'support-queue')

  await page.getByRole('button', { name: /^Needs review/ }).click()
  await page.getByRole('link', { name: SENSITIVE_TEXT }).click()
  await expect(page.getByTestId('ai-draft')).toBeVisible()
  await page.getByLabel(/^Review reason/).fill('Sensitive issue; using safe escalation wording')
  await page.getByLabel(/^Reply to publish/).fill(SAFE_REPLY)
  await capture(page, 'review-workspace', true)

  await page.setViewportSize(MOBILE)
  await capture(page, 'mobile-review-workspace', true)
})

test('reviewed reply', async ({ page }) => {
  const staff = await apiAs('alex')
  const { items } = await staff.get('/requests?status=NEEDS_HUMAN_REVIEW&limit=50')
  const held = items.find((item) => item.title === SENSITIVE_TEXT)
  const detail = await staff.get(`/requests/${held.id}`)
  await staff.post(`/requests/${held.id}/review`, {
    decision: 'APPROVED',
    published_reply: SAFE_REPLY,
    review_reason: 'Sensitive issue; safe wording used',
    expected_suggestion_id: detail.suggestion.id,
    next_status: 'TRIAGED',
  })
  await staff.dispose()

  await signInAt(page, 'riley', `/requests/${held.id}`)
  await expect(page.getByText(REVIEWED_LABEL)).toBeVisible()
  await capture(page, 'reviewed-reply', true)
})

test('admin pages', async ({ page }) => {
  await signInAt(page, 'jordan', '/admin/knowledge/new')
  await page.getByLabel(/^Title/).fill('Docking station not detected')
  await page.getByLabel(/^Category/).selectOption('HARDWARE')
  await page.getByLabel(/^Tags/).fill('docking, hardware')
  await page.getByLabel(/^Body/).fill(
    '## Quick checks\n\n1. Reseat the cable at both ends.\n2. Restart the laptop while docked.\n3. Try a different port.\n\n' +
      '## Still not working?\n\nAdd a comment to your request, and **do not share your password** with anyone.\n\n' +
      '<script>alert("this stays inert")</script>',
  )
  await expect(page.getByTestId('article-preview').getByRole('heading', { name: 'Quick checks' })).toBeVisible()
  await capture(page, 'knowledge-admin-preview', true)

  await openNav(page, 'Audit')
  await expect(page.getByRole('table')).toBeVisible()
  await capture(page, 'audit-log')
})

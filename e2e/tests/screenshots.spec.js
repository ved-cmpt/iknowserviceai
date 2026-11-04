// Captures the README screenshots from synthetic demo data. run.mjs resets the data first.
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  AI_LABEL,
  AWAITING_TEXT,
  openNav,
  seedRequest,
  SENSITIVE_TEXT,
  signInAt,
  WIFI_BODY,
  WIFI_TITLE,
} from './helpers'

const DIRECTORY = process.env.SCREENSHOT_DIR ?? 'screenshots'
const MOBILE = { width: 375, height: 812 }

async function capture(page, name, fullPage = false) {
  // Let the health check and any late layout settle, so pictures are stable.
  await expect(page.getByText('Checking API…')).toHaveCount(0)
  await page.screenshot({ path: join(DIRECTORY, `${name}.png`), fullPage })
}

test.describe.configure({ mode: 'serial' })

test('login', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Sign in to IknowServiceAI' })).toBeVisible()
  await capture(page, 'login')
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
  await capture(page, 'awaiting-review')
})

test('mobile requester pages', async ({ page }) => {
  await page.setViewportSize(MOBILE)
  await signInAt(page, 'riley')
  await expect(page.getByRole('table')).toBeVisible()
  await capture(page, 'mobile-dashboard')

  await page.getByRole('link', { name: WIFI_TITLE }).click()
  await expect(page.getByText(AI_LABEL)).toBeVisible()
  await capture(page, 'mobile-request-suggestion')
})

test('staff review workspace', async ({ page }) => {
  await signInAt(page, 'alex', '/support?status=NEEDS_HUMAN_REVIEW')
  await page.getByRole('link', { name: SENSITIVE_TEXT }).click()
  await expect(page.getByTestId('ai-draft')).toBeVisible()
  await page.getByLabel(/^Review reason/).fill('Sensitive issue; using safe escalation wording')
  await capture(page, 'review-workspace', true)
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

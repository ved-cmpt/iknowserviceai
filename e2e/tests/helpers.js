import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, request as playwrightRequest } from '@playwright/test'
import { countRequest, prepareContext, test } from './fixtures'

export const PASSWORD = process.env.DEMO_PASSWORD
const API_URL = process.env.API_URL
// Only set by a live run (run-live.mjs).
const TITLE_LABEL = process.env.E2E_TITLE_LABEL ?? ''
const LOGIN_GAP_MS = Number(process.env.E2E_LOGIN_GAP_MS ?? 0)
const LOGIN_CLOCK = join(tmpdir(), 'iks-e2e-last-login')

// Marks a created title as test data on a live run. Elsewhere it returns the title unchanged.
export function labelled(title) {
  return TITLE_LABEL ? `${TITLE_LABEL} ${title}` : title
}

// The slug the form derives from a labelled title, whose brackets are dropped.
export function labelledSlug(slug) {
  return TITLE_LABEL ? `${TITLE_LABEL.replace(/[^a-z0-9]+/gi, '').toLowerCase()}-${slug}` : slug
}

// Keeps a live run under the sign-in limit. A file, because a failed test restarts the worker.
export async function paceLogin() {
  if (!LOGIN_GAP_MS) return
  let last = 0
  try {
    last = Number(readFileSync(LOGIN_CLOCK, 'utf8'))
  } catch {
    // The first sign-in of this run.
  }
  const wait = last + LOGIN_GAP_MS - Date.now()
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  writeFileSync(LOGIN_CLOCK, String(Date.now()))
}

export const USERS = {
  riley: 'riley.morgan@demo.iknowservice.test',
  sam: 'sam.patel@demo.iknowservice.test',
  alex: 'alex.chen@demo.iknowservice.test',
  jordan: 'jordan.reyes@demo.iknowservice.test',
}

export const AI_LABEL = 'AI-generated suggestion — verify before acting'
export const REVIEWED_LABEL = 'Reviewed by the support team'
export const AWAITING_TEXT =
  "A support team member is reviewing this request. We'll show guidance here once it's approved."
export const WIFI_TITLE = 'The campus Wi-Fi connects but I cannot open websites'
export const WIFI_BODY = 'My laptop shows it is connected to Wi-Fi, but every website times out.'
export const WIFI_ARTICLE = 'Wi-Fi connected but websites not loading'
export const SENSITIVE_TEXT = 'I think someone accessed my account and I need admin credentials'

// A reload keeps the session, through the refresh cookie. Each test's browser context starts with
// no cookie, so it starts signed out.
export async function fillSignIn(page, who) {
  await page.getByLabel('Email', { exact: true }).fill(USERS[who])
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await paceLogin()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
}

// Opens a path signed out, signs in, and lands back on that path.
export async function signInAt(page, who, path = '/app/login') {
  await page.goto(path)
  await expect(page.getByRole('heading', { name: 'Sign in to IknowServiceAI' })).toBeVisible()
  await fillSignIn(page, who)
}

// On narrow screens the links sit behind the menu button.
export async function openNav(page, name) {
  const menu = page.getByRole('button', { name: 'Menu' })
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'false') {
    await menu.click()
  }
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true }).click()
}

// A second person in their own browser context, at the same viewport as the running project.
export async function newSession(browser, who, path) {
  const { baseURL, viewport, isMobile, hasTouch } = test.info().project.use
  const context = await browser.newContext({ baseURL, viewport, isMobile, hasTouch })
  await prepareContext(context)
  const page = await context.newPage()
  await signInAt(page, who, path)
  return { context, page }
}

// Direct API access for test setup, and to read what staff can see for comparison.
export async function apiAs(who) {
  const context = await playwrightRequest.newContext()
  await paceLogin()
  countRequest('POST', `${API_URL}/auth/login`)
  const login = await context.post(`${API_URL}/auth/login`, {
    data: { email: USERS[who], password: PASSWORD },
  })
  expect(login.ok()).toBeTruthy()
  const { access_token: token } = await login.json()
  const headers = { Authorization: `Bearer ${token}` }

  async function call(method, path, data) {
    countRequest(method, `${API_URL}${path}`)
    const response = await context.fetch(`${API_URL}${path}`, { method, headers, data })
    expect(response.ok(), `${method} ${path} returned ${response.status()}`).toBeTruthy()
    return response.json()
  }

  return {
    get: (path) => call('GET', path),
    post: (path, data) => call('POST', path, data),
    dispose: () => context.dispose(),
  }
}

// A request created and analyzed through the API, ready for a screen to display.
export async function seedRequest(who, { title, description, analyze = true }) {
  const api = await apiAs(who)
  const created = await api.post('/requests', { title, description })
  if (analyze) await api.post(`/requests/${created.id}/analyze`)
  await api.dispose()
  return created.id
}

export function uniqueTag() {
  return Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')
}

// Scenario titles use the brief's exact wording on desktop. The mobile rerun adds a marker, so
// the queue has one link with that name.
export function scenarioTitle(base, testInfo) {
  // A live database keeps earlier runs, so a title must be unique there too.
  if (TITLE_LABEL) return labelled(`${base} ${uniqueTag()}`)
  return testInfo.project.name === 'desktop' ? base : `${base} [${testInfo.project.name}]`
}

export async function submitNewRequest(page, title, description) {
  await openNav(page, 'New request')
  await page.getByLabel(/^Title/).fill(title)
  await page.getByLabel(/^Description/).fill(description)
  await page.getByRole('button', { name: 'Submit request' }).click()
}

// Fails on any finding, in the light and the dark theme, and names them.
export async function expectAccessible(page, name) {
  const describe = (item) =>
    `${item.id} (${item.impact}): ${item.help} [${item.nodes.map((node) => node.target.join(' ')).join(', ')}]`
  const original = await page.evaluate(() => document.documentElement.dataset.theme ?? null)
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value
    }, theme)
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    console.log(`axe ${name} (${theme}): ${violations.length} findings`)
    expect(violations.map(describe), `axe violations on ${name}, ${theme} theme`).toEqual([])
  }
  await page.evaluate((value) => {
    if (value) document.documentElement.dataset.theme = value
    else delete document.documentElement.dataset.theme
  }, original)

  // The same pass checks the layout does not scroll sideways at this viewport.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, `horizontal overflow on ${name}`).toBeLessThanOrEqual(0)
}

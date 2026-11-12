// The recorded walkthrough, paced for people to watch: npm --prefix e2e run demo:record
// The captions exist only in this recording. They are added from the test, not by the app.
import { expect, test } from '@playwright/test'
import { AI_LABEL, AWAITING_TEXT, REVIEWED_LABEL, SENSITIVE_TEXT, WIFI_BODY, WIFI_TITLE } from './helpers'

const SAFE_REPLY =
  'Our support team will contact you through a verified channel. Please do not share your password with anyone.'

async function caption(page, text, holdMs = 3500) {
  await page.evaluate((value) => {
    let element = document.getElementById('demo-caption')
    if (!element) {
      element = document.createElement('div')
      element.id = 'demo-caption'
      Object.assign(element.style, {
        position: 'fixed',
        left: '50%',
        bottom: '28px',
        transform: 'translateX(-50%)',
        maxWidth: '86%',
        padding: '12px 22px',
        borderRadius: '8px',
        background: 'rgb(15 28 46 / 94%)',
        color: '#ffffff',
        font: '500 20px "IBM Plex Sans", sans-serif',
        textAlign: 'center',
        boxShadow: '0 6px 24px rgb(0 0 0 / 35%)',
        pointerEvents: 'none',
        zIndex: '9999',
      })
      document.body.append(element)
    }
    element.textContent = value
  }, text)
  await page.waitForTimeout(holdMs)
}

async function type(locator, text) {
  await locator.click()
  await locator.fill('')
  await locator.pressSequentially(text, { delay: 22 })
}

async function signInAs(page, name) {
  await page.getByRole('button', { name: new RegExp(name) }).click()
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
}

async function signOut(page) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to IknowServiceAI' })).toBeVisible()
}

async function submit(page, title, description) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'New request' }).click()
  await expect(page.getByRole('heading', { name: 'New request' })).toBeVisible()
  await type(page.getByLabel(/^Title/), title)
  await type(page.getByLabel(/^Description/), description)
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Submit request' }).click()
}

test('walkthrough', async ({ page }) => {
  test.setTimeout(240_000)

  await page.goto('/app/login')
  await expect(page.getByRole('heading', { name: 'Sign in to IknowServiceAI' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await caption(page, 'IknowServiceAI: an IT service desk where AI drafts and people decide', 4000)
  await caption(page, 'A requester signs in, using a public demo account', 2000)
  await signInAs(page, 'Riley Morgan')
  await caption(page, 'Riley follows their own requests from here', 3000)

  await caption(page, 'First, an ordinary problem', 1500)
  await submit(page, WIFI_TITLE, WIFI_BODY)
  await expect(page.getByText(AI_LABEL)).toBeVisible()
  await caption(page, 'The AI suggests steps from the knowledge base, labeled as AI, to verify', 4500)
  await page.getByRole('heading', { name: 'Sources' }).scrollIntoViewIfNeeded()
  await caption(page, 'Every suggestion cites a real, published article', 3500)

  await caption(page, 'Now something sensitive', 1500)
  await submit(page, SENSITIVE_TEXT, `${SENSITIVE_TEXT}. Please help.`)
  await expect(page.getByText(AWAITING_TEXT)).toBeVisible()
  await caption(page, 'A policy gate in code holds it. Riley sees no AI text at all', 5000)
  await signOut(page)

  await caption(page, 'A support agent takes over', 1500)
  await signInAs(page, 'Alex Chen')
  await expect(page.getByRole('heading', { name: 'Support queue' })).toBeVisible()
  await page.getByRole('button', { name: /^Needs review/ }).click()
  await caption(page, 'Held requests stand out in the queue', 3000)
  await page.getByRole('link', { name: SENSITIVE_TEXT }).click()
  await expect(page.getByTestId('ai-draft')).toBeVisible()
  await caption(page, 'Alex sees why it was held: confidence, risk flags and citations', 5000)

  const reply = page.getByLabel(/^Reply to publish/)
  await reply.scrollIntoViewIfNeeded()
  await caption(page, 'The AI draft sits beside the reply Alex will publish', 3500)
  await type(reply, 'Please send us your password.')
  await type(page.getByLabel(/^Review reason/), 'Sensitive issue; safe wording needed')
  await caption(page, 'What if a reply asks for a password?', 2000)
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(page.getByText(/appears to ask for a password/)).toBeVisible()
  await reply.scrollIntoViewIfNeeded()
  await caption(page, 'Refused by the server, before anything is published', 4000)

  await type(reply, SAFE_REPLY)
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await caption(page, 'A safe reply passes, and Alex confirms exactly what Riley will read', 3500)
  await dialog.getByRole('button', { name: 'Approve and publish' }).click()
  await expect(dialog).toHaveCount(0)
  await page.waitForTimeout(1200)
  await signOut(page)

  await signInAs(page, 'Riley Morgan')
  await page.getByRole('link', { name: SENSITIVE_TEXT }).click()
  await expect(page.getByText(REVIEWED_LABEL)).toBeVisible()
  await caption(page, 'Riley now sees the reply, labeled as reviewed by the support team', 5000)
  await signOut(page)

  await signInAs(page, 'Jordan Reyes')
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Audit' }).click()
  await expect(page.getByRole('table')).toBeVisible()
  await caption(page, 'An admin can trace every step in the append-only audit log', 5500)
  await caption(page, 'AI proposes. Code enforces. People decide.', 3500)
})

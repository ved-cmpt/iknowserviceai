// The Playwright test object for the specs. Off a live run this is the standard one, unchanged.
//
// A live run (e2e/run-live.mjs) shares a public site with its visitors, so it fetches each
// immutable asset once, as a real browser's cache would, and counts every request it sends.
import { appendFileSync } from 'node:fs'
import { test as base } from '@playwright/test'

const REQUEST_LOG = process.env.E2E_REQUEST_LOG
const assetCache = new Map()

export function countRequest(method, url) {
  if (REQUEST_LOG) appendFileSync(REQUEST_LOG, `${method} ${new URL(url).pathname}\n`)
}

export async function prepareContext(context) {
  if (!REQUEST_LOG) return
  await context.route('**/assets/**', async (route) => {
    const url = route.request().url()
    let cached = assetCache.get(url)
    if (!cached) {
      countRequest('GET', url)
      const response = await route.fetch()
      cached = { status: response.status(), headers: response.headers(), body: await response.body() }
      assetCache.set(url, cached)
    }
    await route.fulfill(cached)
  })
  context.on('request', (request) => {
    if (!new URL(request.url()).pathname.startsWith('/assets/')) countRequest(request.method(), request.url())
  })
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await prepareContext(context)
    await use(context)
  },
})

export { expect } from '@playwright/test'

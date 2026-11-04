import { defineConfig, devices } from '@playwright/test'

// Inside this container the app has another host name, so the browser maps it. The page still sees
// the same origin a person's browser would (ADR-037). The production run overrides both values.
const baseURL = process.env.BASE_URL ?? 'http://localhost:5173'
const hostRules = process.env.HOST_RULES ?? 'MAP localhost:5173 frontend:5173'

export default defineConfig({
  testDir: './tests',
  // The tests share one database and the demo accounts, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  // A live run waits between sign-ins, and may meet a cold start (e2e/run-live.mjs).
  timeout: Number(process.env.E2E_TEST_TIMEOUT_MS ?? 60_000),
  expect: { timeout: Number(process.env.E2E_EXPECT_TIMEOUT_MS ?? 15_000) },
  forbidOnly: true,
  reporter: [['list'], ['html', { open: 'never', outputFolder: './playwright-report' }]],
  outputDir: './test-results',
  use: {
    baseURL,
    // Motion off, so contrast is never measured halfway through a transition.
    contextOptions: { reducedMotion: 'reduce' },
    launchOptions: { args: hostRules ? [`--host-resolver-rules=${hostRules}`] : [] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /(screenshots|demo)\.spec\.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      testIgnore: /(screenshots|demo)\.spec\.js/,
      grep: /@mobile/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'demo',
      testMatch: /demo\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        contextOptions: { reducedMotion: 'no-preference' },
        video: { mode: 'on', size: { width: 1280, height: 720 } },
      },
    },
    {
      name: 'screenshots',
      testMatch: /screenshots\.spec\.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
})

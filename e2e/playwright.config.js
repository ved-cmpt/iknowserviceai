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
  timeout: 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: true,
  reporter: [['list'], ['html', { open: 'never', outputFolder: './playwright-report' }]],
  outputDir: './test-results',
  use: {
    baseURL,
    launchOptions: { args: [`--host-resolver-rules=${hostRules}`] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /screenshots\.spec\.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      testIgnore: /screenshots\.spec\.js/,
      grep: /@mobile/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'screenshots',
      testMatch: /screenshots\.spec\.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
})

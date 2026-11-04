import { defineConfig, devices } from '@playwright/test'

// The app is built for http://localhost:5173 calling http://localhost:8000: that is its CORS
// allowlist and its API base URL. Inside this container those services have other host names, so
// the browser maps them. The page still sees the same origins a person's browser would (ADR-037).
const hostRules = 'MAP localhost:5173 frontend:5173,MAP localhost:8000 backend:8000'

export default defineConfig({
  testDir: './tests',
  // The tests share one database and the demo accounts, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: true,
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    baseURL: 'http://localhost:5173',
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

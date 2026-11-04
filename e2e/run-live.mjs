// A paced subset of the browser suite against the live site: npm --prefix e2e run e2e:live
//
//   npm --prefix e2e run e2e:live -- desktop
//   npm --prefix e2e run e2e:live -- mobile
//
// The site is public and shared, and has real limits: 5 sign-ins a minute, and 10 analyses an hour
// per demo account, which visitors share. So this signs in slowly, leaves out tests that use up
// those budgets for little extra evidence, labels what it creates, and counts its requests.
// Run one project at a time, and allow an hour or a redeploy in between.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const BASE_URL = process.env.BASE_URL ?? 'https://iknowserviceai.onrender.com'
const IMAGE = 'iknowserviceai-live-e2e'
const LOG_DIR = join(root, '.cache', 'live-e2e')

const [project = 'desktop', ...extra] = process.argv.slice(2)
if (!['desktop', 'mobile'].includes(project)) {
  console.error('Choose desktop or mobile.')
  process.exit(2)
}

// Left out on purpose. Each is covered by CI against a local database.
const SKIPPED = [
  'the whole journey works with the keyboard alone', // Analysis budget.
  'the second staff save shows the stale message', // Two staff sessions and much polling.
  'the staff page shows changes by others', // Polling.
  'the Refresh button brings a new request', // Adds to the shared queue.
  'a duplicate slug is explained',
  'a wide screen shows the links',
]

function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, stdio: 'inherit' })
  return result.status ?? 1
}

mkdirSync(LOG_DIR, { recursive: true })
const logFile = join(LOG_DIR, `requests-${project}.log`)
rmSync(logFile, { force: true })

if (docker(['build', '-q', '-t', IMAGE, './e2e']) !== 0) process.exit(1)

const status = docker([
  'run', '--rm',
  '-v', `${here}:/e2e`,
  '-v', '/e2e/node_modules',
  '-v', `${LOG_DIR}:/live-log`,
  '-e', 'CI=1',
  '-e', 'PRODUCTION=1',
  '-e', `BASE_URL=${BASE_URL}`,
  '-e', `API_URL=${BASE_URL}/api/v1`,
  '-e', 'HOST_RULES=',
  '-e', 'DEMO_PASSWORD=demo-only-public-2026',
  '-e', 'E2E_TITLE_LABEL=[verification]',
  '-e', 'E2E_LOGIN_GAP_MS=13000',
  '-e', 'E2E_TEST_TIMEOUT_MS=240000',
  '-e', 'E2E_EXPECT_TIMEOUT_MS=30000',
  '-e', `E2E_REQUEST_LOG=/live-log/requests-${project}.log`,
  IMAGE,
  'npx', 'playwright', 'test',
  `--project=${project}`,
  `--grep-invert=${SKIPPED.join('|')}`,
  ...extra,
])

const requests = existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').length : 0
console.log(`\nRequests sent to the live site by the browser suite: ${requests}`)
console.log(`Live E2E (${project}): ${status === 0 ? 'PASSED' : 'FAILED'}`)
process.exit(status === 0 ? 0 : 1)

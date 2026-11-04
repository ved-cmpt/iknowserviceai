// One command for the whole browser suite: npm --prefix e2e run e2e
//
// 1. Starts the stack with the high-limit E2E settings and AI_MODE=mock.
// 2. Resets the demo data, runs the journeys and accessibility checks.
// 3. Resets again and captures the README screenshots, so they hold no test clutter.
// 4. Always restores the normal settings and fresh demo data, then reports the suite's result.
//
// Extra arguments go to Playwright for steps 2, and skip the screenshots:
//   npm --prefix e2e run e2e -- --grep "Stale update"
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const E2E_FILES = ['-f', 'compose.yaml', '-f', 'compose.e2e.yaml']
const extraArgs = process.argv.slice(2)

function run(label, args) {
  console.log(`\n=== ${label}\n$ docker ${args.join(' ')}`)
  const result = spawnSync('docker', args, { cwd: root, stdio: 'inherit' })
  if (result.error) console.error(result.error.message)
  return result.status ?? 1
}

function required(label, args) {
  const status = run(label, args)
  if (status !== 0) throw new Error(`${label} failed with exit code ${status}`)
}

function resetDemoData(files = E2E_FILES) {
  required('Reset demo data', [
    'compose', ...files, 'exec', '-T', 'backend', 'python', '-m', 'app.scripts.reset_demo', '--yes',
  ])
}

function playwright(label, args) {
  return run(label, [
    'compose', ...E2E_FILES, '--profile', 'e2e', 'run', '--rm', 'e2e',
    'npx', 'playwright', 'test', ...args,
  ])
}

mkdirSync(join(root, 'assets', 'screenshots'), { recursive: true })

let exitCode = 1
try {
  required('Start the stack with E2E settings', [
    'compose', ...E2E_FILES, 'up', '-d', '--build', '--wait', 'db', 'backend', 'frontend',
  ])
  required('Apply migrations', [
    'compose', ...E2E_FILES, 'exec', '-T', 'backend', 'alembic', 'upgrade', 'head',
  ])
  required('Build the E2E image', ['compose', ...E2E_FILES, '--profile', 'e2e', 'build', 'e2e'])

  resetDemoData()
  const journeys = playwright(
    'Journeys and accessibility',
    extraArgs.length > 0 ? ['--project=desktop', ...extraArgs] : ['--project=desktop', '--project=mobile'],
  )

  let screenshots = 0
  if (extraArgs.length === 0) {
    resetDemoData()
    screenshots = playwright('Screenshots', ['--project=screenshots'])
  }
  console.log(`\nJourneys exit code: ${journeys}. Screenshots exit code: ${screenshots}.`)
  exitCode = journeys === 0 && screenshots === 0 ? 0 : 1
} catch (error) {
  console.error(error.message)
} finally {
  // Back to the default limits. Recreating also clears the rate limiter's memory.
  const restored = run('Restore normal settings', [
    'compose', 'up', '-d', '--force-recreate', '--wait', 'backend',
  ])
  try {
    resetDemoData([])
  } catch (error) {
    console.error(error.message)
    exitCode = 1
  }
  if (restored !== 0) exitCode = 1
}

console.log(`\nE2E result: ${exitCode === 0 ? 'PASSED' : 'FAILED'}`)
process.exit(exitCode)

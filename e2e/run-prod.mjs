// The browser suite against the production image: npm --prefix e2e run e2e:prod
//
// Uses its own project, volume and throwaway secrets, so the dev stack and its data are untouched.
// Everything is removed afterwards. Extra arguments go to Playwright, in place of the two projects.
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envFile = join(root, '.cache', 'e2e-prod.env')
const FILES = ['--env-file', envFile, '-f', 'compose.prod.yaml', '-f', 'compose.prod.e2e.yaml']
const extraArgs = process.argv.slice(2)

function secret() {
  return randomBytes(24).toString('hex')
}

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

mkdirSync(join(root, '.cache'), { recursive: true })
writeFileSync(
  envFile,
  [
    'POSTGRES_USER=owner',
    `POSTGRES_PASSWORD=${secret()}`,
    'POSTGRES_DB=iknowserviceai',
    `APP_DB_PASSWORD=${secret()}`,
    `JWT_SECRET=${secret()}`,
    'DEMO_PASSWORD=demo-only-public-2026',
    '',
  ].join('\n'),
)

let exitCode = 1
try {
  required('Build and start the production image', [
    'compose', ...FILES, 'up', '-d', '--build', '--wait', 'db', 'app',
  ])
  required('Apply migrations as the owner role', [
    'compose', ...FILES, 'run', '--rm', 'tools', 'alembic', 'upgrade', 'head',
  ])
  required('Reset the demo data, with the explicit production flag', [
    'compose', ...FILES, 'run', '--rm', 'tools',
    'python', '-m', 'app.scripts.reset_demo', '--yes', '--allow-production',
  ])
  required('Build the E2E image', ['compose', ...FILES, '--profile', 'e2e', 'build', 'e2e'])
  exitCode = run('Journeys, accessibility and production checks', [
    'compose', ...FILES, '--profile', 'e2e', 'run', '--rm', 'e2e',
    'npx', 'playwright', 'test',
    ...(extraArgs.length > 0 ? extraArgs : ['--project=desktop', '--project=mobile']),
  ])
} catch (error) {
  console.error(error.message)
} finally {
  run('Remove the production test stack', [
    'compose', ...FILES, '--profile', 'e2e', '--profile', 'tools', 'down', '-v', '--remove-orphans',
  ])
  rmSync(envFile, { force: true })
}

console.log(`\nProduction E2E result: ${exitCode === 0 ? 'PASSED' : 'FAILED'}`)
process.exit(exitCode === 0 ? 0 : 1)

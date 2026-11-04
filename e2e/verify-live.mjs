// Read-mostly HTTP checks against the live site: node e2e/verify-live.mjs
//
// Gentle by design: about 60 sequential requests. Rate limit checks only use invented emails, so
// the published demo accounts are never limited. Prints results only, never a token or cookie.
//
//   persist-create   create one [verification] request and keep a session, before a redeploy
//   persist-check    after the redeploy, confirm that the request and the session survived
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request as httpsRequest } from 'node:https'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = (process.env.BASE_URL ?? 'https://iknowserviceai.onrender.com').replace(/\/$/, '')
const API = `${BASE}/api/v1`
const SAM = 'sam.patel@demo.iknowservice.test'
const CSRF = { 'X-Requested-With': 'iknowserviceai' }
const STATE_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache', 'live-persistence.json')
// Anything here in an error body means an internal detail has leaked.
const LEAK =
  /traceback|File "|\.py\b|sqlalchemy|psycopg|postgres(ql)?:\/\/|neon\.tech|app_user|jwt_secret|gemini_api|database_url/i

const results = []
function check(name, passed, detail = '') {
  results.push(passed)
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
function section(title) {
  console.log(`\n## ${title}`)
}
const tag = randomBytes(4).toString('hex')
const invented = (name) => `verification-${tag}-${name}@example.test`

const login = (email, password, headers = {}) =>
  fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ email, password }),
  })

function refreshCookie(response) {
  const line = response.headers.getSetCookie().find((item) => item.startsWith('iks_refresh='))
  return line ? { line, pair: line.split(';')[0] } : null
}

const refresh = (cookie, headers = CSRF) =>
  fetch(`${API}/auth/refresh`, { method: 'POST', headers: { ...headers, Cookie: cookie } })

async function demoPassword() {
  const config = await (await fetch(`${API}/config`)).json()
  return config.demo_password_hint
}

// Sends the header as separate lines, which fetch cannot do.
function loginWithRepeatedHeader(email, values) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ email, password: 'not-a-real-password' })
    const call = httpsRequest(
      `${API}/auth/login`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-Forwarded-For': values,
        },
      },
      (response) => {
        response.resume()
        response.on('end', () => resolve(response.statusCode))
      },
    )
    call.on('error', reject)
    call.end(body)
  })
}

async function smoke() {
  section('Smoke')
  const health = await fetch(`${BASE}/healthz`)
  check('/healthz is 200', health.status === 200)
  const ready = await fetch(`${BASE}/readyz`)
  const readiness = await ready.json()
  check('/readyz is 200, at head', ready.status === 200 && readiness.migrations === 'at_head')
  const config = await (await fetch(`${API}/config`)).json()
  check('config: demo mode with a banner', config.demo_mode === true && /resets daily/.test(config.demo_banner))
  check('config: the mock agent is announced', /mock agent/.test(config.ai_notice))
  const missing = await fetch(`${API}/no-such-endpoint`)
  const missingBody = await missing.json()
  check('unknown API path is a JSON 404', missing.status === 404 && missingBody.error?.code === 'NOT_FOUND')
  check('/openapi.json is 404', (await fetch(`${BASE}/openapi.json`)).status === 404)
  for (const path of ['/docs', '/redoc']) {
    const text = await (await fetch(`${BASE}${path}`)).text()
    check(`${path} shows no API docs`, !/swagger|redoc\.standalone/i.test(text))
  }
  const deep = await fetch(`${BASE}/requests/00000000-0000-0000-0000-000000000000`)
  check('a deep link serves the app', deep.status === 200 && (await deep.text()).includes('id="root"'))
}

async function headers() {
  section('Headers and TLS')
  for (const path of ['/', '/api/v1/config']) {
    const found = (await fetch(`${BASE}${path}`)).headers
    const csp = found.get('content-security-policy') ?? ''
    check(`${path}: CSP`, csp.includes("default-src 'self'") && csp.includes("script-src 'self'"))
    check(`${path}: frame-ancestors none`, csp.includes("frame-ancestors 'none'"))
    check(`${path}: X-Frame-Options`, found.get('x-frame-options') === 'DENY')
    check(`${path}: nosniff`, found.get('x-content-type-options') === 'nosniff')
    check(`${path}: Referrer-Policy`, found.get('referrer-policy') === 'strict-origin-when-cross-origin')
    check(`${path}: Permissions-Policy`, (found.get('permissions-policy') ?? '').includes('camera=()'))
    const hsts = found.get('strict-transport-security') ?? ''
    check(`${path}: HSTS`, /max-age=(\d+)/.test(hsts) && Number(/max-age=(\d+)/.exec(hsts)[1]) >= 31536000, hsts)
  }
  const plain = await fetch(BASE.replace('https://', 'http://') + '/healthz', { redirect: 'manual' })
  check(
    'HTTP redirects to HTTPS',
    [301, 302, 307, 308].includes(plain.status) && (plain.headers.get('location') ?? '').startsWith('https://'),
    `${plain.status}`,
  )
}

async function cookies() {
  section('Cookies and sessions')
  const password = await demoPassword()
  const first = await login(SAM, password)
  check('sign-in works', first.status === 200)
  const { line, pair: original } = refreshCookie(first)
  const attributes = line.split(';').slice(1).map((part) => part.trim().toLowerCase())
  check('cookie: HttpOnly', attributes.includes('httponly'))
  check('cookie: Secure', attributes.includes('secure'))
  check('cookie: SameSite=Strict', attributes.includes('samesite=strict'))
  check('cookie: Path=/api/v1/auth', attributes.includes('path=/api/v1/auth'))
  check('sign-in response is no-store', first.headers.get('cache-control') === 'no-store')

  check('refresh without the required header is 403', (await refresh(original, {})).status === 403)
  const rotated = await refresh(original)
  const next = refreshCookie(rotated)
  check('refresh rotates the token', rotated.status === 200 && next && next.pair !== original)
  const replay = await refresh(original)
  check('replaying the old token is 401', replay.status === 401)
  check('reuse revokes the whole sign-in', (await refresh(next.pair)).status === 401)

  const second = await login(SAM, password)
  const { pair: signedIn } = refreshCookie(second)
  const { access_token: token } = await second.json()
  const out = await fetch(`${API}/auth/logout`, { method: 'POST', headers: { ...CSRF, Cookie: signedIn } })
  check('sign-out is 204, and clears the cookie', out.status === 204 && /max-age=0/i.test(refreshCookie(out)?.line ?? ''))
  check('sign-out revokes the refresh token', (await refresh(signedIn)).status === 401)
  const stale = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
  console.log(`INFO  an access token after sign-out gets ${stale.status}. ADR-058 documents up to 10 minutes`)
}

async function limiter() {
  section('Rate limiter and client address')
  const plain = invented('plain')
  const statuses = []
  for (let attempt = 0; attempt < 5; attempt += 1) {
    statuses.push((await login(plain, 'not-a-real-password')).status)
  }
  check('five attempts on an invented email are 401', statuses.every((status) => status === 401), statuses.join(','))
  const limited = await login(plain, 'not-a-real-password')
  const wait = Number(limited.headers.get('retry-after'))
  check('the sixth is 429, with Retry-After', limited.status === 429 && wait > 0 && wait <= 60, `${limited.status}, ${wait}s`)

  check('another email is not limited', (await login(invented('other'), 'not-a-real-password')).status === 401)
  check('another route is not limited', (await fetch(`${API}/config`)).status === 200)

  const forged = { 'X-Forwarded-For': '203.0.113.7' }
  check('one forged address does not bypass it', (await login(plain, 'x', forged)).status === 429)
  const chain = { 'X-Forwarded-For': '203.0.113.8, 198.51.100.9, 192.0.2.10' }
  check('a forged chain does not bypass it', (await login(plain, 'x', chain)).status === 429)
  check(
    'a repeated forged header does not bypass it',
    (await loginWithRepeatedHeader(plain, ['203.0.113.11', '198.51.100.12'])) === 429,
  )

  const rotating = invented('rotating')
  const spoofed = []
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const value = { 'X-Forwarded-For': `203.0.113.${20 + attempt}` }
    spoofed.push((await login(rotating, 'not-a-real-password', value)).status)
  }
  check(
    'a new forged address each time still reaches the limit on the sixth',
    spoofed.slice(0, 5).every((status) => status === 401) && spoofed[5] === 429,
    spoofed.join(','),
  )

  console.log(`INFO  waiting ${wait + 1}s for the window to pass`)
  await new Promise((resolve) => setTimeout(resolve, (wait + 1) * 1000))
  check('the limit lifts when the window passes', (await login(plain, 'not-a-real-password')).status === 401)
}

async function errors() {
  section('Error responses hold no internal detail')
  const json = { 'Content-Type': 'application/json' }
  const signedIn = await login(SAM, await demoPassword())
  const { access_token: token } = await signedIn.json()
  const bearer = { Authorization: `Bearer ${token}` }
  const cases = [
    ['malformed JSON', `${API}/auth/login`, { method: 'POST', headers: json, body: '{"email":' }],
    ['wrong field types', `${API}/auth/login`, { method: 'POST', headers: json, body: '{"email":1,"password":[]}' }],
    ['no token', `${API}/requests`, {}],
    ['garbage token', `${API}/requests`, { headers: { Authorization: 'Bearer not.a.token' } }],
    ['a malformed ID', `${API}/requests/not-a-uuid`, { headers: bearer }],
    ['an unknown ID', `${API}/requests/00000000-0000-0000-0000-000000000000`, { headers: bearer }],
    ['a wrong method', `${API}/auth/login`, { method: 'DELETE' }],
    ['an invalid query', `${API}/requests?limit=not-a-number`, { headers: bearer }],
    ['a null byte', `${API}/requests?q=%00`, { headers: bearer }],
  ]
  for (const [name, url, options] of cases) {
    const response = await fetch(url, options)
    const body = await response.text()
    check(`${name}: ${response.status}, clean`, response.status < 500 && !LEAK.test(body))
  }
  const out = refreshCookie(signedIn).pair
  await fetch(`${API}/auth/logout`, { method: 'POST', headers: { ...CSRF, Cookie: out } })
}

async function persistCreate() {
  section('Persistence: before the redeploy')
  const signedIn = await login(SAM, await demoPassword())
  const { access_token: token } = await signedIn.json()
  const created = await fetch(`${API}/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: `[verification] Persistence across a redeploy ${tag}`,
      description: 'A verification record. It is removed by the next demo reset.',
    }),
  })
  const request = await created.json()
  check('created one [verification] request', created.status === 201 || created.status === 200)
  mkdirSync(dirname(STATE_FILE), { recursive: true })
  writeFileSync(
    STATE_FILE,
    JSON.stringify({ id: request.id, title: request.title, token, cookie: refreshCookie(signedIn).pair }),
  )
}

async function persistCheck() {
  section('Persistence: after the redeploy')
  const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  const rotated = await refresh(state.cookie)
  check('the session survives: the old refresh token still works', rotated.status === 200)
  const { access_token: token } = await rotated.json()
  const found = await fetch(`${API}/requests/${state.id}`, { headers: { Authorization: `Bearer ${token}` } })
  const body = await found.json()
  check('the [verification] request still exists', found.status === 200 && body.title === state.title)
  const old = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${state.token}` } })
  console.log(`INFO  the access token from before the redeploy gets ${old.status}`)
  await fetch(`${API}/auth/logout`, {
    method: 'POST',
    headers: { ...CSRF, Cookie: refreshCookie(rotated).pair },
  })
  rmSync(STATE_FILE, { force: true })
}

const command = process.argv[2]
if (command === 'persist-create') await persistCreate()
else if (command === 'persist-check') await persistCheck()
else {
  await smoke()
  await headers()
  await cookies()
  await limiter()
  await errors()
}

const failed = results.filter((passed) => !passed).length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)

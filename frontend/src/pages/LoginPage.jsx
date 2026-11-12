import { useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { friendlyMessage } from '../api/errors'
import { useApiData } from '../api/useApiData'
import { useAuth } from '../auth/authContext'
import { safeNext } from '../auth/deepLink'
import { homeFor } from '../auth/roles'
import ApiStatus from '../components/ApiStatus'
import Banner from '../components/Banner'
import Button from '../components/Button'
import DemoBanner from '../components/DemoBanner'
import FormField from '../components/FormField'
import Avatar from '../components/Avatar'
import Icon, { LogoMark } from '../components/icons'
import ThemeToggle from '../components/ThemeToggle'

const DEMO_ACCOUNTS = [
  {
    key: 'riley',
    email: 'riley.morgan@demo.iknowservice.test',
    name: 'Riley Morgan',
    role: 'Requester',
    tryThis: 'Report a problem and get a cited suggestion.',
  },
  {
    key: 'sam',
    email: 'sam.patel@demo.iknowservice.test',
    name: 'Sam Patel',
    role: 'Requester',
    tryThis: "Sam can't see Riley's requests. Try it.",
  },
  {
    key: 'alex',
    email: 'alex.chen@demo.iknowservice.test',
    name: 'Alex Chen',
    role: 'Support agent',
    tryThis: 'Review a held draft, and publish a safe reply.',
  },
  {
    key: 'jordan',
    email: 'jordan.reyes@demo.iknowservice.test',
    name: 'Jordan Reyes',
    role: 'Admin',
    tryThis: 'Publish an article, and read the audit log.',
  },
]

export default function LoginPage() {
  const { user, login, sessionExpired } = useAuth()
  const location = useLocation()
  // The server decides this at run time, so one image can serve demo and non-demo sites (ADR-046).
  const { data: config } = useApiData('/config')
  const demoMode = config?.demo_mode === true
  // A link from the website names a demo person and where to go after signing in.
  const params = new URLSearchParams(location.search)
  const suggested = DEMO_ACCOUNTS.find((account) => account.key === params.get('as'))
  const next = safeNext(params.get('next'))
  const [email, setEmail] = useState(suggested?.email ?? '')
  // null means "not typed yet": a suggested person then gets the public demo password.
  const [typedPassword, setPassword] = useState(suggested ? null : '')
  const password = typedPassword ?? (demoMode ? (config.demo_password_hint ?? '') : '')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const submitRef = useRef(null)

  // Signing in re-renders this page with a user, which redirects from here.
  if (user) return <Navigate to={location.state?.from ?? next ?? homeFor(user)} replace />

  async function handleSubmit(event) {
    event.preventDefault()
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await login(email.trim(), password)
    } catch (cause) {
      setError(cause.status === 401 ? 'Incorrect email or password.' : friendlyMessage(cause))
      setSubmitting(false)
    }
  }

  function pickAccount(account) {
    setEmail(account.email)
    setPassword(config.demo_password_hint ?? '')
    setError(null)
    submitRef.current?.focus()
  }

  const picked = DEMO_ACCOUNTS.find((account) => account.email === email.trim().toLowerCase())

  return (
    <>
      <DemoBanner />
      <main className="login">
        <div className="login-glow" aria-hidden="true" />
        <div className="login-top">
          <a className="brand" href="/" aria-label="IknowServiceAI website">
            <LogoMark size={26} />
            <span className="brand-name">
              IknowService<span className="gradient-text">AI</span>
            </span>
          </a>
          <ThemeToggle />
        </div>
        <div className="login-card">
          <h1>Sign in to IknowServiceAI</h1>
          <p className="meta">
            {demoMode ? 'Use your account, or pick a demo account below.' : 'Use your account to continue.'}
          </p>
          {sessionExpired && (
            <Banner tone="warning" role="status">
              Your session ended. Sign in again to continue.
            </Banner>
          )}
          {suggested && demoMode && (
            <Banner tone="info" icon="userCheck">
              Signing in as {suggested.name}, {suggested.role.toLowerCase()}, for the demo you opened on the website.
            </Banner>
          )}
          <form onSubmit={handleSubmit} noValidate>
            {error && (
              <div role="alert" className="banner banner-danger">
                {error}
              </div>
            )}
            <FormField label="Email">
              {(field) => (
                <input
                  {...field}
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </FormField>
            <FormField
              label="Password"
              hint={
                demoMode
                  ? config.demo_password_hint
                    ? `Public demo password: ${config.demo_password_hint}`
                    : 'The public demo password is in the README.'
                  : undefined
              }
            >
              {(field) => (
                <input
                  {...field}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
            </FormField>
            <Button type="submit" busy={submitting} ref={submitRef}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="login-status">
            <ApiStatus />
          </p>
        </div>
        {demoMode && (
          <section className="login-personas" aria-label="Demo account">
            <h2>Try a demo account</h2>
            <p>Fictional people with shared, synthetic data that resets daily. Each card fills in the form.</p>
            <ul className="demo-accounts">
              {DEMO_ACCOUNTS.map((account) => (
                <li key={account.email}>
                  <button
                    type="button"
                    className="demo-card"
                    aria-pressed={picked?.email === account.email}
                    onClick={() => pickAccount(account)}
                  >
                    <span className="demo-card-top">
                      <Avatar name={account.name} />
                      <span>
                        <span className="demo-card-name">{account.name}</span>
                        <span className="demo-card-role">{account.role}</span>
                      </span>
                    </span>
                    {account.tryThis}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="login-back">
          <a href="/">
            <Icon name="arrowLeft" size={14} /> Back to the website
          </a>
        </p>
      </main>
    </>
  )
}

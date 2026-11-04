import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { friendlyMessage } from '../api/errors'
import { useApiData } from '../api/useApiData'
import { useAuth } from '../auth/authContext'
import { homeFor } from '../auth/roles'
import ApiStatus from '../components/ApiStatus'
import Banner from '../components/Banner'
import Button from '../components/Button'
import Card from '../components/Card'
import DemoBanner from '../components/DemoBanner'
import FormField from '../components/FormField'

const DEMO_ACCOUNTS = [
  { email: 'riley.morgan@demo.iknowservice.test', label: 'Riley Morgan (requester)' },
  { email: 'sam.patel@demo.iknowservice.test', label: 'Sam Patel (requester)' },
  { email: 'alex.chen@demo.iknowservice.test', label: 'Alex Chen (support agent)' },
  { email: 'jordan.reyes@demo.iknowservice.test', label: 'Jordan Reyes (admin)' },
]

export default function LoginPage() {
  const { user, login, sessionExpired } = useAuth()
  const location = useLocation()
  // The server decides this at run time, so one image can serve demo and non-demo sites (ADR-046).
  const { data: config } = useApiData('/config')
  const demoMode = config?.demo_mode === true
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Signing in re-renders this page with a user, which redirects from here.
  if (user) return <Navigate to={location.state?.from ?? homeFor(user)} replace />

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

  return (
    <main className="page page-narrow">
      <DemoBanner />
      <h1>Sign in to IknowServiceAI</h1>
      {sessionExpired && (
        <Banner tone="warning" role="status">
          Your session ended. Sign in again to continue.
        </Banner>
      )}
      <Card as="div">
        <form onSubmit={handleSubmit} noValidate>
          {error && (
            <div role="alert" className="banner banner-danger">
              {error}
            </div>
          )}
          {demoMode && (
            <FormField label="Demo account">
              {(field) => (
                <select
                  {...field}
                  value={DEMO_ACCOUNTS.some((account) => account.email === email) ? email : ''}
                  onChange={(event) => setEmail(event.target.value)}
                >
                  <option value="">Choose an account…</option>
                  {DEMO_ACCOUNTS.map((account) => (
                    <option key={account.email} value={account.email}>
                      {account.label}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
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
          <Button type="submit" busy={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
      <p className="meta">
        <ApiStatus />
      </p>
    </main>
  )
}

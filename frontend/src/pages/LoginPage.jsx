import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import ApiStatus from '../components/ApiStatus'

const DEMO_ACCOUNTS = [
  { email: 'riley.morgan@demo.iknowservice.test', label: 'Riley Morgan (requester)' },
  { email: 'sam.patel@demo.iknowservice.test', label: 'Sam Patel (requester)' },
  { email: 'alex.chen@demo.iknowservice.test', label: 'Alex Chen (support agent)' },
  { email: 'jordan.reyes@demo.iknowservice.test', label: 'Jordan Reyes (admin)' },
]

const showDemoHint = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_HINT === 'true'
const demoPassword = import.meta.env.VITE_DEMO_PASSWORD_HINT

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const destination = location.state?.from ?? '/dashboard'

  if (user) return <Navigate to={destination} replace />

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
      navigate(destination, { replace: true })
    } catch (cause) {
      setError(
        cause.status === 401 ? 'Incorrect email or password.' : cause.message,
      )
      setSubmitting(false)
    }
  }

  return (
    <main className="page narrow">
      <h1>Sign in to IknowServiceAI</h1>
      <form className="card" onSubmit={handleSubmit} noValidate>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        <label className="field">
          <span>Demo account</span>
          <select
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
        </label>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={showDemoHint ? 'password-hint' : undefined}
          />
        </label>
        {showDemoHint && (
          <p id="password-hint" className="field-hint">
            {demoPassword
              ? `Public demo password: ${demoPassword}`
              : 'The public demo password is in the README.'}
          </p>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <ApiStatus />
    </main>
  )
}

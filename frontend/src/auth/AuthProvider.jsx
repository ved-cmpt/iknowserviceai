import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch, setAccessToken, setUnauthorizedHandler } from '../api/client'
import { AuthContext } from './authContext'

// Auth state is memory-only by design: reloading the page requires signing in again (ADR-009).
export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // After a deliberate sign-out, the next person should not land on the previous user's page.
  const [signedOut, setSignedOut] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)

  const clearSession = useCallback(() => {
    setAccessToken(null)
    setUser(null)
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setSessionExpired(false)
    setSignedOut(true)
  }, [clearSession])

  const login = useCallback(async (email, password) => {
    const result = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    setAccessToken(result.access_token)
    setUser(result.user)
    setSignedOut(false)
    setSessionExpired(false)
    return result.user
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession()
      setSessionExpired(true)
    })
    return () => setUnauthorizedHandler(null)
  }, [clearSession])

  const value = useMemo(
    () => ({ user, signedOut, sessionExpired, login, logout }),
    [user, signedOut, sessionExpired, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

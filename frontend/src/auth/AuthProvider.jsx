import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch, endSession, refreshSession, setAccessToken, setUnauthorizedHandler } from '../api/client'
import { AuthContext } from './authContext'

// The access token stays in memory. A reload restores the session through the refresh cookie, which
// JavaScript cannot read (ADR-045).
export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [restoring, setRestoring] = useState(true)
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
    endSession()
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

  useEffect(() => {
    let active = true
    refreshSession().then((session) => {
      if (!active) return
      // Someone who signed in while this ran keeps that session.
      if (session) setUser((current) => current ?? session.user)
      setRestoring(false)
    })
    return () => {
      active = false
    }
  }, [])

  const value = useMemo(
    () => ({ user, restoring, signedOut, sessionExpired, login, logout }),
    [user, restoring, signedOut, sessionExpired, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

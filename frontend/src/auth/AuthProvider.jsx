import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch, setAccessToken, setUnauthorizedHandler } from '../api/client'
import { AuthContext } from './authContext'

// Auth state is memory-only by design: reloading the page requires signing in again (ADR-009).
export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)

  const logout = useCallback(() => {
    setAccessToken(null)
    setUser(null)
  }, [])

  const login = useCallback(async (email, password) => {
    const result = await apiFetch('/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    setAccessToken(result.access_token)
    setUser(result.user)
    return result.user
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(null)
  }, [logout])

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

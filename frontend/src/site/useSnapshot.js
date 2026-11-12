import { useEffect, useState } from 'react'

export const SNAPSHOT_URL = '/data/landing-snapshot.json'

let cached = null

// The website's data: real mock-mode runs recorded by scripts/landing_snapshot.py (ADR-064). A
// static file on this origin, read once. It is not an API call, and needs no session.
export function useSnapshot() {
  const [state, setState] = useState(() => (cached ? { data: cached, error: null } : { data: null, error: null }))

  useEffect(() => {
    if (cached) return undefined
    let active = true
    fetch(SNAPSHOT_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`The demo data could not be loaded (${response.status}).`)
        return response.json()
      })
      .then((data) => {
        cached = data
        if (active) setState({ data, error: null })
      })
      .catch((error) => active && setState({ data: null, error }))
    return () => {
      active = false
    }
  }, [])

  return state
}

export function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(() => window.matchMedia?.(query).matches ?? false)
  useEffect(() => {
    const media = window.matchMedia?.(query)
    if (!media) return undefined
    const update = () => setReduced(media.matches)
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])
  return reduced
}

export function percent(value, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`
}

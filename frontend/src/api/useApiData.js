import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from './client'

// Loads JSON from an API path. Loading is derived: a result only counts if it belongs to the
// current path and attempt, so a slow earlier response can never overwrite a newer one.
export function useApiData(path) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState({ key: null, data: null, error: null })
  const key = `${path}#${attempt}`

  useEffect(() => {
    let active = true
    apiFetch(path)
      .then((data) => active && setResult({ key, data, error: null }))
      .catch((error) => active && setResult({ key, data: null, error }))
    return () => {
      active = false
    }
  }, [path, key])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  const settled = result.key === key

  return {
    loading: !settled,
    data: settled ? result.data : null,
    error: settled ? result.error : null,
    retry,
  }
}

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from './client'

// Loads JSON from an API path. A result only counts if it belongs to the current path and
// attempt, so a slow earlier response can never overwrite a newer one.
//
// Reloading the same path keeps the current data on screen (`loading` is true and `data` stays),
// so forms on the page are not unmounted and typed text survives a reload.
export function useApiData(path) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState({ path: null, attempt: null, data: null, error: null })

  useEffect(() => {
    let active = true
    apiFetch(path)
      .then((data) => active && setResult({ path, attempt, data, error: null }))
      .catch((error) =>
        // A failed reload keeps showing the last good data for this path, alongside the error.
        active &&
        setResult((previous) => ({
          path,
          attempt,
          data: previous.path === path ? previous.data : null,
          error,
        })),
      )
    return () => {
      active = false
    }
  }, [path, attempt])

  const reload = useCallback(() => setAttempt((value) => value + 1), [])

  // Replaces the data with a newer copy, such as the body of a successful update.
  const setData = useCallback(
    (data) => setResult({ path, attempt, data, error: null }),
    [path, attempt],
  )

  const samePath = result.path === path
  const settled = samePath && result.attempt === attempt

  return {
    loading: !settled,
    data: samePath ? result.data : null,
    error: settled ? result.error : null,
    retry: reload,
    reload,
    setData,
  }
}

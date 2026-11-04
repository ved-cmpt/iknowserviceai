import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

// Keeps a list page's filters and page in the URL, so the back button and links restore them.
// Changing any filter returns to the first page.
export function useListParams(keys, defaults = {}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const serialized = searchParams.toString()

  const values = useMemo(() => {
    const current = new URLSearchParams(serialized)
    const result = {}
    for (const key of keys) result[key] = current.get(key) ?? defaults[key] ?? ''
    const offset = Number(current.get('offset'))
    result.offset = Number.isInteger(offset) && offset > 0 ? offset : 0
    return result
    // keys and defaults are fixed for each page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized])

  const update = useCallback(
    (changes) => {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous)
        if (!('offset' in changes)) next.delete('offset')
        for (const [key, value] of Object.entries(changes)) {
          if (value === '' || value === null || value === undefined || value === 0) next.delete(key)
          else next.set(key, String(value))
        }
        return next
      })
    },
    [setSearchParams],
  )

  return [values, update]
}

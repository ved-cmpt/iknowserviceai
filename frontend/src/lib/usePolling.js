import { useCallback, useEffect, useRef, useState } from 'react'

// Calls `callback` every `intervalMs` while `enabled`. It pauses while the tab is hidden, and
// coming back calls it once and starts a fresh time window. With `maxDurationMs`, it stops when
// the window ends and reports `expired`, until `restart` is called.
//
// The caller decides whether a request is already in flight, so ticks never stack up.
export function usePolling(callback, { enabled, intervalMs, maxDurationMs = null }) {
  const latest = useRef(callback)
  const [expired, setExpired] = useState(false)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    latest.current = callback
  })

  useEffect(() => {
    if (!enabled) return undefined
    let timer = null
    let deadline = maxDurationMs === null ? null : Date.now() + maxDurationMs

    const stop = () => {
      clearInterval(timer)
      timer = null
    }
    const tick = () => {
      if (deadline !== null && Date.now() >= deadline) {
        stop()
        setExpired(true)
        return
      }
      latest.current()
    }
    const start = () => {
      if (timer === null) timer = setInterval(tick, intervalMs)
    }
    const onVisibilityChange = () => {
      if (document.hidden) {
        stop()
        return
      }
      deadline = maxDurationMs === null ? null : Date.now() + maxDurationMs
      setExpired(false)
      latest.current()
      start()
    }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [enabled, intervalMs, maxDurationMs, generation])

  const restart = useCallback(() => {
    setExpired(false)
    setGeneration((value) => value + 1)
  }, [])

  return { expired: enabled && expired, restart }
}

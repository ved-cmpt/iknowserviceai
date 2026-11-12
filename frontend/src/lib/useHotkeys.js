import { useEffect, useRef } from 'react'

const SEQUENCE_MS = 1200
// Shared by every instance, so a page's single-key shortcut never steals the second key of a
// shell sequence such as "g k".
let prefixAt = 0

// Typing in a field must never trigger a shortcut.
export function isTyping(target) {
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'))
}

// Single keys and two-key sequences such as "g d". `bindings` maps a key or sequence to a handler.
// Modifier shortcuts, such as Ctrl+K, are handled where they are needed.
export function useHotkeys(bindings, { enabled = true } = {}) {
  const latest = useRef(bindings)
  const pending = useRef(null)

  useEffect(() => {
    latest.current = bindings
  })

  useEffect(() => {
    if (!enabled) return undefined
    let timer = null
    function onKeyDown(event) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      if (isTyping(event.target) || document.querySelector('[role="dialog"][aria-modal="true"]')) return
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      const sequence = pending.current ? `${pending.current} ${key}` : null
      if (sequence && latest.current[sequence]) {
        event.preventDefault()
        pending.current = null
        prefixAt = 0
        latest.current[sequence]()
        return
      }
      if (Object.keys(latest.current).some((name) => name.startsWith(`${key} `))) {
        pending.current = key
        prefixAt = Date.now()
        clearTimeout(timer)
        timer = setTimeout(() => {
          pending.current = null
        }, SEQUENCE_MS)
        return
      }
      pending.current = null
      if (Date.now() - prefixAt < SEQUENCE_MS) return
      const handler = latest.current[event.key === '?' ? '?' : key]
      if (handler) {
        event.preventDefault()
        handler()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      clearTimeout(timer)
    }
  }, [enabled])
}

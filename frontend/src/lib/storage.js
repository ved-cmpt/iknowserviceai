// Small per-device preferences. Storage can be blocked, for example in a private window, so every
// read and write is guarded, and the app works the same without it.
export function readFlag(key) {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

export function writeFlag(key, value) {
  try {
    if (value) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    // Not remembered, but the choice still applies to this page.
  }
}

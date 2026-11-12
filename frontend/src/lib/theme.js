// The chosen theme. public/theme-init.js applies it before the first paint. With no choice, the
// dark reference theme applies (ADR-062).
const KEY = 'iks-theme'

function stored() {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null // Storage can be blocked, for example in a private window.
  }
}

export function currentTheme() {
  return document.documentElement.dataset.theme ?? stored() ?? 'dark'
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // The choice still applies to this page. It just is not remembered.
  }
}

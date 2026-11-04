// Applies a remembered theme before the first paint. A separate file, because the
// Content-Security-Policy allows no inline scripts. Without a stored choice, CSS follows the system.
try {
  var theme = localStorage.getItem('iks-theme')
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
} catch {
  // Storage can be blocked, for example in a private window. The system preference still applies.
}

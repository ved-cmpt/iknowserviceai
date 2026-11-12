// Applies a remembered theme before the first paint. A separate file, because the
// Content-Security-Policy allows no inline scripts. Dark is the default (ADR-062).
try {
  var theme = localStorage.getItem('iks-theme')
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
} catch {
  // Storage can be blocked, for example in a private window. The dark default still applies.
}

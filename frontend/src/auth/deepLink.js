// The website's "See it in the app" links: /app/login?as=riley&next=/requests/new.
// `next` must be a path inside the app, so a crafted link cannot send anyone to another site.
export function safeNext(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\s]/.test(value)) return null
  const inside = value.replace(/^\/app(?=\/|$)/, '') || '/'
  return inside.startsWith('/login') ? null : inside
}

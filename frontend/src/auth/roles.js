// Convenience only. The backend enforces every permission on every request.
export const STAFF_ROLES = ['AGENT', 'ADMIN']
export const ADMIN_ROLES = ['ADMIN']

export function isStaff(user) {
  return STAFF_ROLES.includes(user?.role)
}

export function isAdmin(user) {
  return user?.role === 'ADMIN'
}

export function homeFor(user) {
  if (!user) return '/login'
  return isStaff(user) ? '/support' : '/dashboard'
}

export function homeLabel(user) {
  if (!user) return 'Go to sign in'
  return isStaff(user) ? 'Go to the support queue' : 'Go to my requests'
}

export function navItemsFor(user) {
  const items = [
    { to: '/dashboard', label: 'My requests' },
    { to: '/requests/new', label: 'New request' },
    { to: '/knowledge', label: 'Knowledge' },
  ]
  if (isStaff(user)) items.push({ to: '/support', label: 'Support queue' })
  if (isAdmin(user)) {
    items.push({ to: '/admin/knowledge', label: 'Knowledge admin' })
    items.push({ to: '/admin/audit', label: 'Audit' })
  }
  return items
}

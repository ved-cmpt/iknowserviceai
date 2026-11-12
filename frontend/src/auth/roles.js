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

// The sidebar's sections, in order. Each item has a keyboard shortcut ("g" then the key).
export function navSectionsFor(user) {
  const sections = [
    {
      label: 'Requests',
      items: [
        { to: '/dashboard', label: 'My requests', icon: 'dashboard', key: 'd' },
        { to: '/requests/new', label: 'New request', icon: 'newRequest', key: 'n' },
      ],
    },
    { label: 'Help', items: [{ to: '/knowledge', label: 'Knowledge', icon: 'book', key: 'k' }] },
  ]
  if (isStaff(user)) {
    sections.push({
      label: 'Support',
      items: [{ to: '/support', label: 'Support queue', icon: 'inbox', key: 's' }],
    })
  }
  if (isAdmin(user)) {
    sections.push({
      label: 'Admin',
      items: [
        { to: '/admin/knowledge', label: 'Knowledge admin', icon: 'library', key: 'e' },
        { to: '/admin/audit', label: 'Audit', icon: 'audit', key: 'a' },
      ],
    })
  }
  return sections
}

export function navItemsFor(user) {
  return navSectionsFor(user).flatMap((section) => section.items)
}

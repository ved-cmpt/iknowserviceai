function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')
}

// Decorative: the person's name is always written beside it.
export default function Avatar({ name }) {
  return (
    <span className={name ? 'avatar' : 'avatar avatar-empty'} aria-hidden="true">
      {name ? initials(name).toUpperCase() : '–'}
    </span>
  )
}

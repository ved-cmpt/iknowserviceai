import { Link, useLocation } from 'react-router-dom'
import Icon from './icons'

// Where this page sits, from its path alone. The page's own heading names the item itself.
function trail(pathname) {
  const parts = pathname.split('/').filter(Boolean)
  const [first, second, third] = parts
  switch (first) {
    case 'dashboard':
      return [['My requests']]
    case 'requests':
      return [['My requests', '/dashboard'], [second === 'new' ? 'New request' : 'Request']]
    case 'knowledge':
      return second ? [['Knowledge', '/knowledge'], ['Article']] : [['Knowledge']]
    case 'support':
      return second ? [['Support queue', '/support'], ['Request']] : [['Support queue']]
    case 'admin':
      if (second === 'audit') return [['Audit log']]
      if (third === 'new' || second === 'knowledge') {
        if (!third) return [['Knowledge admin']]
        return [['Knowledge admin', '/admin/knowledge'], [third === 'new' ? 'New article' : 'Edit article']]
      }
      return [['Admin']]
    default:
      return [['Page']]
  }
}

export default function Breadcrumbs() {
  const { pathname } = useLocation()
  const items = trail(pathname)
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol>
        {items.map(([label, to], index) => {
          const last = index === items.length - 1
          return (
            <li key={label}>
              {to && !last ? <Link to={to}>{label}</Link> : <span aria-current={last ? 'page' : undefined}>{label}</span>}
              {!last && <Icon name="chevronRight" size={14} className="breadcrumb-sep" />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

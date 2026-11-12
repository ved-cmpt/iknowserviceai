import { useAuth } from '../auth/authContext'
import { homeFor, homeLabel } from '../auth/roles'
import { ButtonLink } from '../components/Button'
import Icon from '../components/icons'

export default function NotFoundPage({ message = 'This page does not exist, or you do not have access to it.' }) {
  const { user } = useAuth()
  return (
    <div className="status-page">
      <span className="status-code">404</span>
      <h1>Page not found</h1>
      <p className="page-lede">{message}</p>
      <ButtonLink to={homeFor(user)}>
        <Icon name="arrowLeft" />
        {homeLabel(user)}
      </ButtonLink>
    </div>
  )
}

import { useAuth } from '../auth/authContext'
import { homeFor, homeLabel } from '../auth/roles'
import { ButtonLink } from '../components/Button'
import Icon from '../components/icons'

export default function ForbiddenPage() {
  const { user } = useAuth()
  return (
    <div className="status-page">
      <span className="status-code">403</span>
      <h1>You don&apos;t have access</h1>
      <p className="page-lede">Your account does not have permission to open this page. The server checks this too.</p>
      <ButtonLink to={homeFor(user)}>
        <Icon name="arrowLeft" />
        {homeLabel(user)}
      </ButtonLink>
    </div>
  )
}

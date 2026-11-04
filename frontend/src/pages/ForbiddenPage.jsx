import { useAuth } from '../auth/authContext'
import { homeFor, homeLabel } from '../auth/roles'
import { ButtonLink } from '../components/Button'

export default function ForbiddenPage() {
  const { user } = useAuth()
  return (
    <>
      <h1>You don&apos;t have access</h1>
      <p>Your account does not have permission to open this page.</p>
      <ButtonLink to={homeFor(user)}>{homeLabel(user)}</ButtonLink>
    </>
  )
}

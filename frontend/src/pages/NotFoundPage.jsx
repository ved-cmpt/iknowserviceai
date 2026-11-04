import { useAuth } from '../auth/authContext'
import { homeFor, homeLabel } from '../auth/roles'
import { ButtonLink } from '../components/Button'

export default function NotFoundPage({ message = 'This page does not exist, or you do not have access to it.' }) {
  const { user } = useAuth()
  return (
    <>
      <h1>Page not found</h1>
      <p>{message}</p>
      <ButtonLink to={homeFor(user)}>{homeLabel(user)}</ButtonLink>
    </>
  )
}

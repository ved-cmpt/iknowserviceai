import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { setAccessToken } from '../api/client'
import App from '../App'
import { AuthContext } from '../auth/authContext'
import AuthProvider from '../auth/AuthProvider'

// Full app with the real AuthProvider, starting signed out.
export function renderApp(route = '/') {
  setAccessToken(null)
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

// Full app with a fixed signed-in user.
export function renderSignedIn(route, user = DEFAULT_USER) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthContext.Provider value={{ user, login: async () => user, logout: () => {} }}>
        <App />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

export const DEFAULT_USER = {
  id: 'u1',
  email: 'riley.morgan@demo.iknowservice.test',
  display_name: 'Riley Morgan',
  role: 'USER',
}

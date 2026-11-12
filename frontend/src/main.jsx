import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import AuthProvider from './auth/AuthProvider'
import { APP_BASE, legacyRedirect } from './lib/legacyPaths'
import './styles/index.css'

// An old link, such as /requests/abc, becomes /app/requests/abc before the router reads it.
const moved = legacyRedirect(window.location)
if (moved) window.history.replaceState(window.history.state, '', moved)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={APP_BASE}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Site from './Site'
import './site.css'

// The public website. It makes no API calls and never probes for a session (ADR-063).
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Site path={window.location.pathname} />
  </StrictMode>,
)

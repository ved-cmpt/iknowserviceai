import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'

const LABELS = {
  checking: 'Checking API…',
  connected: 'API connected',
  unreachable: 'API unreachable',
}

export default function ApiStatus() {
  const [state, setState] = useState('checking')

  useEffect(() => {
    let active = true
    apiFetch('/healthz', { timeoutMs: 5000 })
      .then(() => active && setState('connected'))
      .catch(() => active && setState('unreachable'))
    return () => {
      active = false
    }
  }, [])

  return (
    <span className={`api-status api-status-${state}`} role="status">
      {LABELS[state]}
    </span>
  )
}

import { useState } from 'react'
import { applyTheme, currentTheme } from '../lib/theme'
import Icon from './icons'

// Follows the system until someone chooses. The choice is remembered on this device.
export default function ThemeToggle() {
  const [theme, setTheme] = useState(currentTheme)
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm icon-button"
      aria-label={`Switch to ${next} theme`}
      onClick={() => {
        applyTheme(next)
        setTheme(next)
      }}
    >
      <Icon name={next === 'dark' ? 'moon' : 'sun'} />
    </button>
  )
}

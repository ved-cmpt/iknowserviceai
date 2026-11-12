import { useState } from 'react'
import { applyTheme, currentTheme } from '../lib/theme'
import Icon from './icons'

// Dark is the default (ADR-062). The choice is remembered on this device. Inside the app shell the
// shell owns the theme, so this button and the account menu agree; on its own it keeps its own.
export default function ThemeToggle({ theme: controlled, onToggle }) {
  const [own, setOwn] = useState(currentTheme)
  const theme = controlled ?? own
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm icon-button"
      aria-label={`Switch to ${next} theme`}
      onClick={() => {
        if (onToggle) {
          onToggle()
          return
        }
        applyTheme(next)
        setOwn(next)
      }}
    >
      <Icon name={next === 'dark' ? 'moon' : 'sun'} />
    </button>
  )
}

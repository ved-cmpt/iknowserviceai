import { useEffect, useId, useRef } from 'react'

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'

// A modal surface: focus moves in, Tab stays inside, Escape closes, and focus returns to whatever
// opened it. `initialFocus` is a selector inside the modal.
export default function Modal({ title, titleHidden = false, onClose, className, initialFocus, children }) {
  const ref = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const opener = document.activeElement
    const target = (initialFocus && ref.current?.querySelector(initialFocus)) || ref.current?.querySelector(FOCUSABLE)
    target?.focus()
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [initialFocus])

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const items = [...ref.current.querySelectorAll(FOCUSABLE)]
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={ref}
        className={['dialog', className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className={titleHidden ? 'visually-hidden' : undefined}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}

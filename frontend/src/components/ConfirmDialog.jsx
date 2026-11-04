import { useEffect, useId, useRef } from 'react'
import Button from './Button'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])'

// A modal confirmation: focus moves in, Tab stays inside, Escape cancels, and focus returns to
// the control that opened it. Focus starts on Cancel, so Enter alone never confirms by accident.
export default function ConfirmDialog({
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null)
  const titleId = useId()
  const bodyId = useId()

  useEffect(() => {
    const opener = document.activeElement
    dialogRef.current?.querySelector(FOCUSABLE)?.focus()
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      if (!busy) onCancel()
      return
    }
    if (event.key !== 'Tab') return

    const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)]
    if (items.length === 0) {
      event.preventDefault()
      return
    }
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
    <div className="dialog-backdrop">
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId}>{title}</h2>
        <div id={bodyId}>{children}</div>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={onConfirm} busy={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

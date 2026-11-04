import { useState } from 'react'
import { friendlyMessage } from '../api/errors'
import { updateArticle } from '../api/knowledge'
import { useAnnounce } from '../components/announcerContext'
import Button from '../components/Button'
import ConfirmDialog from '../components/ConfirmDialog'
import { STATUS_ACTIONS } from './articleForm'

const CONSEQUENCES = {
  PUBLISHED: 'Everyone can then search for and read this article, and the AI can cite it.',
  DRAFT: 'It leaves search right away, and the AI can no longer cite it.',
  ARCHIVED: 'It leaves search right away, and the AI can no longer cite it.',
}

// Publish, unpublish, archive or restore one article, after confirming.
export default function ArticleStatusActions({ article, onChanged, size }) {
  const announce = useAnnounce()
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const updated = await updateArticle(article.id, { status: pending.status })
      announce(`${pending.label}: ${article.title}`)
      onChanged(updated)
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  return (
    <>
      <span className="btn-group">
        {(STATUS_ACTIONS[article.status] ?? []).map((action) => (
          <Button
            key={action.status}
            variant="secondary"
            size={size}
            aria-label={`${action.label}: ${article.title}`}
            onClick={() => setPending(action)}
          >
            {action.label}
          </Button>
        ))}
      </span>
      {error && (
        <p role="alert" className="field-error">
          {friendlyMessage(error)}
        </p>
      )}
      {pending && (
        <ConfirmDialog
          title={`${pending.label} this article?`}
          confirmLabel={pending.label}
          busy={busy}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        >
          <p>
            <strong>{article.title}</strong>
          </p>
          <p>{CONSEQUENCES[pending.status]}</p>
        </ConfirmDialog>
      )}
    </>
  )
}

import { useState } from 'react'
import { friendlyMessage } from '../api/errors'
import { addComment } from '../api/requests'
import { useAnnounce } from '../components/announcerContext'
import Badge from '../components/Badge'
import Button from '../components/Button'
import Card from '../components/Card'
import ErrorState from '../components/ErrorState'
import FormField from '../components/FormField'
import { formatDateTime } from '../lib/format'
import { COMMENT_MAX } from './limits'

const INTERNAL_LABEL = 'Internal — not visible to requester'

function CommentForm({ requestId, allowInternal, onAdded }) {
  const announce = useAnnounce()
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
  const [fieldError, setFieldError] = useState(null)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitting) return
    const text = body.trim()
    if (!text) {
      setFieldError('Write a comment first.')
      return
    }
    if (text.length > COMMENT_MAX) {
      setFieldError(`Keep your comment to ${COMMENT_MAX} characters or fewer.`)
      return
    }
    setFieldError(null)
    setError(null)
    setSubmitting(true)
    try {
      await addComment(requestId, { body: text, is_internal: internal })
      setBody('')
      setInternal(false)
      announce('Comment added.')
      onAdded()
    } catch (cause) {
      setError(cause)
      announce(friendlyMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {error && <ErrorState error={error} />}
      <FormField label="Add a comment" error={fieldError} count={body.length} max={COMMENT_MAX}>
        {(field) => (
          <textarea
            {...field}
            rows={3}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        )}
      </FormField>
      {allowInternal && (
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={internal}
            onChange={(event) => setInternal(event.target.checked)}
          />
          <span>{INTERNAL_LABEL}</span>
        </label>
      )}
      <Button type="submit" variant="secondary" busy={submitting}>
        {submitting ? 'Adding…' : internal ? 'Add internal comment' : 'Add comment'}
      </Button>
    </form>
  )
}

export default function CommentsSection({ request, allowInternal = false, onAdded }) {
  const closed = request.status === 'CLOSED'
  return (
    <Card title="Comments">
      {request.comments.length === 0 ? (
        <p className="muted">No comments yet.</p>
      ) : (
        <ul className="plain-list">
          {request.comments.map((comment) => (
            <li
              key={comment.id}
              className={comment.is_internal ? 'comment comment-internal' : 'comment'}
            >
              <div className="comment-meta">
                <strong>{comment.author_name}</strong>
                <span className="meta">{formatDateTime(comment.created_at)}</span>
                {comment.is_internal && <Badge tone="warning">{INTERNAL_LABEL}</Badge>}
              </div>
              <div className="preserve-lines">{comment.body}</div>
            </li>
          ))}
        </ul>
      )}
      {closed ? (
        <p className="meta">This request is closed, so comments are read-only.</p>
      ) : (
        <CommentForm requestId={request.id} allowInternal={allowInternal} onAdded={onAdded} />
      )}
    </Card>
  )
}

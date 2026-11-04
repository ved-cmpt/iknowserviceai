import { useState } from 'react'
import { friendlyMessage, needsReload } from '../api/errors'
import { reviewRequest, validateReview } from '../api/requests'
import { useAnnounce } from '../components/announcerContext'
import Banner from '../components/Banner'
import Button from '../components/Button'
import Card from '../components/Card'
import ConfirmDialog from '../components/ConfirmDialog'
import ErrorState from '../components/ErrorState'
import FormField from '../components/FormField'
import { riskFlagLabel } from '../lib/labels'
import { REASON_MAX, REASON_MIN, REPLY_MAX } from '../requests/limits'

function validate(decision, reply, reason) {
  const errors = {}
  const reasonLength = reason.trim().length
  if (reasonLength < REASON_MIN || reasonLength > REASON_MAX) {
    errors.reason = `Enter a reason of ${REASON_MIN} to ${REASON_MAX} characters.`
  }
  if (decision === 'APPROVED') {
    const replyLength = reply.trim().length
    if (replyLength === 0) errors.reply = 'Enter the reply to publish.'
    else if (replyLength > REPLY_MAX) errors.reply = `Keep the reply to ${REPLY_MAX} characters or fewer.`
  }
  return errors
}

// The approve and reject decision on a held suggestion. The reply is prefilled from the draft
// until staff edit it, and what they type stays through a reload.
export default function ReviewPanel({ request, onReviewed, onConflict }) {
  const announce = useAnnounce()
  const suggestion = request.suggestion
  const [replyDraft, setReplyDraft] = useState(null)
  const [reason, setReason] = useState('')
  const [nextStatus, setNextStatus] = useState('TRIAGED')
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [pendingDecision, setPendingDecision] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [checking, setChecking] = useState(null)

  const reply = replyDraft ?? suggestion.proposed_reply
  const outputFlags = suggestion.risk_flags.filter((flag) => flag.startsWith('OUTPUT_'))

  function reviewBody(decision) {
    return {
      decision,
      ...(decision === 'APPROVED' ? { published_reply: reply.trim() } : {}),
      review_reason: reason.trim(),
      expected_suggestion_id: suggestion.id,
      next_status: nextStatus,
    }
  }

  function showFailure(cause) {
    if (cause.code === 'UNSAFE_REPLY') setErrors({ reply: friendlyMessage(cause) })
    else if (needsReload(cause)) onConflict(cause)
    else setServerError(cause)
  }

  // Asks the server first, so a refusal appears on the field before any confirmation is shown.
  async function ask(decision) {
    if (checking) return
    const found = validate(decision, reply, reason)
    setErrors(found)
    setServerError(null)
    if (Object.keys(found).length > 0) return
    setChecking(decision)
    try {
      await validateReview(request.id, reviewBody(decision))
      setPendingDecision(decision)
    } catch (cause) {
      showFailure(cause)
    } finally {
      setChecking(null)
    }
  }

  async function submit() {
    setSubmitting(true)
    try {
      const updated = await reviewRequest(request.id, reviewBody(pendingDecision))
      announce(pendingDecision === 'APPROVED' ? 'Reply approved and published.' : 'Suggestion rejected.')
      onReviewed(updated)
    } catch (cause) {
      showFailure(cause)
    } finally {
      setSubmitting(false)
      setPendingDecision(null)
    }
  }

  return (
    <Card title="Review the AI draft">
      {serverError && <ErrorState error={serverError} />}
      {outputFlags.length > 0 && (
        <Banner tone="warning" title="Check this draft carefully before publishing">
          Flagged: {outputFlags.map(riskFlagLabel).join(', ')}.
        </Banner>
      )}
      <h3>AI draft (read-only)</h3>
      <div className="ai-reply preserve-lines" data-testid="ai-draft">
        {suggestion.proposed_reply}
      </div>
      <FormField
        label="Reply to publish"
        required
        hint="The requester sees exactly this text if you approve. It is not used if you reject."
        error={errors.reply}
        count={reply.length}
        max={REPLY_MAX}
      >
        {(field) => (
          <textarea
            {...field}
            rows={6}
            value={reply}
            onChange={(event) => setReplyDraft(event.target.value)}
          />
        )}
      </FormField>
      <FormField
        label="Review reason"
        required
        hint="Recorded in the audit log. The requester does not see it."
        error={errors.reason}
        count={reason.length}
        max={REASON_MAX}
      >
        {(field) => (
          <input {...field} value={reason} onChange={(event) => setReason(event.target.value)} />
        )}
      </FormField>
      <FormField label="Next status">
        {(field) => (
          <select {...field} value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
            <option value="TRIAGED">Triaged</option>
            <option value="IN_PROGRESS">In progress</option>
          </select>
        )}
      </FormField>
      <div className="btn-group">
        {/* Not disabled during the check: that would drop keyboard focus, and the dialog returns it here. */}
        <Button aria-busy={checking === 'APPROVED' || undefined} onClick={() => ask('APPROVED')}>
          Approve
        </Button>
        <Button
          variant="danger"
          aria-busy={checking === 'REJECTED' || undefined}
          onClick={() => ask('REJECTED')}
        >
          Reject
        </Button>
      </div>
      {pendingDecision === 'APPROVED' && (
        <ConfirmDialog
          title="Approve and publish this reply?"
          confirmLabel="Approve and publish"
          busy={submitting}
          onConfirm={submit}
          onCancel={() => setPendingDecision(null)}
        >
          <p>The requester will see this text:</p>
          <div className="ai-reply preserve-lines">{reply.trim()}</div>
        </ConfirmDialog>
      )}
      {pendingDecision === 'REJECTED' && (
        <ConfirmDialog
          title="Reject this suggestion?"
          confirmLabel="Reject suggestion"
          tone="danger"
          busy={submitting}
          onConfirm={submit}
          onCancel={() => setPendingDecision(null)}
        >
          <p>The requester will never see the AI draft, and will not be told it was rejected.</p>
        </ConfirmDialog>
      )}
    </Card>
  )
}

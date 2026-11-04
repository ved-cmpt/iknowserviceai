import { useState } from 'react'
import { friendlyMessage, needsReload } from '../api/errors'
import { useAuth } from '../auth/authContext'
import Button from '../components/Button'
import Card from '../components/Card'
import ConfirmDialog from '../components/ConfirmDialog'
import FormField from '../components/FormField'
import { CATEGORIES } from '../knowledge/categories'
import { PRIORITY_OPTIONS, statusLabel } from '../lib/labels'
import { REASON_MAX, REASON_MIN } from '../requests/limits'
import { allowedTransitions } from '../requests/transitions'

const ESCALATE = 'NEEDS_HUMAN_REVIEW'
const CATEGORY_OPTIONS = CATEGORIES.filter(([value]) => value !== '')

// Runs one update. A conflict goes to the page, which offers a reload. Anything else is this
// form's own error, so the person can fix it where they are. Returns whether it worked.
function useUpdate(onPatch, onConflict) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function run(changes, message) {
    setBusy(true)
    setError(null)
    try {
      await onPatch(changes, message)
      return true
    } catch (cause) {
      if (needsReload(cause)) onConflict(cause)
      else setError(cause)
      return false
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, run }
}

function ActionError({ error }) {
  if (!error) return null
  return (
    <p role="alert" className="field-error">
      {friendlyMessage(error)}
    </p>
  )
}

function AssignmentCard({ request, onPatch, onConflict }) {
  const { user } = useAuth()
  const { busy, error, run } = useUpdate(onPatch, onConflict)
  const assignee = request.assigned_agent
  const mine = assignee?.id === user.id
  const closed = request.status === 'CLOSED'

  return (
    <Card title="Assignment">
      <p>
        {assignee ? `Assigned to ${mine ? 'you' : assignee.display_name}.` : 'Nobody is assigned.'}
      </p>
      {!closed && (
        <div className="btn-group">
          {!mine && (
            <Button
              variant="secondary"
              busy={busy}
              onClick={() => run({ assigned_agent_id: user.id }, 'You are now assigned.')}
            >
              Assign to me
            </Button>
          )}
          {assignee && (
            <Button
              variant="secondary"
              busy={busy}
              onClick={() => run({ assigned_agent_id: null }, 'Returned to the queue.')}
            >
              Unassign
            </Button>
          )}
        </div>
      )}
      <ActionError error={error} />
    </Card>
  )
}

function StatusCard({ request, reviewPending, onPatch, onConflict }) {
  const { busy, error, run } = useUpdate(onPatch, onConflict)
  const [confirming, setConfirming] = useState(false)
  // Leaving review with PATCH would strand a held draft that could then never be reviewed.
  const targets = reviewPending ? [] : allowedTransitions(request.status)

  async function escalate() {
    await run({ status: ESCALATE }, 'Escalated to review.')
    setConfirming(false)
  }

  let note = null
  if (reviewPending) note = 'Approve or reject the AI draft to move this request on.'
  else if (request.status === 'CLOSED') note = 'This request is closed. Closed is final.'
  else if (request.status === 'ANALYZING') note = 'Status is locked while analysis runs.'

  return (
    <Card title="Status">
      {note && <p className="muted">{note}</p>}
      {targets.length > 0 && (
        <div className="btn-group">
          {targets.map((target) =>
            target === ESCALATE ? (
              <Button key={target} variant="secondary" busy={busy} onClick={() => setConfirming(true)}>
                Escalate to review
              </Button>
            ) : (
              <Button
                key={target}
                variant="secondary"
                busy={busy}
                onClick={() =>
                  run({ status: target }, `Status changed to ${statusLabel(target)}.`)
                }
              >
                Move to {statusLabel(target)}
              </Button>
            ),
          )}
        </div>
      )}
      <ActionError error={error} />
      {confirming && (
        <ConfirmDialog
          title="Escalate to review?"
          confirmLabel="Escalate"
          busy={busy}
          onConfirm={escalate}
          onCancel={() => setConfirming(false)}
        >
          <p>
            Any AI reply the requester can see will be hidden until someone reviews it. A reply a
            person already approved stays visible.
          </p>
        </ConfirmDialog>
      )}
    </Card>
  )
}

function OverrideCard({ request, onPatch, onConflict }) {
  const { busy, error, run } = useUpdate(onPatch, onConflict)
  // null means untouched, which follows the latest value. A reload never silently reverts someone
  // else's change, and never discards what this person chose.
  const [priorityDraft, setPriorityDraft] = useState(null)
  const [categoryDraft, setCategoryDraft] = useState(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState(null)
  const [noChange, setNoChange] = useState(false)

  const priority = priorityDraft ?? request.priority
  const category = categoryDraft ?? request.category

  if (request.status === 'CLOSED') return null

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    const changes = {}
    if (priority !== request.priority) changes.priority = priority
    if (category !== request.category) changes.category = category
    const empty = Object.keys(changes).length === 0
    setNoChange(empty)
    if (empty) return

    const length = reason.trim().length
    if (length < REASON_MIN || length > REASON_MAX) {
      setReasonError(`Enter a reason of ${REASON_MIN} to ${REASON_MAX} characters.`)
      return
    }
    setReasonError(null)
    const done = await run({ ...changes, reason: reason.trim() }, 'Priority and category saved.')
    if (done) {
      setPriorityDraft(null)
      setCategoryDraft(null)
      setReason('')
    }
  }

  return (
    <Card title="Priority and category">
      <form onSubmit={handleSubmit} noValidate>
        <FormField label="Priority">
          {(field) => (
            <select {...field} value={priority} onChange={(event) => setPriorityDraft(event.target.value)}>
              {PRIORITY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Category">
          {(field) => (
            <select {...field} value={category} onChange={(event) => setCategoryDraft(event.target.value)}>
              {CATEGORY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField
          label="Reason for the change"
          required
          error={reasonError}
          count={reason.length}
          max={REASON_MAX}
        >
          {(field) => (
            <input {...field} value={reason} onChange={(event) => setReason(event.target.value)} />
          )}
        </FormField>
        <Button type="submit" variant="secondary" busy={busy}>
          Save changes
        </Button>
        {noChange && <p className="field-hint">Change the priority or category first.</p>}
        <ActionError error={error} />
      </form>
    </Card>
  )
}

export default function WorkflowControls({ request, reviewPending, onPatch, onConflict }) {
  return (
    <>
      <AssignmentCard request={request} onPatch={onPatch} onConflict={onConflict} />
      <StatusCard
        request={request}
        reviewPending={reviewPending}
        onPatch={onPatch}
        onConflict={onConflict}
      />
      <OverrideCard request={request} onPatch={onPatch} onConflict={onConflict} />
    </>
  )
}

import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createRequest } from '../api/requests'
import { useAuth } from '../auth/authContext'
import { isStaff } from '../auth/roles'
import Button from '../components/Button'
import Card from '../components/Card'
import ErrorState from '../components/ErrorState'
import FormField from '../components/FormField'
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX, TITLE_MIN } from '../requests/limits'

function validate(title, description) {
  const errors = {}
  const titleLength = title.trim().length
  const descriptionLength = description.trim().length
  if (titleLength < TITLE_MIN) errors.title = `Enter a title of at least ${TITLE_MIN} characters.`
  else if (titleLength > TITLE_MAX) errors.title = `Keep the title to ${TITLE_MAX} characters or fewer.`
  if (descriptionLength < DESCRIPTION_MIN) {
    errors.description = `Describe the problem in at least ${DESCRIPTION_MIN} characters.`
  } else if (descriptionLength > DESCRIPTION_MAX) {
    errors.description = `Keep the description to ${DESCRIPTION_MAX} characters or fewer.`
  }
  return errors
}

export default function NewRequestPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState(null)
  const inFlight = useRef(false) // State updates too late to stop a fast double click.
  const titleRef = useRef(null)
  const descriptionRef = useRef(null)

  const errors = attempted ? validate(title, description) : {}

  async function handleSubmit(event) {
    event.preventDefault()
    if (inFlight.current) return

    setAttempted(true)
    const found = validate(title, description)
    if (found.title) {
      titleRef.current?.focus()
      return
    }
    if (found.description) {
      descriptionRef.current?.focus()
      return
    }

    inFlight.current = true
    setSubmitting(true)
    setServerError(null)
    try {
      const created = await createRequest({ title: title.trim(), description: description.trim() })
      const base = isStaff(user) ? '/support' : '/requests'
      navigate(`${base}/${created.id}`, { state: { autoAnalyze: true } })
    } catch (cause) {
      setServerError(cause)
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="page-medium">
      <p>
        <Link to="/dashboard">← Back to my requests</Link>
      </p>
      <h1>New request</h1>
      <p className="muted">
        Describe the problem in your own words. Please do not enter passwords or other private
        information: this demo uses synthetic data only.
      </p>
      <Card as="div">
        <form onSubmit={handleSubmit} noValidate>
          {serverError && <ErrorState error={serverError} />}
          <FormField
            label="Title"
            required
            error={errors.title}
            count={title.length}
            max={TITLE_MAX}
          >
            {(field) => (
              <input
                {...field}
                ref={titleRef}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            )}
          </FormField>
          <FormField
            label="Description"
            required
            hint="Include what you tried and when it started."
            error={errors.description}
            count={description.length}
            max={DESCRIPTION_MAX}
          >
            {(field) => (
              <textarea
                {...field}
                ref={descriptionRef}
                rows={7}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            )}
          </FormField>
          <Button type="submit" busy={submitting}>
            {submitting ? 'Submitting…' : 'Submit request'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { isAdmin, isStaff } from '../auth/roles'
import Button from './Button'
import Icon from './icons'

export const TOUR_KEY = 'iks-tour-done'

function stepsFor(user) {
  const first = user.display_name.split(' ')[0]
  const roleStep = isAdmin(user)
    ? ['Yours to run', 'Knowledge admin publishes the articles that suggestions cite, and Audit shows every decision, metadata only.']
    : isStaff(user)
      ? ['Your queue', 'In the Support queue, “Needs review” lists AI drafts held for a person. Open one to edit, approve or reject it.']
      : ['Ask for help', 'Choose New request. Ordinary problems get a cited suggestion, and anything sensitive waits for the support team.']
  return [
    [`Welcome, ${first}`, 'This is a shared demo with synthetic data. The sidebar holds every page you can use.'],
    roleStep,
    ['Jump anywhere', 'Press Ctrl K, or ⌘ K on a Mac, to find a page, a request or an article.'],
    ['Keyboard first', 'Press ? for every shortcut. You can take this tour again from your account menu.'],
  ]
}

// A short, dismissible first-visit tour. It never blocks the page: it is a small panel, not a
// modal, and it is remembered on this device once finished or skipped.
export default function Tour({ user, onDone }) {
  const steps = stepsFor(user)
  const [index, setIndex] = useState(0)
  const headingRef = useRef(null)
  const [title, text] = steps[index]
  const last = index === steps.length - 1

  useEffect(() => {
    if (index > 0) headingRef.current?.focus()
  }, [index])

  return (
    <section className="tour" aria-labelledby="tour-title" data-testid="tour">
      <div className="tour-head">
        <span className="tour-count mono">
          {index + 1} / {steps.length}
        </span>
        <button type="button" className="icon-ghost" aria-label="Skip the tour" onClick={onDone}>
          <Icon name="x" />
        </button>
      </div>
      <h2 id="tour-title" tabIndex={-1} ref={headingRef}>
        {title}
      </h2>
      <p>{text}</p>
      <div className="tour-actions">
        <span className="tour-dots" aria-hidden="true">
          {steps.map((step, dot) => (
            <span key={step[0]} className={dot === index ? 'tour-dot tour-dot-on' : 'tour-dot'} />
          ))}
        </span>
        {index > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setIndex(index - 1)}>
            Back
          </Button>
        )}
        <Button size="sm" onClick={() => (last ? onDone() : setIndex(index + 1))}>
          {last ? 'Done' : 'Next'}
        </Button>
      </div>
    </section>
  )
}

import { useEffect, useRef, useState } from 'react'
import { source } from './links'
import { usePrefersReducedMotion } from './useSnapshot'

// Each step, and the code that enforces it. Every sentence describes v1 as built.
const STEPS = [
  {
    name: 'Redact',
    text: 'Emails, phone numbers, tokens, keys and card-like numbers are masked before retrieval, the prompt or storage.',
    code: 'backend/app/services/redaction.py',
  },
  {
    name: 'Retrieve',
    text: 'PostgreSQL full-text search finds up to five published articles. Drafts can never become context.',
    code: 'backend/app/services/retrieval.py',
  },
  {
    name: 'Triage',
    text: 'The provider returns structured output only. It has no tools, and request text is marked as untrusted.',
    code: 'backend/app/services/ai/orchestrator.py',
  },
  {
    name: 'Validate',
    text: 'Strict schema, allow-listed flags, and citations that must be retrieved and published, or they are dropped.',
    code: 'backend/app/services/ai/orchestrator.py',
  },
  {
    name: 'Policy gate',
    text: 'Deterministic patterns scan the request, the reply and the sources. Flags only accumulate, so the model cannot clear its own review.',
    code: 'backend/app/services/policy.py',
  },
  {
    name: 'Human review',
    text: 'Staff edit, approve or reject a held draft. A reply that asks for a password is refused, and nobody reviews their own request.',
    code: 'backend/app/services/review.py',
  },
  {
    name: 'Audit',
    text: 'Every step is recorded, metadata only. The app’s database role cannot change history, and triggers refuse it for everyone else.',
    code: 'backend/alembic/versions',
  },
]

// Steps light up as they scroll into view. With reduced motion, all of them are lit from the start.
function Step({ step, index }) {
  const ref = useRef(null)
  const reducedMotion = usePrefersReducedMotion()
  const [seen, setSeen] = useState(false)
  const lit = seen || reducedMotion || !('IntersectionObserver' in window)

  useEffect(() => {
    const element = ref.current
    if (lit || !element) return undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true)
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -30% 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [lit])

  return (
    <li ref={ref} className={lit ? 'pipeline-step pipeline-step-lit' : 'pipeline-step'}>
      <span className="pipeline-index mono" aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div>
        <h3>{step.name}</h3>
        <p>{step.text}</p>
        <a className="pipeline-code mono" href={source(step.code)}>
          {step.code.replace('backend/app/', '')}
        </a>
      </div>
    </li>
  )
}

export default function Pipeline() {
  return (
    <ol className="pipeline">
      {STEPS.map((step, index) => (
        <Step key={step.name} step={step} index={index} />
      ))}
    </ol>
  )
}

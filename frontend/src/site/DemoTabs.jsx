import { BookOpen, CircleCheck, CircleX, Clock3, ShieldCheck, Sparkles } from 'lucide-react'
import { useRef, useState } from 'react'
import { categoryLabel } from '../knowledge/categories'
import { appHref } from '../lib/legacyPaths'
import { priorityLabel, riskFlagLabel, statusLabel } from '../lib/labels'
import { AI_LABEL, AWAITING_REVIEW_TEXT, REVIEWED_LABEL } from '../requests/aiState'
import { MaskedText } from './HeroReplay'
import { percent } from './useSnapshot'

// Deep links sign in as the matching demo person, then open the right page (LoginPage reads them).
function appLink(persona, next) {
  return `${appHref('/login')}?as=${persona}&next=${encodeURIComponent(next)}`
}

const TABS = [
  {
    key: 'ordinary',
    label: 'Ordinary request',
    persona: ['riley', 'Riley Morgan, a requester'],
    next: '/requests/new',
  },
  {
    key: 'sensitive',
    label: 'Sensitive request',
    persona: ['riley', 'Riley Morgan, a requester'],
    next: '/requests/new',
  },
  {
    key: 'injection',
    label: 'Prompt injection',
    persona: ['alex', 'Alex Chen, a support agent'],
    next: '/support?status=NEEDS_HUMAN_REVIEW',
  },
  {
    key: 'staff_review',
    label: 'Staff review',
    persona: ['alex', 'Alex Chen, a support agent'],
    next: '/support?status=NEEDS_HUMAN_REVIEW',
  },
]

function Window({ title, tone, children }) {
  return (
    <div className={`demo-window${tone ? ` demo-window-${tone}` : ''}`}>
      <p className="demo-window-title">{title}</p>
      <div className="demo-window-body">{children}</div>
    </div>
  )
}

function RequestCard({ run }) {
  return (
    <Window title="The request">
      <p className="demo-strong">{run.input.title}</p>
      <p className="demo-text">{run.input.description}</p>
    </Window>
  )
}

function Suggestion({ suggestion, reviewed }) {
  return (
    <div className={reviewed ? 'demo-suggestion demo-suggestion-reviewed' : 'demo-suggestion'}>
      <p className="demo-label">
        {reviewed ? (
          <ShieldCheck size={14} aria-hidden="true" />
        ) : (
          <Sparkles size={14} aria-hidden="true" />
        )}
        {reviewed ? REVIEWED_LABEL : AI_LABEL}
      </p>
      <p className="demo-text preserve-lines">{suggestion.reply}</p>
      {suggestion.citations.length > 0 && (
        <ul className="demo-sources" aria-label="Sources">
          {suggestion.citations.map((citation) => (
            <li key={citation.title}>
              <BookOpen size={13} aria-hidden="true" />
              {citation.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Awaiting() {
  return (
    <div className="demo-awaiting">
      <p className="demo-label">
        <Clock3 size={14} aria-hidden="true" />
        Awaiting staff review
      </p>
      <p className="demo-text">{AWAITING_REVIEW_TEXT}</p>
    </div>
  )
}

function Flags({ flags }) {
  if (flags.length === 0) return <p className="demo-muted">No risk flags</p>
  return (
    <ul className="demo-flags">
      {flags.map((flag) => (
        <li key={flag}>{riskFlagLabel(flag)}</li>
      ))}
    </ul>
  )
}

function OrdinaryPanel({ run }) {
  return (
    <div className="demo-grid">
      <div className="demo-column">
        <RequestCard run={run} />
        <Window title="What the provider saw, after redaction">
          <p className="demo-text">
            <MaskedText text={run.redacted.description} />
          </p>
        </Window>
        <Window title="Retrieved, ranked by full-text search">
          <ol className="demo-ranks">
            {run.retrieved.map((article) => (
              <li key={article.rank}>
                <span className="mono">#{article.rank}</span>
                <span>{article.title}</span>
                <span className="mono demo-muted">{article.score.toFixed(1)}</span>
              </li>
            ))}
          </ol>
          <p className="demo-muted">
            Citations returned {run.validation.citations_returned}, kept {run.validation.citations_kept.length},
            dropped {run.validation.citations_dropped.length}.
          </p>
        </Window>
      </div>
      <Window title="What the requester sees" tone="pass">
        <Suggestion suggestion={run.requester_view.suggestion} />
      </Window>
    </div>
  )
}

function SensitivePanel({ run }) {
  const staff = run.staff_view.suggestion
  return (
    <>
      <RequestCard run={run} />
      <div className="demo-grid demo-grid-even">
        <Window title="The requester’s view" tone="hold">
          <Awaiting />
          <p className="demo-muted">The draft is not in the response at all, not merely hidden.</p>
        </Window>
        <Window title="The staff view">
          <dl className="demo-facts">
            <div>
              <dt>Category</dt>
              <dd>{categoryLabel(staff.proposed_category)}</dd>
            </div>
            <div>
              <dt>Priority</dt>
              <dd>{priorityLabel(staff.proposed_priority)}</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>{percent(staff.confidence)}</dd>
            </div>
            <div>
              <dt>Model asked for review</dt>
              <dd>{run.provider_output.requires_human_review ? 'Yes' : 'No'}</dd>
            </div>
          </dl>
          <p className="demo-sub">Flags raised by code</p>
          <Flags flags={staff.risk_flags} />
          <p className="demo-sub">AI draft, waiting for a person</p>
          <p className="demo-text demo-draft">{staff.proposed_reply}</p>
        </Window>
      </div>
    </>
  )
}

function InjectionPanel({ run }) {
  const injected = /(Ignore previous instructions[^.]*\.?)/
  return (
    <div className="demo-grid demo-grid-even">
      <Window title="The request">
        <p className="demo-strong">{run.input.title}</p>
        <p className="demo-text">
          {run.input.description.split(injected).map((part, index) =>
            injected.test(part) ? (
              <mark key={index} className="demo-injected">
                {part}
              </mark>
            ) : (
              part
            ),
          )}
        </p>
      </Window>
      <Window title="What happened" tone="hold">
        <p className="demo-sub">Flags raised by the input scan</p>
        <Flags flags={run.policy.input_scan_flags} />
        <ul className="demo-checks">
          <li>
            <CircleCheck size={15} aria-hidden="true" />
            Status is {statusLabel(run.policy.status_after)}, not resolved. The model has no tools to change it.
          </li>
          <li>
            <CircleCheck size={15} aria-hidden="true" />
            Nothing was revealed: the requester sees “Awaiting staff review” and no AI text.
          </li>
          <li>
            <CircleCheck size={15} aria-hidden="true" />A person decides what happens next.
          </li>
        </ul>
      </Window>
    </div>
  )
}

function StaffReviewPanel({ scenario }) {
  const [unsafe, safe] = scenario.attempts
  const [shown, setShown] = useState(null)
  const result = shown === 'unsafe' ? unsafe : shown === 'safe' ? safe : null

  return (
    <div className="demo-grid demo-grid-even">
      <Window title="Reply to publish">
        <p className="demo-muted">
          Choose a reply to publish on the held request. These are replays of the server’s recorded responses.
        </p>
        <div className="demo-choices">
          <button
            type="button"
            className="demo-choice"
            aria-pressed={shown === 'unsafe'}
            onClick={() => setShown('unsafe')}
          >
            <span className="demo-choice-label">Try an unsafe reply</span>
            <span className="demo-text">“{unsafe.reply}”</span>
          </button>
          <button
            type="button"
            className="demo-choice"
            aria-pressed={shown === 'safe'}
            onClick={() => setShown('safe')}
          >
            <span className="demo-choice-label">Publish a safe reply</span>
            <span className="demo-text">“{safe.reply}”</span>
          </button>
        </div>
      </Window>
      <div role="status" aria-live="polite" className="demo-result">
        {!result && <p className="demo-muted demo-placeholder">Choose a reply to see what the server did.</p>}
        {result && !result.accepted && (
          <Window title={`Refused · HTTP ${result.http_status} ${result.error_code}`} tone="fail">
            <p className="demo-label demo-label-fail">
              <CircleX size={14} aria-hidden="true" />
              {result.message}
            </p>
            <p className="demo-muted">Nothing was published, and no confirmation dialog opened.</p>
          </Window>
        )}
        {result?.accepted && (
          <Window title="Approved · what the requester sees now" tone="pass">
            <Suggestion suggestion={result.requester_view.suggestion} reviewed />
            <p className="demo-muted">
              Status {statusLabel(result.status_after)}. The decision and reason are in the audit log, without
              the reply text.
            </p>
          </Window>
        )}
      </div>
    </div>
  )
}

export default function DemoTabs({ snapshot }) {
  const [active, setActive] = useState(0)
  const tabRefs = useRef([])

  function select(index) {
    setActive(index)
    tabRefs.current[index]?.focus()
  }

  function onKeyDown(event) {
    const last = TABS.length - 1
    const moves = { ArrowRight: active === last ? 0 : active + 1, ArrowLeft: active === 0 ? last : active - 1, Home: 0, End: last }
    if (event.key in moves) {
      event.preventDefault()
      select(moves[event.key])
    }
  }

  const tab = TABS[active]
  const scenario = snapshot.scenarios[tab.key]

  return (
    <div className="demo">
      <div className="demo-tablist" role="tablist" aria-label="Demos" onKeyDown={onKeyDown}>
        {TABS.map((item, index) => (
          <button
            key={item.key}
            ref={(element) => {
              tabRefs.current[index] = element
            }}
            type="button"
            role="tab"
            id={`demo-tab-${item.key}`}
            aria-selected={index === active}
            aria-controls={`demo-panel-${item.key}`}
            tabIndex={index === active ? 0 : -1}
            className="demo-tab"
            onClick={() => setActive(index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        className="demo-panel"
        role="tabpanel"
        id={`demo-panel-${tab.key}`}
        aria-labelledby={`demo-tab-${tab.key}`}
        tabIndex={0}
      >
        {tab.key === 'ordinary' && <OrdinaryPanel run={scenario} />}
        {tab.key === 'sensitive' && <SensitivePanel run={scenario} />}
        {tab.key === 'injection' && <InjectionPanel run={scenario} />}
        {tab.key === 'staff_review' && <StaffReviewPanel key="review" scenario={scenario} />}
        <div className="demo-footer">
          <p className="demo-muted">
            Recorded with the built-in mock agent. In the app, sign in as {tab.persona[1]}.
          </p>
          <a className="site-btn site-btn-secondary site-btn-sm" href={appLink(tab.persona[0], tab.next)}>
            See it in the app
          </a>
        </div>
      </div>
    </div>
  )
}

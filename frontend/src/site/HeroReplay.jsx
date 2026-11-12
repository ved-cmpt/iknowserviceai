import { CircleCheck, Clock3, Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { categoryLabel } from '../knowledge/categories'
import { priorityLabel, riskFlagLabel } from '../lib/labels'
import { percent, SNAPSHOT_URL, usePrefersReducedMotion } from './useSnapshot'

const STAGES = ['Request', 'Redact', 'Retrieve', 'Triage', 'Policy gate']
const STEP_MS = 1700
const HOLD_MS = 3600
const SCENARIOS = [
  ['ordinary', 'Ordinary request'],
  ['sensitive', 'Sensitive request'],
]

// Masks such as [EMAIL] become highlighted chips. The text itself comes from the snapshot.
export function MaskedText({ text }) {
  return text.split(/(\[[A-Z_]+\])/).map((part, index) =>
    /^\[[A-Z_]+\]$/.test(part) ? (
      <mark key={index} className="mask">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

// Underlines the values that redaction replaced, for display. The masking itself happened on the
// server, and its output is what the next panel shows.
function OriginalText({ text }) {
  const pattern = /([\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d ()-]{7,}\d)/
  return text.split(pattern).map((part, index) =>
    pattern.test(part) ? (
      <span key={index} className="sensitive-value">
        {part}
      </span>
    ) : (
      part
    ),
  )
}

function Panel({ index, stage, title, children }) {
  const state = index < stage ? 'done' : index === stage ? 'active' : 'pending'
  return (
    <li className={`replay-panel replay-panel-${state}`} aria-current={state === 'active' ? 'step' : undefined}>
      <span className="replay-step" aria-hidden="true">
        {state === 'done' ? <CircleCheck size={14} strokeWidth={2} /> : index + 1}
      </span>
      <div className="replay-panel-body">
        <p className="replay-panel-title">{title}</p>
        {children}
      </div>
    </li>
  )
}

function Decision({ run }) {
  const held = run.policy.review_state === 'PENDING_REVIEW'
  if (!held) {
    const sources = run.validation.citations_kept.length
    return (
      <p className="replay-decision replay-decision-pass">
        <CircleCheck size={15} aria-hidden="true" />
        Shown to the requester, labelled as AI, with {sources} {sources === 1 ? 'source' : 'sources'}
      </p>
    )
  }
  return (
    <>
      <p className="replay-decision replay-decision-hold">
        <Clock3 size={15} aria-hidden="true" />
        Held for staff review. The requester sees no AI text
      </p>
      <ul className="replay-flags">
        {run.policy.final_flags.map((flag) => (
          <li key={flag}>{riskFlagLabel(flag)}</li>
        ))}
      </ul>
    </>
  )
}

// Replays two recorded runs, stage by stage. Fixed sizes keep the page from shifting as it plays.
export default function HeroReplay({ snapshot }) {
  // With reduced motion, it starts paused on the last frame, and plays only if asked to.
  const reducedMotion = usePrefersReducedMotion()
  const [scenario, setScenario] = useState(0)
  const [stage, setStage] = useState(reducedMotion ? STAGES.length - 1 : 0)
  const [paused, setPaused] = useState(reducedMotion)
  const [visible, setVisible] = useState(true)
  const ref = useRef(null)

  // Off screen, or in a background tab, it waits.
  useEffect(() => {
    const element = ref.current
    if (!element || !('IntersectionObserver' in window)) return undefined
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (paused || !visible) return undefined
    const last = stage === STAGES.length - 1
    const timer = setTimeout(
      () => {
        if (document.hidden) return
        if (last) {
          setScenario((value) => (value + 1) % SCENARIOS.length)
          setStage(0)
        } else {
          setStage((value) => value + 1)
        }
      },
      last ? HOLD_MS : STEP_MS,
    )
    return () => clearTimeout(timer)
  }, [paused, visible, stage, scenario])

  const run = snapshot.scenarios[SCENARIOS[scenario][0]]
  const output = run.provider_output
  const retrieved = run.retrieved.slice(0, 3)
  const masked = (run.redacted.description.match(/\[[A-Z_]+\]/g) ?? []).length

  return (
    <figure className="replay" ref={ref} aria-labelledby="replay-caption">
      <div className="replay-chrome">
        <div className="replay-tabs" role="group" aria-label="Recorded run">
          {SCENARIOS.map(([key, label], index) => (
            <button
              key={key}
              type="button"
              className="replay-tab"
              aria-pressed={scenario === index}
              onClick={() => {
                setScenario(index)
                setStage(paused ? STAGES.length - 1 : 0)
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="replay-pause"
          aria-label={paused ? 'Play the replay' : 'Pause the replay'}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
        </button>
      </div>
      <div className="replay-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${(stage + 1) / STAGES.length})` }} />
      </div>
      <ol className="replay-panels">
        <Panel index={0} stage={stage} title="Request arrives">
          <p className="replay-strong replay-clamp-1">{run.input.title}</p>
          <p className="replay-text replay-clamp-2">
            <OriginalText text={run.input.description} />
          </p>
        </Panel>
        <Panel index={1} stage={stage} title={masked ? `Redact · ${masked} values masked` : 'Redact · nothing to mask'}>
          <p className="replay-text replay-clamp-2">
            <MaskedText text={run.redacted.description} />
          </p>
        </Panel>
        <Panel index={2} stage={stage} title="Retrieve published articles">
          <ol className="replay-articles">
            {retrieved.map((article) => (
              <li key={article.rank}>
                <span className="mono">#{article.rank}</span>
                <span className="replay-clamp-1">{article.title}</span>
                <span className="mono replay-score">{article.score.toFixed(1)}</span>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel index={3} stage={stage} title="Triage · structured output">
          <ul className="replay-fields">
            <li>{categoryLabel(output.category)}</li>
            <li>{priorityLabel(output.priority)} priority</li>
            <li>Confidence {percent(output.confidence)}</li>
            <li>Model asks for review: {output.requires_human_review ? 'yes' : 'no'}</li>
          </ul>
        </Panel>
        <Panel index={4} stage={stage} title="Policy gate · decided by code">
          <Decision run={run} />
        </Panel>
      </ol>
      <figcaption id="replay-caption" className="replay-caption">
        A replay of two recorded runs through the real pipeline, with the built-in mock agent.{' '}
        <a href={SNAPSHOT_URL}>See the raw data</a>
      </figcaption>
    </figure>
  )
}

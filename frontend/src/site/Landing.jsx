import {
  Accessibility,
  BadgeCheck,
  Database,
  FileLock2,
  Gauge,
  GitFork,
  KeyRound,
  Layers,
  ListChecks,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Siren,
  TestTubes,
} from 'lucide-react'
import LogoMark from '../components/icons/LogoMark'
import { appHref } from '../lib/legacyPaths'
import DemoTabs from './DemoTabs'
import HeroReplay from './HeroReplay'
import { doc, REPO_URL, source } from './links'
import Pipeline from './Pipeline'
import SiteFooter from './SiteFooter'
import SiteNav from './SiteNav'
import { percent, SNAPSHOT_URL, useSnapshot } from './useSnapshot'

const SECTIONS = [
  ['#how', 'How it works'],
  ['#demo', 'Demo'],
  ['#security', 'Security'],
  ['#evaluation', 'Evaluation'],
]

function Section({ id, eyebrow, title, lede, children, className }) {
  return (
    <section id={id} className={['site-section', className].filter(Boolean).join(' ')} aria-labelledby={`${id}-title`}>
      <div className="site-section-inner">
        <header className="site-section-header">
          {eyebrow && <p className="site-eyebrow">{eyebrow}</p>}
          <h2 id={`${id}-title`}>{title}</h2>
          {lede && <p className="site-lede">{lede}</p>}
        </header>
        {children}
      </div>
    </section>
  )
}

function Loading({ error, height }) {
  return (
    <div className="site-loading" style={{ minHeight: height }} role={error ? 'alert' : 'status'}>
      {error ? (
        <p>
          {error.message} The <a href={doc('DEMO.md')}>demo script</a> describes the same steps.
        </p>
      ) : (
        <p className="visually-hidden">Loading the recorded runs…</p>
      )}
    </div>
  )
}

const PROBLEMS = [
  {
    icon: ListChecks,
    title: 'The same tickets, every day',
    text: 'Wi-Fi that connects but loads nothing. A VPN that drops. Staff read each one, find the guide, and write the same reply again.',
  },
  {
    icon: Siren,
    title: 'A confident wrong answer does harm',
    text: '“I think my account was hacked” needs a person, not a chatbot. And text in a ticket can try to steer the model.',
  },
  {
    icon: ScrollText,
    title: 'Someone will ask who decided',
    text: 'When an answer goes out, you need to know what the AI proposed, who approved it, and why. Months later.',
  },
]

const COMPARISON = [
  [
    'Where answers come from',
    'Often the model’s general knowledge, and sources are optional',
    'Your published articles. A citation must be retrieved and published, or it is dropped and the reply is held',
  ],
  [
    'Sensitive requests',
    'Usually a prompt instruction the model may or may not follow',
    'Code holds them for a person. Flags only accumulate, so the model cannot clear its own review',
  ],
  [
    'What staff publish',
    'Often not checked by code',
    'Scanned: a reply that asks for a password is refused, and nobody reviews their own request',
  ],
  ['Personal data in prompts', 'Sent as typed', 'Emails, phone numbers, tokens and keys are masked first'],
  ['Prompt injection', 'Depends on the model', 'Layered: no tools, delimited text, input and output scanning, review'],
  ['Audit', 'Chat logs, if kept', 'Append-only, enforced by database grants and triggers'],
  ['Runs without a model', 'No', 'Yes: a built-in mock agent, used by the public demo and every test'],
]

const SECURITY = [
  {
    icon: KeyRound,
    title: 'Sessions',
    text: 'A 10-minute access token in memory, and a rotating refresh token in an HttpOnly, SameSite=Strict cookie. Reusing an old one revokes the whole sign-in.',
  },
  {
    icon: Database,
    title: 'Least-privilege database role',
    text: 'The app connects as a role that owns nothing, cannot run DDL and cannot truncate. Tests prove it by connecting as that role.',
  },
  {
    icon: FileLock2,
    title: 'Append-only history',
    text: 'No UPDATE or DELETE on the audit log or request events for the app, and triggers refuse them for everyone else.',
  },
  {
    icon: ShieldCheck,
    title: 'Strict browser headers',
    text: 'A Content-Security-Policy with no inline scripts or third-party origins, frame denial, nosniff and HSTS. This page runs under it.',
  },
  {
    icon: Gauge,
    title: 'Rate limits',
    text: 'Five sign-in attempts a minute per address and email, ten analyses an hour per person, and three attempts per request.',
  },
  {
    icon: ShieldAlert,
    title: 'Adversarial tests',
    text: 'Cross-account reads, self-approval, injected instructions, invented citations and credential requests, each with a test.',
  },
]

const FAQ = [
  [
    'Why does the demo take a while to open?',
    'It runs on free hosting that sleeps when nobody uses it. The first visit after a quiet spell can take 30 to 60 seconds. One measurement was 32 seconds.',
  ],
  [
    'Is the AI in the demo real?',
    'No. The public demo uses the built-in mock agent, a keyword matcher, so it shows the workflow and its safety checks, not model quality. The real provider is Gemini, opt-in, and its 10-case sample is in the evaluation.',
  ],
  [
    'Can I enter real data?',
    'Please don’t. Every account is a shared demo account, the password is public, and the data resets daily.',
  ],
  [
    'Is it ready for production?',
    'It is a portfolio project. It has had no independent security review, rate limits are per process, and pattern-based checks can be evaded. The security document lists every known risk.',
  ],
  [
    'What does it cost?',
    'Nothing. It is open source under the MIT licence, and there are no plans or prices.',
  ],
]

function Stat({ value, label, detail, sourceFile, sourceHref }) {
  return (
    <div className="stat">
      <p className="stat-value">{value}</p>
      <p className="stat-label">{label}</p>
      {detail && <p className="stat-detail">{detail}</p>}
      <p className="stat-source">
        Source: <a href={sourceHref}>{sourceFile}</a>
      </p>
    </div>
  )
}

function Evaluation({ evaluation }) {
  const { mock, live_sample: live, first_mock_run: first } = evaluation
  const mockHref = source(mock.source)
  const liveHref = source(live.source)
  return (
    <>
      <div className="stat-grid">
        <Stat
          value={percent(mock.sensitive_hold_recall)}
          label={`Sensitive and injection cases held, ${Math.round(mock.sensitive_hold_recall * mock.sensitive_cases)} of ${mock.sensitive_cases}`}
          detail={`On a fixture used to tune the patterns. The first run held ${first.held} of ${first.cases} (${percent(first.rate, 1)}).`}
          sourceFile={mock.source}
          sourceHref={mockHref}
        />
        <Stat
          value={String(mock.invented_citations_persisted)}
          label="Invented citations kept"
          detail={`Mock, ${mock.cases_completed} cases. The live sample also kept ${live.invented_citations_persisted}.`}
          sourceFile={mock.source}
          sourceHref={mockHref}
        />
        <Stat
          value={percent(mock.false_hold_rate_ordinary)}
          label={`Ordinary requests held anyway, ${Math.round(mock.false_hold_rate_ordinary * mock.ordinary_cases)} of ${mock.ordinary_cases}`}
          detail="The mock’s low confidence on one vague case. A false hold costs staff time, not safety."
          sourceFile={mock.source}
          sourceHref={mockHref}
        />
        <Stat
          value={`${live.cases_completed} cases`}
          label={`Live sample on ${live.model}, holds ${percent(live.sensitive_hold_recall)}`}
          detail={`${live.provider_calls} provider calls. Median ${(live.latency_p50_ms / 1000).toFixed(1)} s per analysis, against ${mock.latency_p50_ms} ms for the mock.`}
          sourceFile={live.source}
          sourceHref={liveHref}
        />
      </div>
      <ul className="caveats">
        {evaluation.caveats.map((caveat) => (
          <li key={caveat}>{caveat}</li>
        ))}
      </ul>
      <p className="site-more">
        Measured on {mock.date}, prompt {mock.prompt_version}, {mock.cases_completed} synthetic cases.{' '}
        <a href={doc('EVALUATION.md')}>Read the full evaluation and its limitations</a>.
      </p>
    </>
  )
}

function DeploymentDiagram() {
  return (
    <figure className="deploy" aria-labelledby="deploy-caption">
      <div className="deploy-row">
        <div className="deploy-node">
          <span className="deploy-kind">Visitor</span>
          Browser
        </div>
        <span className="deploy-edge">HTTPS, one origin</span>
        <div className="deploy-node">
          <span className="deploy-kind">Edge</span>
          Cloudflare, then Render’s proxy
        </div>
        <span className="deploy-edge" />
        <div className="deploy-node deploy-node-main">
          <span className="deploy-kind">Render web service, free plan</span>
          One non-root container
          <span className="deploy-parts">
            <span>Built website and app</span>
            <span>FastAPI: auth, roles, policy, review</span>
            <span>Mock agent</span>
          </span>
        </div>
        <span className="deploy-edge">app_user, TLS</span>
        <div className="deploy-node">
          <span className="deploy-kind">Neon</span>
          PostgreSQL
        </div>
      </div>
      <figcaption id="deploy-caption">
        The actual deployment of this demo. A push to <code>main</code> deploys, and migrations run from the owner’s
        workstation, never from the app. <a href={doc('DEPLOYMENT.md')}>Deployment guide</a>.
      </figcaption>
    </figure>
  )
}

export default function Landing() {
  const { data: snapshot, error } = useSnapshot()

  return (
    <>
      <SiteNav sections={SECTIONS} />
      <main id="main" className="site-main">
        <section className="site-hero" aria-labelledby="hero-title">
          <div className="site-hero-glow" aria-hidden="true" />
          <div className="site-hero-inner">
            <div className="site-hero-copy">
              <p className="site-pill">
                <BadgeCheck size={14} aria-hidden="true" />
                Open source · v1.1 · live demo with synthetic data
              </p>
              <h1 id="hero-title">
                An IT service desk where AI drafts the answer and{' '}
                <span className="gradient-text">people stay in charge</span>
              </h1>
              <p className="site-lede">
                Suggestions cite your own knowledge base. Anything sensitive waits for a person, and code, not the
                model, decides what does.
              </p>
              <div className="site-cta-row">
                <a className="site-btn site-btn-primary" href={appHref('/login')}>
                  Try the live demo
                </a>
                <a className="site-btn site-btn-secondary" href={REPO_URL}>
                  <GitFork size={16} aria-hidden="true" />
                  View on GitHub
                </a>
              </div>
              <p className="site-hint">Pick a demo account on the sign-in page. No sign-up, and nothing real.</p>
            </div>
            <div className="site-hero-visual">
              {snapshot ? <HeroReplay snapshot={snapshot} /> : <Loading error={error} height={560} />}
            </div>
          </div>
        </section>

        <Section
          id="problem"
          eyebrow="The problem"
          title="Help desks are a risky place for AI"
          lede="The work is repetitive enough for AI to help, and sensitive enough that a wrong answer matters."
        >
          <div className="card-grid card-grid-3">
            {PROBLEMS.map(({ icon: IconComponent, title, text }) => (
              <article key={title} className="site-card">
                <IconComponent className="site-card-icon" size={20} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </Section>

        <Section
          id="how"
          eyebrow="How it works"
          title="Seven steps, and the model only proposes text"
          lede="It has no tools. Application code validates and writes everything, and each step names the file that enforces it."
        >
          <Pipeline />
        </Section>

        <Section
          id="demo"
          eyebrow="Interactive demo"
          title="See what each person sees"
          lede="Four recorded runs through the real pipeline. Nothing here calls the API: it replays the data the script recorded."
        >
          {snapshot ? <DemoTabs snapshot={snapshot} /> : <Loading error={error} height={520} />}
        </Section>

        <Section
          id="compare"
          eyebrow="Comparison"
          title="Not a chatbot with a disclaimer"
          lede="The right-hand column describes v1 exactly as built."
        >
          <div className="compare-wrap">
            <table className="compare">
              <caption className="visually-hidden">A typical AI chatbot compared with IknowServiceAI</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Aspect</span>
                  </th>
                  <th scope="col">Typical AI chatbot</th>
                  <th scope="col">IknowServiceAI</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(([aspect, typical, ours]) => (
                  <tr key={aspect}>
                    <th scope="row">{aspect}</th>
                    <td data-label="Typical AI chatbot">{typical}</td>
                    <td data-label="IknowServiceAI">{ours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          id="security"
          eyebrow="Security"
          title="Defenses in layers, each one tested"
          lede="This describes what the code does and where it stops. It has not had an independent review."
        >
          <div className="card-grid card-grid-3">
            {SECURITY.map(({ icon: IconComponent, title, text }) => (
              <article key={title} className="site-card">
                <IconComponent className="site-card-icon" size={20} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <p className="site-more">
            <a href={doc('SECURITY.md')}>Read the threat model and every known risk</a>.
          </p>
        </Section>

        <Section
          id="evaluation"
          eyebrow="Evaluation"
          title="Real numbers, with their caveats"
          lede="43 synthetic cases through the real pipeline, and a small live sample. Each number names the file it comes from."
        >
          {snapshot ? <Evaluation evaluation={snapshot.evaluation} /> : <Loading error={error} height={360} />}
        </Section>

        <Section
          id="engineering"
          eyebrow="Engineering"
          title="Built to be checked"
          lede="One service with clear boundaries, tested at every layer, and deployed as a single container."
        >
          <div className="card-grid card-grid-3">
            <article className="site-card">
              <TestTubes className="site-card-icon" size={20} aria-hidden="true" />
              <h3>Tests in CI</h3>
              <p>
                Every push to <code>main</code> runs pytest against real PostgreSQL, Vitest, Playwright journeys on
                the development stack and the production image, a Docker build, and a secret scan of the full
                history. Pull requests run a faster browser subset.
              </p>
              <a href={`${REPO_URL}/actions/workflows/ci.yml`}>See the CI runs</a>
            </article>
            <article className="site-card">
              <Accessibility className="site-card-icon" size={20} aria-hidden="true" />
              <h3>Accessibility</h3>
              <p>
                axe runs on every screen and on this page, in both themes and on phone and desktop widths, and fails
                on any finding. Keyboard journeys are tested too.
              </p>
              <a href={source('e2e/tests/accessibility.spec.js')}>See the checks</a>
            </article>
            <article className="site-card">
              <Layers className="site-card-icon" size={20} aria-hidden="true" />
              <h3>Data you can trace</h3>
              <p>
                The demos above come from a script that runs the pipeline and is checked against a fresh run in CI,
                so this page cannot drift from the code.
              </p>
              <a href={SNAPSHOT_URL}>Read the raw data</a>
            </article>
          </div>
          <DeploymentDiagram />
        </Section>

        <Section
          id="open-source"
          eyebrow="Open source"
          title="Read it, run it, take it apart"
          lede="MIT licensed. No accounts, no plans, no pricing."
        >
          <div className="card-grid card-grid-2">
            <article className="site-card">
              <h3>Run it locally</h3>
              <p>Docker Desktop is all you need. It runs in mock mode, with no key and no network calls.</p>
              <pre className="site-code" tabIndex={0} aria-label="Commands to run it locally">
                <code>{`git clone ${REPO_URL}.git
cd iknowserviceai
docker compose up --build -d --wait
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.scripts.seed_demo`}</code>
              </pre>
              <p className="site-hint">
                Create <code>.env</code> first, as the <a href={`${REPO_URL}#local-quickstart`}>README</a> shows.
              </p>
            </article>
            <article className="site-card">
              <h3>Live demo</h3>
              <p>
                Four fictional people: two requesters, a support agent and an admin. The password is public, and the
                data resets daily.
              </p>
              <div className="site-cta-row">
                <a className="site-btn site-btn-primary" href={appHref('/login')}>
                  Try the live demo
                </a>
                <a className="site-btn site-btn-secondary" href={doc('DEMO.md')}>
                  Three-minute tour
                </a>
              </div>
            </article>
          </div>
        </Section>

        <Section id="faq" eyebrow="FAQ" title="Questions people ask">
          <div className="faq">
            {FAQ.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </Section>

        <section className="site-final" aria-labelledby="final-title">
          <div className="site-section-inner">
            <span className="site-final-icon">
              <LogoMark size={48} />
            </span>
            <h2 id="final-title">
              See the review gate <span className="gradient-text">for yourself</span>
            </h2>
            <p className="site-lede">
              Ask for something sensitive, then sign in as staff and try to publish a password request.
            </p>
            <div className="site-cta-row">
              <a className="site-btn site-btn-primary" href={appHref('/login')}>
                Try the live demo
              </a>
              <a className="site-btn site-btn-secondary" href={REPO_URL}>
                View on GitHub
              </a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}

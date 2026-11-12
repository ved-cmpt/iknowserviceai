import LogoMark from '../components/icons/LogoMark'
import { appHref } from '../lib/legacyPaths'
import { AUTHOR_URL, doc, DOCS_URL, REPO_URL, source } from './links'

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <a className="site-brand" href="/" aria-label="IknowServiceAI home">
            <LogoMark size={22} />
            <span>
              IknowService<span className="gradient-text">AI</span>
            </span>
          </a>
          <p>
            Built by <a href={AUTHOR_URL}>Vedsai Vangapandu</a>. A portfolio project with synthetic data.
          </p>
        </div>
        <nav aria-label="Footer" className="site-footer-links">
          <div>
            <h2>Product</h2>
            <ul>
              <li>
                <a href={appHref('/login')}>Live demo</a>
              </li>
              <li>
                <a href={doc('DEMO.md')}>Three-minute tour</a>
              </li>
              <li>
                <a href={doc('EVALUATION.md')}>Evaluation</a>
              </li>
            </ul>
          </div>
          <div>
            <h2>Docs</h2>
            <ul>
              <li>
                <a href={DOCS_URL}>All documentation</a>
              </li>
              <li>
                <a href={doc('ARCHITECTURE.md')}>Architecture</a>
              </li>
              <li>
                <a href={doc('SECURITY.md')}>Security</a>
              </li>
            </ul>
          </div>
          <div>
            <h2>Source</h2>
            <ul>
              <li>
                <a href={REPO_URL}>GitHub</a>
              </li>
              <li>
                <a href={source('LICENSE')}>MIT licence</a>
              </li>
              <li>
                <a href={source('CHANGELOG.md')}>Changelog</a>
              </li>
            </ul>
          </div>
        </nav>
      </div>
    </footer>
  )
}

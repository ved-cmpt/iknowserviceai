import { appHref } from '../lib/legacyPaths'
import { REPO_URL } from './links'
import SiteFooter from './SiteFooter'
import SiteNav from './SiteNav'

export default function Landing() {
  return (
    <>
      <SiteNav />
      <main id="main" className="site-main">
        <section className="site-hero" aria-labelledby="hero-title">
          <p className="site-eyebrow">Open source · Human in the loop</p>
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
              View on GitHub
            </a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}

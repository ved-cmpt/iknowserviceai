import { appHref } from '../lib/legacyPaths'
import SiteFooter from './SiteFooter'
import SiteNav from './SiteNav'

export default function SiteNotFound() {
  return (
    <>
      <SiteNav />
      <main id="main" className="site-main site-not-found">
        <p className="site-eyebrow">404</p>
        <h1>Page not found</h1>
        <p className="site-lede">This page does not exist. The website and the live demo are one click away.</p>
        <div className="site-cta-row">
          <a className="site-btn site-btn-primary" href="/">
            Go to the website
          </a>
          <a className="site-btn site-btn-secondary" href={appHref('/login')}>
            Open the app
          </a>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}

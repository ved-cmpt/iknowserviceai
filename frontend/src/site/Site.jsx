import Landing from './Landing'
import SiteNotFound from './SiteNotFound'

// One page, and a not-found page for anything else that reaches the website.
export default function Site({ path }) {
  return path === '/' || path === '/index.html' ? <Landing /> : <SiteNotFound />
}

import Markdown from 'react-markdown'

// Article text is untrusted. react-markdown never renders raw HTML and it blocks unsafe link
// protocols, so scripts and handlers stay inert (ADR-018). The article page and the admin preview
// both use this, so a preview cannot show anything the published page would not.
export default function SafeMarkdown({ children }) {
  return (
    <div className="article-body">
      <Markdown>{children}</Markdown>
    </div>
  )
}

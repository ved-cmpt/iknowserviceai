import { useApiData } from '../api/useApiData'

// The public demo's notice, on the sign-in page and in the app shell. The server decides whether it
// applies (ADR-051). If the setting cannot be read, nothing is shown.
export default function DemoBanner() {
  const { data: config } = useApiData('/config')
  if (!config?.demo_banner) return null
  return (
    <aside className="demo-banner" aria-label="Public demo notice" data-testid="demo-banner">
      <span>{config.demo_banner}</span>
      {config.ai_notice && <span>{config.ai_notice}</span>}
    </aside>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { analyzeRequest } from '../api/requests'
import { useAnnounce } from '../components/announcerContext'

// Runs one analysis at a time and remembers how the last attempt failed. The request itself is
// always saved first (ADR-003), so a failure here never loses anything.
export function useAnalysis(id, { onResult, reload }) {
  const announce = useAnnounce()
  const [running, setRunning] = useState(false)
  const [failure, setFailure] = useState(null)
  const inFlight = useRef(false)

  const analyze = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setRunning(true)
    setFailure(null) // The analyzing panel is its own live region, so this needs no announcement.
    try {
      onResult(await analyzeRequest(id))
      announce('Analysis finished.')
    } catch (error) {
      // INVALID_STATE means the request has already moved on, so reloading is the whole answer.
      // A failure shows as an alert, which is announced without any help.
      if (error.code !== 'INVALID_STATE') setFailure(error)
      reload()
    } finally {
      inFlight.current = false
      setRunning(false)
    }
  }, [id, onResult, reload, announce])

  const clearFailure = useCallback(() => setFailure(null), [])

  return { running, failure, analyze, clearFailure }
}

// Starts the analysis once when arriving from the new-request form. The flag is removed from the
// history entry right away, so going back or remounting cannot run a second analysis. The API
// data is awaited first, so the page's first load cannot overwrite the analysis result.
export function useAutoAnalyze(ready, analyze) {
  const location = useLocation()
  const navigate = useNavigate()
  const started = useRef(false)
  const pending = Boolean(location.state?.autoAnalyze)

  useEffect(() => {
    if (!pending || !ready || started.current) return
    started.current = true
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
    analyze()
  }, [pending, ready, analyze, navigate, location.pathname, location.search])

  return pending
}

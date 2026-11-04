import Banner from '../components/Banner'
import Button from '../components/Button'
import { describeFailure } from './analysisFailure'

export default function AnalysisFailedPanel({ failure, running, staff = false, onAnalyze, onCheckAgain }) {
  const view = describeFailure(failure, { staff })
  return (
    <Banner tone={view.tone} title="Analysis did not finish" role="alert">
      <p>{view.message}</p>
      {view.action === 'retry' && (
        <>
          {view.attemptsRemaining !== null && view.attemptsRemaining !== undefined && (
            <p>
              {view.attemptsRemaining} {view.attemptsRemaining === 1 ? 'attempt' : 'attempts'}{' '}
              remaining.
            </p>
          )}
          <Button variant="secondary" size="sm" busy={running} onClick={onAnalyze}>
            Try again
          </Button>
        </>
      )}
      {view.action === 'reload' && (
        <Button variant="secondary" size="sm" onClick={onCheckAgain}>
          Check again
        </Button>
      )}
    </Banner>
  )
}

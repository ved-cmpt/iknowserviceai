// A labelled bar that always shows the number, so color and length are never the only signal.
export default function Meter({ label, value, lowBelow = 0 }) {
  const percent = Math.round(value * 100)
  return (
    <div className={value < lowBelow ? 'meter meter-low' : 'meter'}>
      <div className="meter-head">
        <span>{label}</span>
        <span className="meter-value">{percent}%</span>
      </div>
      <div
        className="meter-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        {/* React sets this through the DOM, which the Content-Security-Policy allows. */}
        <div className="meter-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

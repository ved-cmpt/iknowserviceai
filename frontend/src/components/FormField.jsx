import { useId } from 'react'

// Label, hint, error and character count, all wired to the control. The control comes from a
// render function that spreads the props it is given: {(field) => <input {...field} />}.
export default function FormField({ label, hint, error, required = false, count, max, children }) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const countId = `${id}-count`
  const describedBy =
    [hint && hintId, max && countId, error && errorId].filter(Boolean).join(' ') || undefined
  const over = max && count > max

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        {required && <span className="field-required"> (required)</span>}
      </label>
      {children({
        id,
        required: required || undefined,
        'aria-describedby': describedBy,
        'aria-invalid': error ? 'true' : undefined,
      })}
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {max !== undefined && (
        <p id={countId} className={over ? 'field-counter field-counter-over' : 'field-counter'}>
          {count} of {max} characters
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  )
}

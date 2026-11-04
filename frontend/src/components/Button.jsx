import { Link } from 'react-router-dom'

function buttonClass(variant, size, className) {
  return ['btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className].filter(Boolean).join(' ')
}

export default function Button({
  variant = 'primary',
  size,
  busy = false,
  disabled = false,
  type = 'button',
  className,
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {children}
    </button>
  )
}

export function ButtonLink({ variant = 'primary', size, className, children, ...rest }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  )
}

import { useId } from 'react'

// A titled card is a labelled region, so it appears in the landmark list for screen readers.
export default function Card({ title, titleLevel = 2, actions, as: Tag = 'section', className, children, ...rest }) {
  const headingId = useId()
  const Heading = `h${titleLevel}`
  const classes = ['card', className].filter(Boolean).join(' ')
  return (
    <Tag className={classes} aria-labelledby={title ? headingId : undefined} {...rest}>
      {(title || actions) && (
        <div className="card-header">
          {title && <Heading id={headingId}>{title}</Heading>}
          {actions}
        </div>
      )}
      {children}
    </Tag>
  )
}

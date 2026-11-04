// tone: info, success, warning or danger. Pass role="alert" for something that needs attention now.
export default function Banner({ tone = 'info', title, role, children }) {
  return (
    <div className={`banner banner-${tone}`} role={role}>
      {title && <strong className="banner-title">{title}</strong>}
      {children}
    </div>
  )
}

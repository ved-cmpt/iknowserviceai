import Icon from './icons'

// tone: info, success, warning or danger. Pass role="alert" for something that needs attention now.
export default function Banner({ tone = 'info', title, role, icon, children }) {
  const classes = ['banner', `banner-${tone}`, icon && 'banner-with-icon'].filter(Boolean).join(' ')
  return (
    <div className={classes} role={role}>
      {icon && <Icon name={icon} size={20} />}
      <div>
        {title && <strong className="banner-title">{title}</strong>}
        {children}
      </div>
    </div>
  )
}

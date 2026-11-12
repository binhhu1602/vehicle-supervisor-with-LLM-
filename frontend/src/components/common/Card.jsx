export function Card({ title, subtitle, actions, children, className = '', bodyClassName = '', flush = false, style }) {
  return (
    <section className={`card ${className}`} style={style}>
      {(title || actions) && (
        <header className="card-header">
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {subtitle && <div className="card-subtitle">{subtitle}</div>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className={`card-body ${flush ? 'flush' : ''} ${bodyClassName}`}>{children}</div>
    </section>
  );
}

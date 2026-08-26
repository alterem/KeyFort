import type { ReactNode } from 'react'

interface PageHeadingProps {
  kicker: string
  title: string
  description: string
  statusIcon: ReactNode
  statusLabel: string
  statusClassName?: string
}

export function PageHeading({
  kicker,
  title,
  description,
  statusIcon,
  statusLabel,
  statusClassName = '',
}: PageHeadingProps) {
  return (
    <div className="page-heading">
      <div>
        <span className="page-kicker">{kicker}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className={`security-pill ${statusClassName}`.trim()}>
        {statusIcon}
        {statusLabel}
      </div>
    </div>
  )
}

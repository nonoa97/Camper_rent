import { HTMLAttributes } from 'react'

export default function Card({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-xs)] transition-shadow duration-200 hover:shadow-[var(--shadow-md)] ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

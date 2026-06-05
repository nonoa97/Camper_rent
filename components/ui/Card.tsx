import { HTMLAttributes } from 'react'

export default function Card({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`border border-[#eeeeee] rounded-[10px] transition-shadow duration-200 hover:shadow-lg ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

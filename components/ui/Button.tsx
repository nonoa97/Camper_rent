import { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline'
}

export default function Button({ variant = 'primary', className = '', children, ...props }: ButtonProps) {
  const base = 'px-6 py-3 rounded-[4px] text-sm font-semibold transition-all duration-200 cursor-pointer'
  const variants = {
    primary: 'bg-white text-[#111111] hover:translate-y-[-2px] hover:shadow-md hover:bg-[#a8d8a8]',
    outline: 'border border-[#dddddd] text-[#111111] hover:border-[#1a3a2a] hover:text-[#1a3a2a]',
  }
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

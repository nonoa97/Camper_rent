import { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'dark'
}

export default function Button({ variant = 'primary', className = '', children, ...props }: ButtonProps) {
  const base = 'px-6 py-3 rounded-[var(--radius-lg)] text-sm font-semibold transition-all duration-200 cursor-pointer'
  const variants = {
    primary: 'bg-white text-[#111111] border border-[var(--color-border)] hover:bg-[var(--color-primary-light)] hover:border-[var(--color-primary-light)] hover:-translate-y-0.5',
    outline: 'border border-[var(--color-border)] text-[#111111] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
    dark: 'bg-[#111111] text-white hover:bg-[#333333]',
  }
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'

export function NavLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  const pad = usePathname()
  const actief = href === '/' ? pad === '/' : pad.startsWith(href)

  return (
    <Link
      href={href}
      aria-current={actief ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded px-2.5 py-1.5 text-sm transition-colors',
        actief
          ? 'bg-accent-soft font-medium text-accent'
          : 'text-ink-soft hover:bg-sunk hover:text-ink',
      )}
    >
      {children}
    </Link>
  )
}

import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

const badge = cva(
  'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        ok: 'bg-ok-bg text-ok',
        wait: 'bg-wait-bg text-wait',
        rest: 'bg-rest-bg text-rest',
        alarm: 'bg-alarm-bg text-alarm',
      },
    },
    defaultVariants: { tone: 'rest' },
  },
)

export function Badge({
  children,
  tone,
  className,
}: VariantProps<typeof badge> & { children: ReactNode; className?: string }) {
  return <span className={cn(badge({ tone }), className)}>{children}</span>
}

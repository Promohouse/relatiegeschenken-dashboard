'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LogOut } from 'lucide-react'

export function LogoutButton() {
  const router = useRouter()
  const [bezig, setBezig] = useState(false)

  return (
    <button
      type="button"
      disabled={bezig}
      onClick={async () => {
        setBezig(true)
        await fetch('/api/auth/sign-out', { method: 'POST' })
        router.replace('/login')
        router.refresh()
      }}
      className="flex items-center gap-2 rounded px-2.5 py-1.5 text-sm text-ink-faint transition-colors hover:bg-sunk hover:text-ink disabled:opacity-50"
    >
      <LogOut size={15} aria-hidden />
      {bezig ? 'Bezig…' : 'Uitloggen'}
    </button>
  )
}

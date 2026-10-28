'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function LoginForm({ verder }: { verder: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [wachtwoord, setWachtwoord] = useState('')
  const [fout, setFout] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)

  async function verstuur(event: React.FormEvent) {
    event.preventDefault()
    setFout(null)
    setBezig(true)
    try {
      const res = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: wachtwoord }),
      })
      if (!res.ok) {
        setFout(
          res.status === 401 || res.status === 400
            ? 'Dit e-mailadres en wachtwoord horen niet bij elkaar.'
            : 'Inloggen lukte niet. Probeer het zo nog eens.',
        )
        return
      }
      router.replace(verder)
      router.refresh()
    } catch {
      setFout('De server is niet bereikbaar.')
    } finally {
      setBezig(false)
    }
  }

  return (
    <form onSubmit={verstuur} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-ink-soft">
          E-mailadres
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="wachtwoord" className="text-sm font-medium text-ink-soft">
          Wachtwoord
        </label>
        <Input
          id="wachtwoord"
          type="password"
          autoComplete="current-password"
          required
          value={wachtwoord}
          onChange={(e) => setWachtwoord(e.target.value)}
        />
      </div>

      {fout && (
        <p role="alert" className="rounded border border-alarm/30 bg-alarm-bg px-3 py-2 text-sm text-alarm">
          {fout}
        </p>
      )}

      <Button type="submit" size="lg" disabled={bezig} className="mt-1">
        {bezig ? 'Bezig met inloggen…' : 'Inloggen'}
      </Button>
    </form>
  )
}

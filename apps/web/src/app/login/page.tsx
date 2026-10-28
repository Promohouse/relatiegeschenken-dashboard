import { LoginForm } from './login-form'

export default async function LoginPagina({
  searchParams,
}: {
  searchParams: Promise<{ verder?: string }>
}) {
  const { verder } = await searchParams
  const bestemming = verder?.startsWith('/') ? verder : '/'

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] text-ink-faint">
            Relatiegeschenken
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Hub</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Offertes, orders, drukproeven en inkoop op één plek.
          </p>
        </div>

        <div className="rounded-lg border border-rule bg-surface p-6">
          <LoginForm verder={bestemming} />
        </div>

        <p className="mt-6 text-xs leading-relaxed text-ink-faint">
          Wachtwoord vergeten? Herstel per e-mail werkt pas zodra de
          Microsoft&nbsp;365-koppeling er is. Vraag tot die tijd een beheerder om een nieuw
          wachtwoord.
        </p>
      </div>
    </main>
  )
}

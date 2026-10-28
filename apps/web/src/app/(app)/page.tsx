import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getCurrentUser } from '@/lib/session'

export default async function Dashboard() {
  const user = await getCurrentUser()

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Welkom, {user?.name.split(' ')[0]}</h1>
      <p className="mt-2 text-ink-soft">
        Het dashboard met openstaande offertes, wachtende drukproeven en vertraagde leveringen komt
        zodra de orderworkflow er is. Tot die tijd is dit het eerste stuk dat werkt.
      </p>

      <Link
        href="/klanten"
        className="mt-6 inline-flex items-center gap-2 rounded border border-rule bg-surface px-4 py-3 text-sm font-medium transition-colors hover:bg-sunk"
      >
        Naar klanten
        <ArrowRight size={15} aria-hidden />
      </Link>

      <div className="mt-10 rounded border border-rule bg-surface p-5">
        <h2 className="text-sm font-semibold">Wat er onder de motorkap al staat</h2>
        <ul className="mt-3 grid gap-1.5 text-sm text-ink-soft sm:grid-cols-2">
          <li>Offertes met onveranderlijke versies</li>
          <li>Orders met statussen per regel</li>
          <li>Drukproeven met goedkeuringshistorie</li>
          <li>Inkoop met deelontvangsten</li>
          <li>Zendingen met deelleveringen</li>
          <li>Prijsengine met staffels en margeregels</li>
          <li>Auditlog op elke wijziging</li>
          <li>Klantisolatie voor het latere portaal</li>
        </ul>
      </div>
    </div>
  )
}

import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { getCompany, getCurrentUser } from '@/lib/session'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const bedrijf = await getCompany()

  const demo = process.env.DEMO_MODE === 'true'

  return (
    <div className="flex min-h-screen">
      <Sidebar
        user={user}
        logoLicht={bedrijf?.logoLight || '/merk/promohouse-donker.png'}
        logoDonker={bedrijf?.logoDark || '/merk/promohouse-licht.png'}
        bedrijfsnaam={bedrijf?.name || 'Relatiegeschenken Hub'}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {demo && (
          <p className="border-b border-wait/25 bg-wait-bg px-6 py-1.5 text-center text-xs text-wait">
            Deze omgeving bevat demogegevens. Niets hiervan is echte klantdata.
          </p>
        )}
        <main className="min-w-0 flex-1 px-6 py-7 lg:px-10">{children}</main>
      </div>
    </div>
  )
}

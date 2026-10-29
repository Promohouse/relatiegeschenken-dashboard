import {
  Building2, ClipboardList, FileText, Folder, LayoutDashboard, Package,
  Truck, CheckSquare, Settings, Users, ShieldCheck, Receipt, Download, Calculator,
} from 'lucide-react'
import Image from 'next/image'
import { NavLink } from './nav-link'
import { LogoutButton } from './logout-button'
import { ThemaKeuze } from './thema-keuze'
import type { CurrentUser } from '@/lib/session'

/**
 * Wat gebouwd is staat bovenaan en is aanklikbaar. Wat nog komt staat eronder,
 * grijs en zonder link - zo is in één oogopslag duidelijk waar het project
 * staat, in plaats van dat je op een dode knop klikt.
 */
const GEBOUWD = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, permissie: null },
  { href: '/klanten', label: 'Klanten', icon: Building2, permissie: 'customers:view' },
  { href: '/beheer/gebruikers', label: 'Gebruikers', icon: Users, permissie: 'users:view' },
  { href: '/beheer/rollen', label: 'Rollen', icon: ShieldCheck, permissie: 'users:view' },
  { href: '/producten', label: 'Producten', icon: Package, permissie: 'products:view' },
  { href: '/calculator', label: 'Calculator', icon: Calculator, permissie: 'quotes:view' },
  { href: '/imports', label: 'Imports', icon: Download, permissie: 'imports:view' },
  {
    href: '/beheer/betalingsvoorwaarden', label: 'Betalingsvoorwaarden',
    icon: Receipt, permissie: 'settings:view',
  },
  { href: '/beheer/instellingen', label: 'Instellingen', icon: Settings, permissie: 'settings:view' },
]

const NOG_NIET = [
  { label: 'Offertes', icon: FileText },
  { label: 'Orders', icon: ClipboardList },
  { label: 'Leveranciers', icon: Truck },
  { label: 'Taken', icon: CheckSquare },
  { label: 'Documenten', icon: Folder },
]

export function Sidebar({
  user,
  logoLicht,
  logoDonker,
  bedrijfsnaam,
}: {
  user: CurrentUser
  /** Logo voor een lichte ondergrond. */
  logoLicht: string
  /** Logo voor een donkere ondergrond. */
  logoDonker: string
  bedrijfsnaam: string
}) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-rule bg-surface">
      <div className="px-4 py-5">
        {/* Twee bestanden in plaats van één gefilterd logo: het oranje
            vlaggetje moet in beide weergaven oranje blijven. */}
        <Image
          src={logoLicht}
          alt={bedrijfsnaam}
          width={538}
          height={323}
          priority
          className="logo-op-licht h-11 w-auto"
        />
        <Image
          src={logoDonker}
          alt=""
          aria-hidden
          width={538}
          height={323}
          className="logo-op-donker h-11 w-auto"
        />
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2">
        {GEBOUWD.filter((i) => !i.permissie || user.permissions.includes(i.permissie)).map(
          ({ href, label, icon: Icon }) => (
            <NavLink key={href} href={href}>
              <Icon size={15} aria-hidden />
              {label}
            </NavLink>
          ),
        )}

        <p className="mt-5 px-2.5 pb-1 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-ink-faint">
          Nog in aanbouw
        </p>
        {NOG_NIET.map(({ label, icon: Icon }) => (
          <span
            key={label}
            className="flex cursor-not-allowed items-center gap-2.5 rounded px-2.5 py-1.5 text-sm text-ink-faint/60"
            title="Deze module is nog niet gebouwd"
          >
            <Icon size={15} aria-hidden />
            {label}
          </span>
        ))}
      </nav>

      <div className="border-t border-rule px-2 py-3">
        <div className="px-2.5 pb-2">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-ink-faint">{user.email}</p>
        </div>
        <div className="px-1 pb-2">
          <ThemaKeuze huidig={user.themePreference} />
        </div>
        <LogoutButton />
      </div>
    </aside>
  )
}

import {
  Building2, ClipboardList, FileText, Folder, LayoutDashboard, Package,
  Truck, CheckSquare, Settings,
} from 'lucide-react'
import { NavLink } from './nav-link'
import { LogoutButton } from './logout-button'
import type { CurrentUser } from '@/lib/session'

/**
 * Wat gebouwd is staat bovenaan en is aanklikbaar. Wat nog komt staat eronder,
 * grijs en zonder link - zo is in één oogopslag duidelijk waar het project
 * staat, in plaats van dat je op een dode knop klikt.
 */
const GEBOUWD = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, permissie: null },
  { href: '/klanten', label: 'Klanten', icon: Building2, permissie: 'customers:view' },
]

const NOG_NIET = [
  { label: 'Offertes', icon: FileText },
  { label: 'Orders', icon: ClipboardList },
  { label: 'Producten', icon: Package },
  { label: 'Leveranciers', icon: Truck },
  { label: 'Taken', icon: CheckSquare },
  { label: 'Documenten', icon: Folder },
  { label: 'Instellingen', icon: Settings },
]

export function Sidebar({ user }: { user: CurrentUser }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-rule bg-surface">
      <div className="px-4 py-5">
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.16em] text-ink-faint">
          Relatiegeschenken
        </p>
        <p className="text-lg font-bold leading-tight tracking-tight">Hub</p>
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
        <div className="px-2.5 pb-1.5">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-ink-faint">{user.email}</p>
        </div>
        <LogoutButton />
      </div>
    </aside>
  )
}
